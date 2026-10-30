use crate::{ordering::*, *};
use orbit_application::*;
use orbit_engine::*;
use sqlx::Row;

impl RulesStore for PgStore {
    async fn current_rules(&self, universe: UniverseId) -> Result<ActiveRules, RulesUpdateError> {
        let mut tx = crate::snapshots::begin(self, &self.pool).await?;
        let current = active(&mut tx, universe).await?;
        tx.commit().await.map_err(db_error)?;
        Ok(current)
    }
    async fn apply_rules(
        &self,
        universe: UniverseId,
        expected_revision: i64,
        next: &Ruleset,
    ) -> Result<RulesApplyOutcome, RulesUpdateError> {
        next.validate()?;
        if self.runtime_mode(universe).await?.mode == ExecutorMode::Scoped {
            return self
                .apply_scoped_rules(universe, expected_revision, next)
                .await;
        }
        let mut tx = self.begin_tx(&self.pool).await?;
        let row = gate(&mut tx, universe).await?;
        if crate::admission::is_scoped(&mut tx, universe).await? {
            tx.rollback().await.map_err(db_error)?;
            return self
                .apply_scoped_rules(universe, expected_revision, next)
                .await;
        }
        crate::runtime_barriers::enrollment_gate(&mut tx, universe).await?;
        let current = active(&mut tx, universe).await?;
        if current.rules.equivalent(next) {
            return Ok(RulesApplyOutcome::AlreadyActive {
                profile_hash: current.rules.hash.clone(),
                revision: current.revision,
            });
        }
        if expected_revision != current.revision {
            return Err(RulesUpdateError::Stale {
                expected_revision,
                actual_revision: current.revision,
            });
        }
        let delta = validate_rules_update(&current.rules, next)?;
        let at = ensure_fresh(&mut tx, universe).await.map_err(|e| match e {
            StoreError::Unavailable => RulesUpdateError::Busy,
            e => RulesUpdateError::Store(e),
        })?;
        let epoch = Epoch(row.try_get("epoch").map_err(db_error)?);
        let sequence = next_sequence(&mut tx, universe).await?;
        let result = publish(
            &mut tx,
            Boundary {
                universe,
                epoch,
                current: &current,
                next,
                delta: &delta,
                at,
                sequence,
            },
        )
        .await?;
        tx.commit().await.map_err(db_error)?;
        Ok(result)
    }
}
pub(crate) async fn active(
    tx: &mut Tx<'_>,
    universe: UniverseId,
) -> Result<ActiveRules, RulesUpdateError> {
    let rules = crate::facts::rules(tx, universe).await?;
    let revision = sqlx::query_scalar("SELECT rules_revision FROM universes WHERE id=$1")
        .bind(universe.0)
        .fetch_one(&mut **tx)
        .await
        .map_err(db_error)?;
    Ok(ActiveRules { revision, rules })
}

async fn load_states(
    tx: &mut Tx<'_>,
    u: UniverseId,
    epoch: Epoch,
    rules: &Ruleset,
) -> Result<Vec<GameState>, StoreError> {
    let players: Vec<uuid::Uuid> =
        sqlx::query_scalar("SELECT id FROM players WHERE universe=$1 ORDER BY id")
            .bind(u.0)
            .fetch_all(&mut **tx)
            .await
            .map_err(db_error)?;
    if players.is_empty() {
        return Ok(vec![]);
    }
    let input = Input::Command(Command::RecallFleet {
        fleet: FleetId::default(),
    });
    if rules.world() {
        return Ok(vec![
            crate::world::load(tx, u, epoch, rules, &input, None).await?,
        ]);
    }
    let mut states = vec![];
    for player in players {
        states.push(
            crate::progression_state::load(
                tx,
                u,
                epoch,
                rules,
                Actor::Player(PlayerId(player)),
                &input,
                None,
            )
            .await?,
        );
    }
    Ok(states)
}
async fn settle_and_initialize(
    tx: &mut Tx<'_>,
    state: &mut GameState,
    current: &Ruleset,
    next: &Ruleset,
    delta: &RulesCatalogDelta,
    at: Timestamp,
) -> Result<(), StoreError> {
    let satellite_counts = state
        .bodies
        .values()
        .map(|body| solar_satellite_count(state, body, current).map(|count| (body.id, count)))
        .collect::<Result<std::collections::BTreeMap<_, _>, _>>()
        .map_err(|_| StoreError::CorruptData)?;
    for body in state.bodies.values_mut() {
        body.checkpoint = settle_rules_boundary(
            body,
            &state.production_settings[&body.id].settings,
            satellite_counts[&body.id],
            state.research[&body.owner].levels[&ResearchId::EnergyTechnology],
            at,
            current,
        )
        .map_err(|_| StoreError::CorruptData)?;
        body.revision = body
            .revision
            .checked_add(1)
            .ok_or(StoreError::CorruptData)?;
        for key in &delta.add_buildings {
            body.levels.insert(*key, 0);
        }
    }
    for research in state.research.values_mut() {
        for key in &delta.add_research {
            research.levels.insert(*key, 0);
        }
    }
    state.profile_hash = next.hash.clone();
    for body in state.bodies.values() {
        validate_body(state, body.id, next).map_err(|_| StoreError::CorruptData)?;
        if let Some(rule) = missile_rules(next) {
            let slots = silo_capacity(state, body, rule).map_err(|_| StoreError::CorruptData)?;
            if slots.occupied + slots.reserved > slots.total {
                return Err(StoreError::GameRejected(GameError::CapacityReserved));
            }
        }
        // Validate new production/capacity terms before publishing the profile.
        settle_rules_boundary(
            body,
            &state.production_settings[&body.id].settings,
            satellite_counts[&body.id],
            state.research[&body.owner].levels[&ResearchId::EnergyTechnology],
            at,
            next,
        )
        .map_err(|_| StoreError::CorruptData)?;
        let count=sqlx::query("UPDATE bodies SET amounts=$2,carry=$3,checkpoint_at=$4,revision=$5 WHERE id=$1 AND revision=$6")
            .bind(body.id.0).bind(sqlx::types::Json(body.checkpoint.amounts)).bind(sqlx::types::Json(body.checkpoint.carry))
            .bind(at).bind(body.revision).bind(body.revision-1).execute(&mut **tx).await.map_err(db_error)?;
        if count.rows_affected() != 1 {
            return Err(StoreError::Conflict);
        }
        for key in &delta.add_buildings {
            sqlx::query("INSERT INTO building_levels(body,building,level) VALUES($1,$2,0)")
                .bind(body.id.0)
                .bind(format!("{key:?}"))
                .execute(&mut **tx)
                .await
                .map_err(db_error)?;
        }
    }
    if !delta.add_research.is_empty() {
        for research in state.research.values() {
            let revision = research
                .revision
                .checked_add(1)
                .ok_or(StoreError::CorruptData)?;
            for key in &delta.add_research {
                sqlx::query(
                    "INSERT INTO research_levels(owner,research,level,revision) VALUES($1,$2,0,$3)",
                )
                .bind(research.owner.0)
                .bind(format!("{key:?}"))
                .bind(revision)
                .execute(&mut **tx)
                .await
                .map_err(db_error)?;
            }
            sqlx::query("UPDATE research_levels SET revision=$2 WHERE owner=$1")
                .bind(research.owner.0)
                .bind(revision)
                .execute(&mut **tx)
                .await
                .map_err(db_error)?;
            sqlx::query("UPDATE collection_heads SET revision=revision+1 WHERE universe=$1 AND kind='research' AND key=$2")
                .bind(state.universe.0).bind(research.owner.0).execute(&mut **tx).await.map_err(db_error)?;
        }
    }
    Ok(())
}

pub(crate) struct Boundary<'a> {
    pub universe: UniverseId,
    pub epoch: Epoch,
    pub current: &'a ActiveRules,
    pub next: &'a Ruleset,
    pub delta: &'a RulesCatalogDelta,
    pub at: Timestamp,
    pub sequence: i64,
}
pub(crate) async fn publish(
    tx: &mut Tx<'_>,
    boundary: Boundary<'_>,
) -> Result<RulesApplyOutcome, RulesUpdateError> {
    let Boundary {
        universe,
        epoch,
        current,
        next,
        delta,
        at,
        sequence,
    } = boundary;
    let states = load_states(tx, universe, epoch, &current.rules).await?;
    for mut state in states {
        crate::facts::validate_rule_references(tx, &state).await?;
        settle_and_initialize(tx, &mut state, &current.rules, next, delta, at).await?;
    }
    sqlx::query("INSERT INTO rulesets(hash,id,profile) VALUES($1,$2,$3) ON CONFLICT DO NOTHING")
        .bind(&next.hash.0)
        .bind(&next.artifact.id)
        .bind(sqlx::types::Json(next))
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
    let saved: serde_json::Value = sqlx::query_scalar("SELECT profile FROM rulesets WHERE hash=$1")
        .bind(&next.hash.0)
        .fetch_one(&mut **tx)
        .await
        .map_err(db_error)?;
    if decode::<Ruleset>(saved)? != *next {
        return Err(StoreError::CorruptData.into());
    }
    let revision = current
        .revision
        .checked_add(1)
        .ok_or(StoreError::CorruptData)?;
    sqlx::query("UPDATE universes SET profile_hash=$2,rules_revision=$3,speed=$4 WHERE id=$1")
        .bind(universe.0)
        .bind(&next.hash.0)
        .bind(revision)
        .bind(next.speed)
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
    if !crate::admission::is_scoped(tx, universe).await? {
        sqlx::query("UPDATE universe_runtime SET frontier=$2 WHERE universe=$1")
            .bind(universe.0)
            .bind(at)
            .execute(&mut **tx)
            .await
            .map_err(db_error)?;
    }
    sqlx::query("INSERT INTO rules_activations(universe,revision,previous_hash,next_hash,effective_at,sequence) VALUES($1,$2,$3,$4,$5,$6)")
        .bind(universe.0).bind(revision).bind(&current.rules.hash.0).bind(&next.hash.0).bind(at).bind(sequence)
        .execute(&mut **tx).await.map_err(db_error)?;
    let generation: i64 =
        sqlx::query_scalar("SELECT mode_generation FROM universe_runtime WHERE universe=$1")
            .bind(universe.0)
            .fetch_one(&mut **tx)
            .await
            .map_err(db_error)?;
    sqlx::query("UPDATE viewer_heads SET revision=revision+1,changed_at=$2,changed_at_generation=$3 WHERE universe=$1")
        .bind(universe.0)
        .bind(at)
        .bind(generation)
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
    sqlx::query("UPDATE world_heads SET revision=revision+1 WHERE universe=$1")
        .bind(universe.0)
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
    crate::updates::append_configuration_updates(tx, universe, epoch, revision).await?;
    Ok(RulesApplyOutcome::Applied {
        profile_hash: next.hash.clone(),
        revision,
        effective_at: at,
    })
}
