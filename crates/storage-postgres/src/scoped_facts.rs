//! Resolve identities before loading economies. Runtime work is bounded by participants.
use crate::{ordering::*, *};
use orbit_application::*;
use orbit_engine::*;
use std::collections::BTreeSet;

impl PgStore {
    pub async fn load_scoped_snapshot(
        &self,
        query: FactQuery,
    ) -> Result<ScopedSnapshot, StoreError> {
        let result = match query {
            FactQuery::Overview(binding) => self.world_snapshot(binding).await?,
            FactQuery::Quote { binding, request } => {
                self.quote_checked(
                    Actor::Player(binding.player),
                    binding.universe,
                    &request,
                    Some(binding),
                )
                .await?
            }
            FactQuery::World { binding, query } => {
                self.world_snapshot_query(binding, Some(&query)).await?
            }
        };
        let (facts, viewer_revision) = result.facts;
        Ok(ScopedSnapshot {
            state: facts.state,
            rules: facts.rules,
            as_of_ms: facts.at,
            viewer_revision,
            progress: result.progress,
        })
    }
}

#[derive(Default)]
pub(crate) struct Selection {
    pub owners: BTreeSet<PlayerId>,
    pub coordinates: BTreeSet<Coordinates>,
    pub incoming_for: Option<PlayerId>,
    pub all: bool,
}

impl Selection {
    pub fn scopes(&self) -> BTreeSet<ScopeKey> {
        self.owners
            .iter()
            .copied()
            .map(ScopeKey::Player)
            .chain(self.coordinates.iter().copied().map(ScopeKey::Location))
            .collect()
    }
}

pub(crate) async fn select(
    tx: &mut Tx<'_>,
    u: UniverseId,
    actor: Actor,
    input: &Input,
) -> Result<Selection, StoreError> {
    let refs = crate::scope_references::load(tx, u, input).await?;
    let scopes = match (actor, input) {
        (Actor::Player(player), Input::Command(command)) => {
            command_scopes(player, command, &refs).map_err(|_| StoreError::CorruptData)?
        }
        (Actor::Scheduler, Input::Event(event)) => {
            event_scopes(event, &refs).map_err(|_| StoreError::CorruptData)?
        }
        _ => return Err(StoreError::CorruptData),
    };
    Ok(from_scopes(&scopes))
}
pub(crate) fn from_scopes(scopes: &BTreeSet<ScopeKey>) -> Selection {
    let mut selected = Selection::default();
    for scope in scopes {
        match scope {
            ScopeKey::Player(player) => {
                selected.owners.insert(*player);
            }
            ScopeKey::Location(coords) => {
                selected.coordinates.insert(*coords);
            }
        }
    }
    selected
}

pub(crate) async fn select_query(
    tx: &mut Tx<'_>,
    b: Binding,
    query: &WorldQueryKind,
    rules: &Ruleset,
) -> Result<Selection, StoreError> {
    if let WorldQueryKind::MissileQuote { intent } = query {
        return select(
            tx,
            b.universe,
            Actor::Player(b.player),
            &Input::Command(Command::World {
                action: WorldAction::LaunchMissiles {
                    intent: intent.clone(),
                    expected_terms_hash: Hash(String::new()),
                },
            }),
        )
        .await;
    }
    if let WorldQueryKind::FleetQuote { intent } | WorldQueryKind::FleetEstimate { intent } = query
    {
        return select(
            tx,
            b.universe,
            Actor::Player(b.player),
            &Input::Command(Command::World {
                action: WorldAction::LaunchFleet {
                    intent: intent.clone(),
                    expected_terms_hash: Hash(String::new()),
                },
            }),
        )
        .await;
    }
    let mut selected = Selection::default();
    selected.owners.insert(b.player);
    match query {
        WorldQueryKind::AbandonmentQuote { .. } => {}
        WorldQueryKind::Galaxy { galaxy, system } => {
            let dimensions = rules
                .artifact
                .universe
                .as_ref()
                .ok_or(StoreError::CorruptData)?;
            if dimensions.contains(Coordinates {
                galaxy: *galaxy,
                system: *system,
                position: 1,
            }) {
                for position in 1..=dimensions.positions_per_system {
                    selected.coordinates.insert(Coordinates {
                        galaxy: *galaxy,
                        system: *system,
                        position,
                    });
                }
            }
        }
        WorldQueryKind::ResolveDestination { selection } => {
            let (DestinationSelection::BodyAt { coordinates, .. }
            | DestinationSelection::EmptyPositionAt { coordinates }
            | DestinationSelection::DebrisAt { coordinates }) = selection;
            selected.coordinates.insert(*coordinates);
        }
        WorldQueryKind::FleetQuote { .. }
        | WorldQueryKind::FleetEstimate { .. }
        | WorldQueryKind::MissileQuote { .. } => unreachable!(),
    }
    for coords in &selected.coordinates {
        let owners: Vec<uuid::Uuid> = sqlx::query_scalar("SELECT owner FROM bodies WHERE universe=$1 AND galaxy=$2 AND system=$3 AND position=$4")
            .bind(b.universe.0).bind(coords.galaxy as i64).bind(coords.system as i64).bind(coords.position as i64)
            .fetch_all(&mut **tx).await.map_err(db_error)?;
        selected.owners.extend(owners.into_iter().map(PlayerId));
    }
    Ok(selected)
}

pub(crate) async fn load_execution(
    tx: &mut Tx<'_>,
    input: &OrderedInput,
    scopes: &BTreeSet<ScopeKey>,
) -> Result<ClaimSnapshot, StoreError> {
    let rules = crate::facts::rules(tx, input.universe).await?;
    let state = load_execution_with_rules(tx, input, scopes, &rules).await?;
    Ok(ClaimSnapshot { state, rules })
}

/// Reuse rules validated from this transaction's universe snapshot.
pub(crate) async fn load_execution_with_rules(
    tx: &mut Tx<'_>,
    input: &OrderedInput,
    scopes: &BTreeSet<ScopeKey>,
    rules: &Ruleset,
) -> Result<GameState, StoreError> {
    let mut selected = Selection::default();
    for scope in scopes {
        match scope {
            ScopeKey::Player(player) => {
                selected.owners.insert(*player);
            }
            ScopeKey::Location(coords) => {
                selected.coordinates.insert(*coords);
            }
        }
    }
    if !rules.world() {
        let state = crate::facts::load(
            tx,
            input.universe,
            input.epoch,
            rules,
            input.actor,
            &input.payload,
            Some(input.id),
        )
        .await?;
        return Ok(state);
    }
    let state = crate::world::load_selected(
        tx,
        input.universe,
        input.epoch,
        rules,
        &input.payload,
        Some(input.id),
        selected,
    )
    .await?;
    Ok(state)
}
