//! Operator-only configuration documents. Game HTTP protocols remain unchanged.
use crate::*;
use orbit_engine::*;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeSet;

#[derive(Clone, Debug)]
pub struct ActiveRules {
    pub revision: i64,
    pub rules: Ruleset,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RulesDocument {
    pub universe: UniverseId,
    pub base_revision: i64,
    pub artifact: RulesArtifact,
    pub speed: i32,
}
#[derive(Debug, Serialize)]
pub struct RuleChange {
    pub path: String,
    pub before: Option<Value>,
    pub after: Option<Value>,
}
#[derive(Debug, Serialize)]
pub struct RulesDiff {
    pub current_hash: Hash,
    pub proposed_hash: Hash,
    pub changes: Vec<RuleChange>,
    pub initialize: RulesCatalogDelta,
}
/// The proposal remains in memory; preview output shows its diff rather than a second rules file.
#[derive(Debug, Serialize)]
pub struct RulesUpgradePlan {
    pub release: &'static str,
    #[serde(skip)]
    pub document: RulesDocument,
    pub diff: RulesDiff,
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "status")]
pub enum RulesApplyOutcome {
    Applied {
        profile_hash: Hash,
        revision: i64,
        effective_at: Timestamp,
    },
    AlreadyActive {
        profile_hash: Hash,
        revision: i64,
    },
}
#[derive(Debug, thiserror::Error)]
pub enum RulesUpdateError {
    #[error(transparent)]
    StandardContent(#[from] StandardRulesError),
    #[error("invalid rules update: {reason}")]
    Invalid { reason: String },
    #[error(
        "rules changed since export (expected revision {expected_revision}, current {actual_revision}); export again"
    )]
    Stale {
        expected_revision: i64,
        actual_revision: i64,
    },
    #[error("universe has claimed or due work; wait for processing to catch up and retry")]
    Busy,
    #[error(
        "rules activation {id} is durably queued; retry the same document to observe its outcome"
    )]
    Pending { id: uuid::Uuid },
    #[error(transparent)]
    Store(#[from] StoreError),
}
impl From<RulesError> for RulesUpdateError {
    fn from(e: RulesError) -> Self {
        Self::Invalid {
            reason: e.to_string(),
        }
    }
}
pub trait RulesStore: Send + Sync {
    fn current_rules(
        &self,
        universe: UniverseId,
    ) -> impl Future<Output = Result<ActiveRules, RulesUpdateError>> + Send;
    fn apply_rules(
        &self,
        universe: UniverseId,
        expected_revision: i64,
        next: &Ruleset,
    ) -> impl Future<Output = Result<RulesApplyOutcome, RulesUpdateError>> + Send;
}
pub struct RulesService<S: RulesStore> {
    store: S,
}
impl<S: RulesStore> RulesService<S> {
    pub fn new(store: S) -> Self {
        Self { store }
    }
    pub async fn prepare_upgrade(
        &self,
        universe: UniverseId,
    ) -> Result<RulesUpgradePlan, RulesUpdateError> {
        let mut document = self.export(universe).await?;
        let current = proposed(&document)?;
        let next = upgrade_standard_rules(&current)?;
        document.artifact = next.artifact;
        let diff = self.diff(&document).await?;
        Ok(RulesUpgradePlan {
            release: STANDARD_RULES_RELEASE,
            document,
            diff,
        })
    }
    pub async fn export(&self, universe: UniverseId) -> Result<RulesDocument, RulesUpdateError> {
        let current = self.store.current_rules(universe).await?;
        Ok(RulesDocument {
            universe,
            base_revision: current.revision,
            artifact: current.rules.artifact,
            speed: current.rules.speed,
        })
    }
    pub async fn diff(&self, document: &RulesDocument) -> Result<RulesDiff, RulesUpdateError> {
        validate_document(document)?;
        let current = self.store.current_rules(document.universe).await?;
        validate_rules_document_immutable(&current.rules, document)?;
        let next = proposed(document)?;
        if current.rules.hash != next.hash && current.revision != document.base_revision {
            return Err(RulesUpdateError::Stale {
                expected_revision: document.base_revision,
                actual_revision: current.revision,
            });
        }
        let initialize = validate_rules_update(&current.rules, &next)?;
        let mut changes = vec![];
        difference(
            "",
            Some(&serde_json::to_value(&current.rules.artifact).expect("rules serialize")),
            Some(&serde_json::to_value(&next.artifact).expect("rules serialize")),
            &mut changes,
        );
        Ok(RulesDiff {
            current_hash: current.rules.hash,
            proposed_hash: next.hash,
            changes,
            initialize,
        })
    }
    pub async fn apply(
        &self,
        document: &RulesDocument,
    ) -> Result<RulesApplyOutcome, RulesUpdateError> {
        validate_document(document)?;
        let current = self.store.current_rules(document.universe).await?;
        validate_rules_document_immutable(&current.rules, document)?;
        let next = proposed(document)?;
        self.store
            .apply_rules(document.universe, document.base_revision, &next)
            .await
    }
}
fn validate_document(document: &RulesDocument) -> Result<(), RulesUpdateError> {
    if document.base_revision < 0 || document.universe.0.is_nil() {
        return Err(RulesUpdateError::Invalid {
            reason: "universe and base revision must identify the exported configuration".into(),
        });
    }
    Ok(())
}
/// Report immutable edits before rebuilding rules, including edits invalid for a legacy profile.
pub fn validate_rules_document_immutable(
    current: &Ruleset,
    document: &RulesDocument,
) -> Result<(), RulesUpdateError> {
    let invalid = |field| RulesUpdateError::Invalid {
        reason: format!("immutable.{field} cannot change after universe creation"),
    };
    if current.speed != document.speed {
        return Err(invalid("speed"));
    }
    match (&current.artifact.universe, &document.artifact.universe) {
        (Some(current), Some(next)) => {
            for (field, changed) in [
                ("galaxies", current.galaxies != next.galaxies),
                (
                    "systems_per_galaxy",
                    current.systems_per_galaxy != next.systems_per_galaxy,
                ),
                (
                    "positions_per_system",
                    current.positions_per_system != next.positions_per_system,
                ),
            ] {
                if changed {
                    return Err(invalid(field));
                }
            }
        }
        (None, None) => {}
        _ => return Err(invalid("universe")),
    }
    Ok(())
}
fn proposed(document: &RulesDocument) -> Result<Ruleset, RulesUpdateError> {
    Ok(Ruleset::from_artifact(
        document.artifact.clone(),
        document.speed,
    )?)
}
fn difference(
    path: &str,
    before: Option<&Value>,
    after: Option<&Value>,
    changes: &mut Vec<RuleChange>,
) {
    if before == after {
        return;
    }
    if let (Some(Value::Object(a)), Some(Value::Object(b))) = (before, after) {
        for key in a.keys().chain(b.keys()).collect::<BTreeSet<_>>() {
            difference(
                &format!("{path}/{}", key.replace('~', "~0").replace('/', "~1")),
                a.get(key),
                b.get(key),
                changes,
            );
        }
    } else {
        changes.push(RuleChange {
            path: path.into(),
            before: before.cloned(),
            after: after.cloned(),
        });
    }
}
