//! One-time arrival presentation for new empires. Presentation records only:
//! nothing here participates in ordered world replay or gameplay.
use crate::*;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::ops::RangeInclusive;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RecruitmentIntent {
    pub alliance: uuid::Uuid,
    pub invitation: Option<uuid::Uuid>,
}

pub type BodyAppearances = BTreeMap<BodyId, u8>;

/// Planet art slots whose climate matches an orbital position.
pub fn appearance_band(position: u32) -> RangeInclusive<u8> {
    match position {
        0..=4 => 1..=4,
        5..=8 => 5..=8,
        _ => 9..=15,
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ArrivalPresentation {
    pub recruitment: Option<RecruitmentIntent>,
    pub pending: bool,
    pub joined_at_ms: Option<i64>,
    pub appearances: BodyAppearances,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", deny_unknown_fields)]
pub enum ArrivalAction {
    Load,
    SetRecruitment { intent: Option<RecruitmentIntent> },
    SetAppearance { body: BodyId, slot: u8 },
    Complete,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ArrivalRequest {
    pub context: QueryContext,
    pub action: ArrivalAction,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ArrivalState {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recruitment: Option<RecruitmentIntent>,
    pub pending: bool,
}

impl<S: GameStore> GameService<S> {
    pub async fn arrival(
        &self,
        p: Principal,
        request: ArrivalRequest,
    ) -> Result<ArrivalState, ServiceError> {
        Self::principal(p, request.context.binding)?;
        let binding = request.context.binding;
        match request.action {
            ArrivalAction::Load => {}
            ArrivalAction::SetRecruitment { intent } => {
                self.store.set_arrival_recruitment(binding, intent).await?
            }
            ArrivalAction::SetAppearance { body, slot } => {
                self.store.set_body_appearance(binding, body, slot).await?
            }
            ArrivalAction::Complete => self.store.complete_arrival(binding).await?,
        }
        let state = self.store.arrival_presentation(binding, vec![]).await?;
        Ok(ArrivalState {
            recruitment: state.recruitment,
            pending: state.pending,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bands_follow_planet_climate() {
        assert_eq!(appearance_band(1), 1..=4);
        assert_eq!(appearance_band(4), 1..=4);
        assert_eq!(appearance_band(5), 5..=8);
        assert_eq!(appearance_band(8), 5..=8);
        assert_eq!(appearance_band(9), 9..=15);
        assert_eq!(appearance_band(12), 9..=15);
        assert_eq!(appearance_band(15), 9..=15);
    }

    #[test]
    fn actions_use_tagged_json() {
        let body = BodyId(uuid::Uuid::nil());
        assert_eq!(
            serde_json::from_value::<ArrivalAction>(
                serde_json::json!({"type":"SetAppearance","body":body,"slot":6})
            )
            .unwrap(),
            ArrivalAction::SetAppearance { body, slot: 6 }
        );
        assert_eq!(
            serde_json::from_value::<ArrivalAction>(serde_json::json!({"type":"Complete"}))
                .unwrap(),
            ArrivalAction::Complete
        );
    }
}
