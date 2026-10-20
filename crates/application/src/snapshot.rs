use crate::{Binding, QuoteRequest, WorldQueryKind};
use orbit_engine::ScopeKey;
use orbit_engine::{GameState, Ruleset};
use serde::{Deserialize, Serialize};

pub enum FactQuery {
    Overview(Binding),
    Quote {
        binding: Binding,
        request: QuoteRequest,
    },
    World {
        binding: Binding,
        query: WorldQueryKind,
    },
}
pub struct ScopedSnapshot {
    pub state: GameState,
    pub rules: Ruleset,
    pub viewer_revision: i64,
    pub as_of_ms: i64,
    pub progress: SnapshotProgress,
}
impl ScopedSnapshot {
    pub fn into_quote(self) -> ReadSnapshot<(crate::QuoteSnapshot, i64)> {
        ReadSnapshot {
            facts: (
                crate::QuoteSnapshot {
                    state: self.state,
                    rules: self.rules,
                    at: self.as_of_ms,
                },
                self.viewer_revision,
            ),
            progress: self.progress,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ResolvedPosition {
    pub at_ms: i64,
    pub viewer_revision: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ScopeProgress {
    pub scope: ScopeKey,
    pub resolved: Option<ResolvedPosition>,
    /// Only this player's own admitted commands; hidden event deadlines stay private.
    pub next_unresolved: Option<i64>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct SnapshotProgress {
    pub sampled_at: i64,
    pub scopes: Vec<ScopeProgress>,
    pub minimum_revision_pending: bool,
    /// A due unresolved boundary beyond which confirmed production cannot be projected.
    #[serde(default)]
    pub projection_limit: Option<i64>,
    /// The mode-aware bridge accepts same-actor accepted creator command references.
    #[serde(default)]
    pub command_references: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ReadSnapshot<T> {
    #[serde(flatten)]
    pub facts: T,
    pub progress: SnapshotProgress,
}
impl<T> std::ops::Deref for ReadSnapshot<T> {
    type Target = T;
    fn deref(&self) -> &T {
        &self.facts
    }
}
impl<T> ReadSnapshot<T> {
    pub fn map<U>(self, f: impl FnOnce(T) -> U) -> ReadSnapshot<U> {
        ReadSnapshot {
            facts: f(self.facts),
            progress: self.progress,
        }
    }
    pub fn try_map<U, E>(self, f: impl FnOnce(T) -> Result<U, E>) -> Result<ReadSnapshot<U>, E> {
        Ok(ReadSnapshot {
            facts: f(self.facts)?,
            progress: self.progress,
        })
    }
}
