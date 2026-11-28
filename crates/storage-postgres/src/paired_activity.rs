//! Apply the gesture at its order's logical time. The immutable gesture command
//! keeps its own receipt; a gameplay rejection still commits a valid gesture.
use crate::{ordering::*, *};
use orbit_application::*;
use orbit_engine::*;
use sqlx::Row;

pub(crate) struct Gesture {
    link: PresenceLink,
    result: ForegroundActivity,
}

pub(crate) fn project(
    state: &mut GameState,
    input: &OrderedInput,
    rules: &Ruleset,
) -> Result<Option<Gesture>, StoreError> {
    let Some(link) = state
        .world
        .as_ref()
        .and_then(|w| w.requested_pair.clone())
        .filter(|p| p.gameplay == input.id)
    else {
        return Ok(None);
    };
    if input.actor != Actor::Player(link.player) || input.at != link.at {
        return Err(StoreError::CorruptData);
    }
    let result = foreground_activity(state, link.player, link.body, link.presence, link.at, rules)
        .map_err(|_| StoreError::CorruptData)?;
    let world = state.world.as_mut().ok_or(StoreError::CorruptData)?;
    if let ForegroundActivity::Recorded { policy, activity } = &result {
        world.records.policies.insert(link.player, policy.clone());
        if let Some(activity) = activity {
            world
                .records
                .activity
                .insert(activity.body, activity.clone());
        }
        world.records.presence.insert(input.id, link.clone());
    }
    Ok(Some(Gesture { link, result }))
}

impl Gesture {
    pub(crate) async fn save(
        self,
        tx: &mut Tx<'_>,
        input: &OrderedInput,
        mode_generation: i64,
    ) -> Result<bool, StoreError> {
        let link = self.link;
        let row = sqlx::query(
            "SELECT input,receipt FROM commands WHERE universe=$1 AND actor=$2 AND input_id=$3
             AND inline_presence AND NOT done FOR UPDATE",
        )
        .bind(input.universe.0)
        .bind(link.player.0)
        .bind(link.presence.0)
        .fetch_one(&mut **tx)
        .await
        .map_err(db_error)?;
        let presence = ordered_input(row.try_get("input").map_err(db_error)?)?;
        let mut receipt: Receipt = decode(row.try_get("receipt").map_err(db_error)?)?;
        if presence.id != link.presence
            || presence.epoch != input.epoch
            || presence.at != input.at
            || presence.actor != input.actor
            || !matches!(presence.payload, Input::Command(Command::World {
                action: WorldAction::RecordForegroundPresence { body, cause: PresenceCause::GameplayGesture, .. }
            }) if body == link.body)
        {
            return Err(StoreError::CorruptData);
        }
        let recorded = matches!(self.result, ForegroundActivity::Recorded { .. });
        receipt.executed_at = Some(input.at);
        receipt.status = match self.result {
            ForegroundActivity::Rejected(code) => ReceiptStatus::Rejected { code },
            ForegroundActivity::Recorded { policy, activity } => {
                crate::world::put(
                    tx,
                    input.universe,
                    "player_policies",
                    link.player.0,
                    &policy,
                )
                .await?;
                if let Some(signal) = activity {
                    crate::world::put(tx, input.universe, "body_activity", signal.body.0, &signal)
                        .await?;
                }
                sqlx::query("UPDATE presence_pairs SET succeeded=true WHERE gameplay_input=$1")
                    .bind(input.id.0)
                    .execute(&mut **tx)
                    .await
                    .map_err(db_error)?;
                let revision: i64 = sqlx::query_scalar("UPDATE viewer_heads SET revision=revision+1,changed_at=$3,changed_at_generation=$4 WHERE universe=$1 AND player=$2 RETURNING revision")
                    .bind(input.universe.0).bind(link.player.0).bind(input.at).bind(mode_generation).fetch_one(&mut **tx).await.map_err(db_error)?;
                ReceiptStatus::Committed {
                    result_ids: Vec::new(),
                    minimum_viewer_revision: revision.to_string(),
                }
            }
        };
        sqlx::query(
            "UPDATE commands SET done=true,receipt=$2,activity_captured=true WHERE input_id=$1",
        )
        .bind(link.presence.0)
        .bind(sqlx::types::Json(&receipt))
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
        sqlx::query("DELETE FROM input_scopes WHERE universe=$1 AND input_id=$2")
            .bind(input.universe.0)
            .bind(link.presence.0)
            .execute(&mut **tx)
            .await
            .map_err(db_error)?;
        // The gameplay publication below carries a single combined invalidation.
        crate::updates::append_updates(tx, &presence, Some(&receipt), &Default::default()).await?;
        Ok(recorded)
    }
}
