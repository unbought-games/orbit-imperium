//! Atomic enrollment and presentation preferences; no historical accomplishment scan.
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
) -> Result<(), StoreError> {
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
        .bind(u.0).bind(epoch.0).bind(player.0).bind(sqlx::types::Json(TutorialPreference { beginner: human })).execute(&mut **tx).await.map_err(db_error)?;
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
