//! Maintenance activation and atomic enrollment; no historical accomplishment scan.
use crate::{ordering::*, *};
use orbit_engine::*;
use sqlx::Row;
use std::collections::BTreeMap;

pub(crate) async fn enroll(
    tx: &mut Tx<'_>,
    u: UniverseId,
    epoch: Epoch,
    player: PlayerId,
    at: i64,
    human: bool,
    beginner: bool,
) -> Result<(), StoreError> {
    let enabled: bool =
        sqlx::query_scalar("SELECT tutorial_enabled FROM universe_runtime WHERE universe=$1")
            .bind(u.0)
            .fetch_one(&mut **tx)
            .await
            .map_err(db_error)?;
    if !enabled {
        return Ok(());
    }
    let program = tutorial_program();
    let run = ObjectiveRun {
        id: objective_run_id(u, epoch, player, &program.id),
        universe: u,
        epoch,
        beneficiary: player,
        program,
        enrolled_at: OrderKey {
            at_ms: at,
            phase: 0,
            ordinal: 0,
        },
        evidence: vec![],
        receipts: BTreeMap::new(),
    };
    run.validate().map_err(|_| StoreError::CorruptData)?;
    sqlx::query("INSERT INTO objective_runs(id,universe,epoch,beneficiary,program,data) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING")
        .bind(run.id.0).bind(u.0).bind(epoch.0).bind(player.0).bind(TUTORIAL_PROGRAM).bind(sqlx::types::Json(run)).execute(&mut **tx).await.map_err(db_error)?;
    sqlx::query("INSERT INTO tutorial_preferences(universe,epoch,player,data) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING")
        .bind(u.0).bind(epoch.0).bind(player.0).bind(sqlx::types::Json(TutorialPreference { beginner: human && beginner })).execute(&mut **tx).await.map_err(db_error)?;
    refresh_enrollment_scopes(tx, u, player).await?;
    Ok(())
}
pub(crate) async fn load(
    tx: &mut Tx<'_>,
    u: UniverseId,
    epoch: Epoch,
    owners: &[uuid::Uuid],
) -> Result<BTreeMap<PlayerId, TutorialPreference>, StoreError> {
    let rows = sqlx::query("SELECT player,data FROM tutorial_preferences WHERE universe=$1 AND epoch=$2 AND player=ANY($3)").bind(u.0).bind(epoch.0).bind(owners).fetch_all(&mut **tx).await.map_err(db_error)?;
    rows.into_iter()
        .map(|r| {
            Ok((
                PlayerId(r.try_get("player").map_err(db_error)?),
                decode(r.try_get("data").map_err(db_error)?)?,
            ))
        })
        .collect()
}
pub(crate) async fn save(
    tx: &mut Tx<'_>,
    i: &OrderedInput,
    old: &WorldRecords,
    next: &WorldRecords,
) -> Result<(), StoreError> {
    if old
        .tutorial_preferences
        .keys()
        .ne(next.tutorial_preferences.keys())
    {
        return Err(StoreError::CorruptData);
    }
    for (player, value) in &next.tutorial_preferences {
        let before = &old.tutorial_preferences[player];
        if before == value {
            continue;
        }
        if i.actor != Actor::Player(*player)
            || !matches!(i.payload, Input::Command(Command::World { action: WorldAction::SetTutorialPresentation { beginner } }) if beginner == value.beginner)
        {
            return Err(StoreError::CorruptData);
        }
        let result = sqlx::query("UPDATE tutorial_preferences SET data=$4 WHERE universe=$1 AND epoch=$2 AND player=$3 AND data=$5")
            .bind(i.universe.0).bind(i.epoch.0).bind(player.0).bind(sqlx::types::Json(value)).bind(sqlx::types::Json(before)).execute(&mut **tx).await.map_err(db_error)?;
        if result.rows_affected() != 1 {
            return Err(StoreError::Conflict);
        }
    }
    Ok(())
}
impl PgStore {
    /// All servers must be stopped and every binary upgraded before invoking.
    /// The existing exclusive server guard enforces the stopped-server boundary.
    /// Pending work is retained and re-scoped before grants or sites are enabled.
    pub async fn activate_tutorial(
        &self,
        u: UniverseId,
        all_binaries_ready: bool,
    ) -> Result<usize, StoreError> {
        if !all_binaries_ready {
            return Err(StoreError::Conflict);
        }
        let mut tx = self.begin_tx(&self.pool).await?;
        let exclusive: bool = sqlx::query_scalar("SELECT pg_try_advisory_xact_lock(901321)")
            .fetch_one(&mut *tx)
            .await
            .map_err(db_error)?;
        if !exclusive {
            return Err(StoreError::Conflict);
        }
        crate::runtime_barriers::enrollment_gate(&mut tx, u).await?;
        gate(&mut tx, u).await?;
        let runtime = sqlx::query("SELECT tutorial_enabled,ordering_floor,frontier FROM universe_runtime WHERE universe=$1 FOR UPDATE").bind(u.0).fetch_one(&mut *tx).await.map_err(db_error)?;
        if runtime
            .try_get::<bool, _>("tutorial_enabled")
            .map_err(db_error)?
        {
            return Ok(0);
        }
        let barrier: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM runtime_barriers WHERE universe=$1 AND NOT done)",
        )
        .bind(u.0)
        .fetch_one(&mut *tx)
        .await
        .map_err(db_error)?;
        if barrier {
            return Err(StoreError::Conflict);
        }
        let rules = crate::facts::rules(&mut tx, u).await?;
        if !tutorial_encounters_safe(&rules).map_err(|_| StoreError::UnsupportedState)? {
            return Err(StoreError::UnsupportedState);
        }
        tutorial_program()
            .validate(&rules)
            .map_err(|_| StoreError::UnsupportedState)?;
        for cargo in [false, true] {
            tutorial_site_definition(cargo)
                .validate(&rules)
                .map_err(|_| StoreError::UnsupportedState)?;
        }
        let epoch = Epoch(
            sqlx::query_scalar("SELECT epoch FROM universes WHERE id=$1")
                .bind(u.0)
                .fetch_one(&mut *tx)
                .await
                .map_err(db_error)?,
        );
        let frontier: i64 = sqlx::query_scalar(
            "SELECT coalesce(max(frontier),0) FROM execution_scopes WHERE universe=$1",
        )
        .bind(u.0)
        .fetch_one(&mut *tx)
        .await
        .map_err(db_error)?;
        let at = now(&mut tx)
            .await?
            .max(frontier)
            .max(runtime.try_get("ordering_floor").map_err(db_error)?)
            .max(runtime.try_get("frontier").map_err(db_error)?);
        // Invisible until the transaction commits. Fences invalidate pre-maintenance claims.
        sqlx::query("UPDATE universe_runtime SET tutorial_enabled=true,site_fleets_enabled=true,ordering_floor=greatest(ordering_floor,$2),fence=fence+1,claim_input=NULL,claim_owner=NULL,claim_token=NULL,lease_until=NULL WHERE universe=$1").bind(u.0).bind(at).execute(&mut *tx).await.map_err(db_error)?;
        sqlx::query("UPDATE execution_scopes SET fence=fence+1,claim_input=NULL,claim_owner=NULL,claim_token=NULL,lease_until=NULL WHERE universe=$1").bind(u.0).execute(&mut *tx).await.map_err(db_error)?;
        let players: Vec<uuid::Uuid> =
            sqlx::query_scalar("SELECT id FROM players WHERE universe=$1 ORDER BY id")
                .bind(u.0)
                .fetch_all(&mut *tx)
                .await
                .map_err(db_error)?;
        for player in &players {
            let machine: bool = sqlx::query_scalar(
                "SELECT EXISTS(SELECT 1 FROM bot_participation WHERE universe=$1 AND player=$2)",
            )
            .bind(u.0)
            .bind(player)
            .fetch_one(&mut *tx)
            .await
            .map_err(db_error)?;
            enroll(&mut tx, u, epoch, PlayerId(*player), at, !machine, false).await?;
        }
        let pending: Vec<serde_json::Value> = sqlx::query_scalar(
            "SELECT input FROM pending_inputs WHERE universe=$1 ORDER BY at_ms,phase,sequence",
        )
        .bind(u.0)
        .fetch_all(&mut *tx)
        .await
        .map_err(db_error)?;
        for value in pending {
            let input = ordered_input(value)?;
            let scopes = crate::scoped_facts::select(&mut tx, u, input.actor, &input.payload)
                .await?
                .scopes();
            crate::admission::register(&mut tx, &input, &scopes).await?;
        }
        sqlx::query("UPDATE viewer_heads SET revision=revision+1 WHERE universe=$1")
            .bind(u.0)
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        sqlx::query("UPDATE world_heads SET revision=revision+1 WHERE universe=$1")
            .bind(u.0)
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        tx.commit().await.map_err(db_error)?;
        Ok(players.len())
    }
}

pub(crate) async fn add_site_scopes(
    tx: &mut Tx<'_>,
    u: UniverseId,
    scopes: &mut std::collections::BTreeSet<ScopeKey>,
) -> Result<(), StoreError> {
    let owners: Vec<_> = scopes
        .iter()
        .filter_map(|scope| match scope {
            ScopeKey::Player(player) => Some(player.0),
            _ => None,
        })
        .collect();
    let enrolled: Vec<(uuid::Uuid,uuid::Uuid)> = sqlx::query_as("SELECT beneficiary,r.epoch FROM objective_runs r JOIN universes u ON u.id=r.universe AND u.epoch=r.epoch WHERE r.universe=$1 AND r.program=$2 AND r.beneficiary=ANY($3)").bind(u.0).bind(TUTORIAL_PROGRAM).bind(owners).fetch_all(&mut **tx).await.map_err(db_error)?;
    for (player, epoch) in enrolled {
        for cargo in [false, true] {
            scopes.insert(ScopeKey::Site(
                tutorial_site_key(u, Epoch(epoch), PlayerId(player), cargo).id(),
            ));
        }
    }
    Ok(())
}

/// Signup seeds cleanup before writing its manifest/program. Refresh after the
/// complete enrollment source is visible, within that same transaction.
pub(crate) async fn refresh_enrollment_scopes(
    tx: &mut Tx<'_>,
    u: UniverseId,
    player: PlayerId,
) -> Result<(), StoreError> {
    crate::empire_deletion::refresh_checks(
        tx,
        u,
        &std::collections::BTreeSet::from([player]),
        InputId::default(),
    )
    .await
}
