//! Alliance commands serialize only the social subsystem, independently of gameplay.
//! The transaction rechecks the live universe binding and commits source facts and
//! retry receipts together. Read transactions never admit presence/game commands.
use crate::{
    PgStore, db_error,
    ordering::{Tx, now},
};
use orbit_application::*;
use orbit_engine::alliances::{AllianceError, AllianceState, StateApplication, StateMember};
use sqlx::{Row, postgres::PgRow};
use uuid::Uuid;
mod persistence;
mod reads;
use persistence::*;

fn domain_error(error: AllianceError) -> StoreError {
    match error {
        AllianceError::NotFound | AllianceError::Forbidden => StoreError::NotFound,
        AllianceError::InvalidInput(_) | AllianceError::Conflict(_) => StoreError::Conflict,
    }
}
impl PgStore {
    pub(crate) async fn commit_alliance(
        &self,
        q: AllianceCommandRequest,
    ) -> Result<AllianceCommandResult, StoreError> {
        let b = q.context.binding;
        let mut tx = self.begin_tx(self.admission_pool()?).await?;
        // Shared universe lock excludes reset/epoch replacement for the whole write.
        sqlx::query("SELECT id FROM universes WHERE id=$1 FOR SHARE")
            .bind(b.universe.0)
            .fetch_optional(&mut *tx)
            .await
            .map_err(db_error)?
            .ok_or(StoreError::NotFound)?;
        // Scope one serialization lock to this subsystem. Every competing accept,
        // join/create, role edit and pin limit sees the previous committed state.
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 19))")
            .bind(format!("alliances:{}:{}", b.universe, b.epoch))
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
        crate::binding::check_read(&mut tx, b).await?;
        let intent=orbit_engine::hash(&serde_json::json!({"binding":b,"command_id":q.command_id,"action":q.action,"expected_revision":q.expected_revision})).0;
        if let Some(row)=sqlx::query("SELECT intent_hash,result FROM alliance_command_receipts WHERE universe=$1 AND epoch=$2 AND account=$3 AND player=$4 AND command_id=$5")
            .bind(b.universe.0).bind(b.epoch.0).bind(b.account.0).bind(b.player.0).bind(q.command_id).fetch_optional(&mut *tx).await.map_err(db_error)? {
            if row.try_get::<String,_>("intent_hash").map_err(db_error)? != intent { return Err(StoreError::Conflict); }
            return Ok(row.try_get::<sqlx::types::Json<AllianceCommandResult>,_>("result").map_err(db_error)?.0);
        }
        crate::bots::charge(&mut tx, b, "alliance", q.command_id, true).await?;
        let at = now(&mut tx).await?;
        let joining = matches!(
            &q.action,
            AllianceAction::Create { .. }
                | AllianceAction::Join { .. }
                | AllianceAction::Apply { .. }
        );
        if joining && membership(&mut tx, b, b.player).await?.is_some() {
            return Err(StoreError::Conflict);
        }
        if matches!(&q.action, AllianceAction::Apply { .. }) {
            let count:i64=sqlx::query_scalar("SELECT count(*) FROM alliance_applications WHERE universe=$1 AND epoch=$2 AND player=$3").bind(b.universe.0).bind(b.epoch.0).bind(b.player.0).fetch_one(&mut *tx).await.map_err(db_error)?;
            if count >= 5 {
                return Err(StoreError::Conflict);
            }
        }
        let (mut state, previous) = if let AllianceAction::Create { name, tag } = &q.action {
            if q.expected_revision.is_some() {
                return Err(StoreError::Conflict);
            }
            let state = AllianceState::create(
                Uuid::new_v4(),
                b.player,
                name.clone(),
                tag.clone(),
                at,
                [Uuid::new_v4(), Uuid::new_v4(), Uuid::new_v4()],
            )
            .map_err(domain_error)?;
            (state, None)
        } else {
            let id=match &q.action {
                AllianceAction::Withdraw{application}=> sqlx::query_scalar("SELECT alliance FROM alliance_applications WHERE id=$1 AND universe=$2 AND epoch=$3 AND player=$4").bind(application).bind(b.universe.0).bind(b.epoch.0).bind(b.player.0).fetch_optional(&mut *tx).await.map_err(db_error)?.ok_or(StoreError::NotFound)?,
                _=>q.action.alliance_id().ok_or(StoreError::NotFound)?,
            };
            let state = load(&mut tx, b.universe, b.epoch, id).await?;
            if let Some(revision) = q.expected_revision {
                if revision != state.revision {
                    return Err(StoreError::Conflict);
                }
            } else if !matches!(
                &q.action,
                AllianceAction::Join { .. }
                    | AllianceAction::Apply { .. }
                    | AllianceAction::Withdraw { .. }
            ) {
                return Err(StoreError::Conflict);
            }
            if let AllianceAction::Accept { application, .. } = &q.action {
                let player = state
                    .applications
                    .iter()
                    .find(|a| a.id == *application)
                    .ok_or(StoreError::NotFound)?
                    .player;
                if membership(&mut tx, b, player).await?.is_some() {
                    return Err(StoreError::Conflict);
                }
            }
            (state.clone(), Some(state))
        };
        let effect = if previous.is_some() {
            Some(
                state
                    .execute(b.player, &q.action, at, Uuid::new_v4())
                    .map_err(domain_error)?,
            )
        } else {
            None
        };
        let disbanded = effect.as_ref().is_some_and(|e| e.disbanded);
        let joined = effect
            .as_ref()
            .and_then(|e| e.joined)
            .or_else(|| previous.is_none().then_some(b.player));
        history(
            &mut tx,
            b,
            previous.as_ref(),
            (!disbanded).then_some(&state),
            at,
        )
        .await?;
        if disbanded {
            sqlx::query("DELETE FROM alliances WHERE id=$1 AND universe=$2 AND epoch=$3")
                .bind(state.id)
                .bind(b.universe.0)
                .bind(b.epoch.0)
                .execute(&mut *tx)
                .await
                .map_err(db_error)?;
        } else {
            save(&mut tx, b, &state).await?;
        }
        if let Some(player) = joined {
            // Withdrawal affects other alliances' revisions, so an administrator
            // cannot later accept an application from a stale private view.
            sqlx::query("WITH removed AS (DELETE FROM alliance_applications WHERE universe=$1 AND epoch=$2 AND player=$3 RETURNING alliance) UPDATE alliances SET revision=revision+1 WHERE id IN (SELECT alliance FROM removed) AND id<>$4")
                .bind(b.universe.0).bind(b.epoch.0).bind(player.0).bind(state.id).execute(&mut *tx).await.map_err(db_error)?;
        }
        let result = AllianceCommandResult {
            command_id: q.command_id,
            alliance: (!disbanded).then_some(state.id),
            revision: (!disbanded).then_some(state.revision),
        };
        sqlx::query("INSERT INTO alliance_command_receipts(universe,epoch,account,player,command_id,intent_hash,result) VALUES($1,$2,$3,$4,$5,$6,$7)")
            .bind(b.universe.0).bind(b.epoch.0).bind(b.account.0).bind(b.player.0).bind(q.command_id).bind(intent).bind(sqlx::types::Json(&result)).execute(&mut *tx).await.map_err(db_error)?;
        tx.commit().await.map_err(db_error)?;
        Ok(result)
    }
}
