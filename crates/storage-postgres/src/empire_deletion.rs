//! Durable empire removal, sharing the engine scheduler and social transaction lock.
use crate::{ordering::*, *};
use orbit_application::*;
use orbit_engine::*;
use sqlx::Row;
use std::collections::BTreeSet;
use uuid::Uuid;

pub(crate) async fn scopes(
    tx: &mut Tx<'_>,
    u: UniverseId,
    player: PlayerId,
) -> Result<BTreeSet<ScopeKey>, StoreError> {
    let mut scopes = BTreeSet::from([ScopeKey::Player(player)]);
    for row in
        sqlx::query("SELECT galaxy,system,position FROM bodies WHERE universe=$1 AND owner=$2")
            .bind(u.0)
            .bind(player.0)
            .fetch_all(&mut **tx)
            .await
            .map_err(db_error)?
    {
        scopes.insert(ScopeKey::Location(Coordinates {
            galaxy: row.get::<i32, _>("galaxy") as u32,
            system: row.get::<i32, _>("system") as u32,
            position: row.get::<i32, _>("position") as u32,
        }));
    }
    let fleets: Vec<serde_json::Value> = sqlx::query_scalar("SELECT data FROM mission_fleets WHERE universe=$1 AND (owner=$2 OR (data->'intent'->>'mission'='Hold' AND data->'authorization'->>'target_owner'=$3)) AND data->>'leg' IN ('Outbound','Returning','Holding')")
        .bind(u.0).bind(player.0).bind(player.to_string()).fetch_all(&mut **tx).await.map_err(db_error)?;
    for data in fleets {
        let f: MissionFleet = decode_supported(data)?;
        scopes.extend([
            ScopeKey::Player(f.owner),
            ScopeKey::Location(f.origin_coordinates),
            ScopeKey::Location(f.destination_coordinates),
        ]);
        scopes.extend(f.authorization.target_owner.map(ScopeKey::Player));
    }
    let missiles: Vec<serde_json::Value> = sqlx::query_scalar("SELECT data FROM missile_flights WHERE universe=$1 AND owner=$2 AND data->>'status'='InFlight'")
        .bind(u.0).bind(player.0).fetch_all(&mut **tx).await.map_err(db_error)?;
    for data in missiles {
        let f: MissileFlight = decode_supported(data)?;
        scopes.extend([
            ScopeKey::Player(f.terms.intent.target.expected_owner),
            ScopeKey::Location(f.terms.source_coordinates),
            ScopeKey::Location(f.terms.target_coordinates),
        ]);
    }
    let groups = crate::attack_groups::load(
        tx,
        u,
        &Input::Event(ScheduledEvent::EmpireDeletionDue { player }),
        &[player.0],
        false,
    )
    .await?;
    for group in groups {
        scopes.extend(
            crate::attack_groups::scopes(
                tx,
                u,
                &Input::Event(ScheduledEvent::AttackGroupDue {
                    group: group.id,
                    generation: group.generation,
                }),
            )
            .await?,
        );
    }
    let members: Vec<Uuid> = sqlx::query_scalar("SELECT m.player FROM alliance_memberships m JOIN alliances a ON a.id=m.alliance WHERE a.universe=$1 AND a.leader=$2")
        .bind(u.0).bind(player.0).fetch_all(&mut **tx).await.map_err(db_error)?;
    scopes.extend(members.into_iter().map(|p| ScopeKey::Player(PlayerId(p))));
    Ok(scopes)
}

/// Empire-wide checks and admitted lifecycle commands depend on bodies, fleets and
/// members acquired after admission. Shared player scopes prevent a later command
/// from being claimed while these dependencies are extended by its predecessor.
/// Called inside the source mutation transaction, while its causal player scopes are held.
pub(crate) async fn refresh_checks(
    tx: &mut Tx<'_>,
    u: UniverseId,
    players: &BTreeSet<PlayerId>,
    except: InputId,
) -> Result<(), StoreError> {
    for player in players {
        let events: Vec<serde_json::Value> = sqlx::query_scalar(
            "SELECT input FROM scheduled_events WHERE universe=$1 AND event->>'type'='EmpireDeletionDue' AND event->>'player'=$2 AND NOT done AND NOT cancelled
             UNION ALL
             SELECT input FROM commands WHERE universe=$1 AND actor=$3 AND NOT done AND input->'payload'->'Command'->'action'->>'type' IN ('EnterVacation','ExitVacation','RequestEmpireDeletion','CancelEmpireDeletion')"
        ).bind(u.0).bind(player.to_string()).bind(player.0)
            .fetch_all(&mut **tx).await.map_err(db_error)?;
        if events.is_empty() {
            continue;
        }
        let refs = scopes(tx, u, *player).await?;
        for value in events {
            let i = ordered_input(value)?;
            if i.id == except {
                continue;
            }
            crate::admission::register(tx, &i, &refs).await?;
        }
    }
    Ok(())
}

pub(crate) async fn cancel_checks(
    tx: &mut Tx<'_>,
    u: UniverseId,
    player: PlayerId,
    except: InputId,
) -> Result<(), StoreError> {
    let ids: Vec<Uuid> = sqlx::query_scalar("UPDATE scheduled_events SET cancelled=true WHERE universe=$1 AND event->>'type'='EmpireDeletionDue' AND event->>'player'=$2 AND id<>$3 AND NOT done AND NOT cancelled RETURNING id")
        .bind(u.0).bind(player.to_string()).bind(except.0).fetch_all(&mut **tx).await.map_err(db_error)?;
    sqlx::query("DELETE FROM input_scopes WHERE universe=$1 AND input_id=ANY($2)")
        .bind(u.0)
        .bind(ids)
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
    Ok(())
}

pub(crate) async fn seed_check(
    tx: &mut Tx<'_>,
    u: UniverseId,
    player: PlayerId,
    at: i64,
) -> Result<(), StoreError> {
    let rt = runtime(tx, u).await?;
    let epoch = Epoch(
        sqlx::query_scalar("SELECT epoch FROM universes WHERE id=$1")
            .bind(u.0)
            .fetch_one(&mut **tx)
            .await
            .map_err(db_error)?,
    );
    let profile_hash = Hash(
        sqlx::query_scalar("SELECT profile_hash FROM universes WHERE id=$1")
            .bind(u.0)
            .fetch_one(&mut **tx)
            .await
            .map_err(db_error)?,
    );
    let input = OrderedInput {
        schema_version: 4,
        id: InputId(Uuid::new_v4()),
        universe: u,
        epoch,
        actor: Actor::Scheduler,
        at,
        phase: 0,
        sequence: next_sequence(tx, u).await?,
        protocol: 4,
        profile_hash,
        payload: Input::Event(ScheduledEvent::EmpireDeletionDue { player }),
    };
    let Input::Event(event) = &input.payload else {
        unreachable!()
    };
    sqlx::query("INSERT INTO scheduled_events(id,universe,at_ms,sequence,input,event) VALUES($1,$2,$3,$4,$5,$6)")
        .bind(input.id.0).bind(u.0).bind(at).bind(input.sequence).bind(sqlx::types::Json(&input)).bind(sqlx::types::Json(event)).execute(&mut **tx).await.map_err(db_error)?;
    if rt.get::<String, _>("executor_mode") != "serial" {
        let refs = scopes(tx, u, player).await?;
        crate::admission::register(tx, &input, &refs).await?;
    }
    Ok(())
}

impl PgStore {
    /// Adopt retained worlds before workers start. Never backdate newly introduced events.
    pub async fn ensure_empire_cleanup(&self) -> Result<(), StoreError> {
        let rows: Vec<(Uuid, Uuid)> = sqlx::query_as("SELECT p.universe,p.id FROM player_policies p JOIN universe_memberships m ON m.universe=p.universe AND m.player=p.id WHERE p.data->>'lifecycle'<>'Removed' AND NOT EXISTS(SELECT 1 FROM scheduled_events e WHERE e.universe=p.universe AND e.event->>'type'='EmpireDeletionDue' AND e.event->>'player'=p.id::text AND NOT e.done AND NOT e.cancelled) ORDER BY p.universe,p.id")
            .fetch_all(self.worker_pool()?).await.map_err(db_error)?;
        for (universe, player) in rows {
            let u = UniverseId(universe);
            let (mut tx, scoped) = self.begin_ordered(self.worker_pool()?, u).await?;
            let epoch = Epoch(
                sqlx::query_scalar("SELECT epoch FROM universes WHERE id=$1")
                    .bind(universe)
                    .fetch_one(&mut *tx)
                    .await
                    .map_err(db_error)?,
            );
            crate::holding::lock(&mut tx, u, epoch).await?;
            let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM scheduled_events WHERE universe=$1 AND event->>'type'='EmpireDeletionDue' AND event->>'player'=$2 AND NOT done AND NOT cancelled)")
                .bind(universe).bind(player.to_string()).fetch_one(&mut *tx).await.map_err(db_error)?;
            if exists {
                continue;
            }
            let data: serde_json::Value =
                sqlx::query_scalar("SELECT data FROM player_policies WHERE universe=$1 AND id=$2")
                    .bind(universe)
                    .bind(player)
                    .fetch_one(&mut *tx)
                    .await
                    .map_err(db_error)?;
            let p: PlayerPolicy = decode_supported(data)?;
            if p.lifecycle == PlayerLifecycle::Removed {
                continue;
            }
            let refs = scopes(&mut tx, u, p.player).await?;
            let at = if scoped {
                crate::admission::stamp(&mut tx, u, &refs, self.observer.clone())
                    .await?
                    .0
            } else {
                now(&mut tx)
                    .await?
                    .max(runtime(&mut tx, u).await?.get("frontier"))
            };
            let due = p
                .next_deletion_check(at)
                .map_err(|_| StoreError::CorruptData)?
                .unwrap_or(at.saturating_add(INACTIVITY_DELETION_MS));
            seed_check(
                &mut tx,
                u,
                p.player,
                due.max(at.checked_add(1).ok_or(StoreError::CorruptData)?),
            )
            .await?;
            tx.commit().await.map_err(db_error)?;
        }
        Ok(())
    }
}

pub(crate) async fn remove(
    tx: &mut Tx<'_>,
    i: &OrderedInput,
    s: &GameState,
    world: &WorldChanges,
    player: PlayerId,
) -> Result<(), StoreError> {
    let account: Uuid = sqlx::query_scalar(
        "SELECT account FROM universe_memberships WHERE universe=$1 AND player=$2",
    )
    .bind(i.universe.0)
    .bind(player.0)
    .fetch_one(&mut **tx)
    .await
    .map_err(db_error)?;
    let binding = Binding {
        universe: i.universe,
        epoch: i.epoch,
        player,
        account: AccountId(account),
    };
    let alliance: Option<Uuid> = sqlx::query_scalar(
        "SELECT alliance FROM alliance_memberships WHERE universe=$1 AND epoch=$2 AND player=$3",
    )
    .bind(i.universe.0)
    .bind(i.epoch.0)
    .bind(player.0)
    .fetch_optional(&mut **tx)
    .await
    .map_err(db_error)?;
    if let Some(id) = alliance {
        let before = crate::alliances::persistence::load(tx, i.universe, i.epoch, id).await?;
        let mut after = before.clone();
        let disbanded = after
            .remove_deleted_member(player, &world.records.policies, i.at, i.id.0)
            .map_err(|_| StoreError::CorruptData)?;
        crate::alliances::persistence::history(
            tx,
            binding,
            Some(&before),
            (!disbanded).then_some(&after),
            i.at,
        )
        .await?;
        if disbanded {
            sqlx::query("DELETE FROM alliances WHERE id=$1")
                .bind(id)
                .execute(&mut **tx)
                .await
                .map_err(db_error)?;
        } else {
            crate::alliances::persistence::save(tx, binding, &after).await?;
            let members = after.members.iter().map(|m| m.player).collect();
            refresh_checks(tx, i.universe, &members, i.id).await?;
            if before.leader != after.leader {
                // The removed player already receives the engine invalidation;
                // the newly promoted leader also needs their deletion guard refreshed.
                crate::alliances::invalidation::leadership(
                    tx,
                    i.universe,
                    i.epoch,
                    None,
                    Some(after.leader),
                )
                .await?;
            }
        }
    }
    sqlx::query("WITH removed AS (DELETE FROM alliance_applications WHERE universe=$1 AND epoch=$2 AND player=$3 RETURNING alliance) UPDATE alliances SET revision=revision+1 WHERE id IN (SELECT alliance FROM removed)")
        .bind(i.universe.0).bind(i.epoch.0).bind(player.0).execute(&mut **tx).await.map_err(db_error)?;
    sqlx::query("DELETE FROM friend_relationships WHERE universe=$1 AND epoch=$2 AND (player_low=$3 OR player_high=$3)")
        .bind(i.universe.0).bind(i.epoch.0).bind(player.0).execute(&mut **tx).await.map_err(db_error)?;
    sqlx::query(
        "DELETE FROM player_blocks WHERE universe=$1 AND epoch=$2 AND (blocker=$3 OR blocked=$3)",
    )
    .bind(i.universe.0)
    .bind(i.epoch.0)
    .bind(player.0)
    .execute(&mut **tx)
    .await
    .map_err(db_error)?;
    sqlx::query("DELETE FROM inventories WHERE owner=$1")
        .bind(player.0)
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
    // End bot participation without revoking the shared account or other universes.
    sqlx::query("WITH changed AS (UPDATE bot_participation SET retired_at=$3,retirement_reason='Empire deleted' WHERE universe=$1 AND player=$2 AND retired_at IS NULL RETURNING universe,player,retired_at,retirement_reason) INSERT INTO bot_retirements SELECT universe,player,retired_at,retirement_reason,NULL FROM changed")
        .bind(i.universe.0).bind(player.0).bind(i.at).execute(&mut **tx).await.map_err(db_error)?;
    sqlx::query("UPDATE bot_tokens SET revoked_at=$3 WHERE universe=$1 AND player=$2 AND revoked_at IS NULL")
        .bind(i.universe.0).bind(player.0).bind(i.at).execute(&mut **tx).await.map_err(db_error)?;
    for b in s.bodies.values().filter(|b| b.owner == player) {
        for table in [
            "inventories",
            "building_levels",
            "production_settings",
            "legacy_body_capacities",
        ] {
            sqlx::query(&format!("DELETE FROM {table} WHERE body=$1"))
                .bind(b.id.0)
                .execute(&mut **tx)
                .await
                .map_err(db_error)?;
        }
        for table in ["body_activity", "colony_genesis"] {
            sqlx::query(&format!("DELETE FROM {table} WHERE universe=$1 AND id=$2"))
                .bind(i.universe.0)
                .bind(b.id.0)
                .execute(&mut **tx)
                .await
                .map_err(db_error)?;
        }
        sqlx::query("DELETE FROM bodies WHERE universe=$1 AND id=$2")
            .bind(i.universe.0)
            .bind(b.id.0)
            .execute(&mut **tx)
            .await
            .map_err(db_error)?;
        sqlx::query("INSERT INTO planet_slot_revisions VALUES($1,$2,$3,$4,1) ON CONFLICT(universe,galaxy,system,position) DO UPDATE SET revision=planet_slot_revisions.revision+1")
            .bind(i.universe.0).bind(b.coordinates.galaxy as i32).bind(b.coordinates.system as i32).bind(b.coordinates.position as i32).execute(&mut **tx).await.map_err(db_error)?;
    }
    sqlx::query("UPDATE collection_heads SET revision=revision+1 WHERE universe=$1 AND kind='owned-bodies' AND key=$2").bind(i.universe.0).bind(player.0).execute(&mut **tx).await.map_err(db_error)?;
    cancel_checks(tx, i.universe, player, i.id).await?;
    sqlx::query("DELETE FROM universe_memberships WHERE universe=$1 AND player=$2")
        .bind(i.universe.0)
        .bind(player.0)
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
    Ok(())
}
