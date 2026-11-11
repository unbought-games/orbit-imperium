//! Public protocol primitives. Program schedules and hosted catalog content are external.
use orbit_engine::{Command, Input, WorldAction};
use serde::{Deserialize, Serialize};

pub const COMMUNITY_CONTRACT_VERSION: u32 = 1;
pub const COMMUNITY_GAME_ID: &str = "orbit-imperium";

/// Called only after successful commit; automated arrivals and cosmetic/social
/// commands deliberately do not appear here. Account kind is checked in storage.
pub fn qualifying_command(input: &Input) -> bool {
    matches!(
        input,
        Input::Command(
            Command::StartUpgrade { .. }
                | Command::StartDemolition { .. }
                | Command::StartResearch { .. }
                | Command::StartManufacture { .. }
                | Command::SetProduction { .. }
                | Command::LaunchTransport { .. }
                | Command::RecallFleet { .. }
                | Command::World {
                    action: WorldAction::LaunchFleet { .. }
                        | WorldAction::RecallMission { .. }
                        | WorldAction::LaunchMissiles { .. }
                        | WorldAction::SupplyHoldingFleet { .. }
                        | WorldAction::ScanPlanet { .. }
                        | WorldAction::CreateAttackGroup { .. }
                }
        )
    )
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DeliveryOperation {
    #[default]
    Grant,
    Revoke,
}
impl DeliveryOperation {
    fn is_grant(&self) -> bool {
        *self == Self::Grant
    }
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CommunityDelivery {
    #[serde(default, skip_serializing_if = "DeliveryOperation::is_grant")]
    pub operation: DeliveryOperation,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub grant_award_id: Option<String>,
    pub award_id: String,
    pub subject: String,
    pub reward_id: String,
    pub kind: String,
    pub item_id: String,
    pub source_id: String,
    pub rule_version: String,
    pub awarded_at: String,
}
impl CommunityDelivery {
    pub fn supported(&self) -> bool {
        (match self.operation {
            DeliveryOperation::Grant => self.grant_award_id.is_none(),
            DeliveryOperation::Revoke => self.grant_award_id.as_ref().is_some_and(|id| {
                !id.is_empty()
                    && id.len() <= 200
                    && id != &self.award_id
                    && !id.chars().any(char::is_control)
            }),
        }) && matches!(self.kind.as_str(), "insignia" | "emblem" | "title")
            && crate::valid_symbol_id(&self.item_id)
            && [
                &self.award_id,
                &self.subject,
                &self.reward_id,
                &self.source_id,
                &self.rule_version,
            ]
            .iter()
            .all(|s| !s.is_empty() && s.len() <= 200 && !s.chars().any(char::is_control))
    }
    pub fn grant_kind(&self) -> &str {
        if self.kind == "emblem" {
            "insignia"
        } else {
            &self.kind
        }
    }
}

/// Capped retry spacing, not a delivery limit. Acknowledgement is required before
/// evidence can leave the pending state; interruption merely delays another try.
pub fn community_retry_seconds(attempt: u32) -> u64 {
    5_u64.saturating_mul(1_u64 << attempt.min(10)).min(3600)
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CommunityAllianceIdentity {
    pub universe_id: uuid::Uuid,
    pub epoch_id: uuid::Uuid,
    pub alliance_id: uuid::Uuid,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct InvitationEvidenceRequest {
    pub contract_version: u32,
    pub operation_id: String,
    pub recipient_ref: String,
    pub invitation_id: String,
    pub issuer_subject: Option<String>,
    pub alliance: CommunityAllianceIdentity,
    pub proposed_type: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AllianceSnapshotRequest {
    pub contract_version: u32,
    pub operation_id: String,
    pub alliance: CommunityAllianceIdentity,
    pub honor_id: String,
    pub reached_at: String,
}

/// The released opening program, not an arbitrary empty/shorter objective set.
/// Receipt membership is passed by the owning transaction without copied state.
pub fn community_onboarding_complete(
    program: &orbit_engine::ObjectiveProgram,
    completed: impl Fn(&str) -> bool,
) -> bool {
    *program == orbit_engine::tutorial_program()
        && !program.objectives.is_empty()
        && program
            .objectives
            .iter()
            .all(|objective| completed(&objective.id))
}
#[cfg(test)]
mod onboarding_tests {
    use super::*;
    #[test]
    fn only_the_complete_pinned_intro_can_qualify() {
        let program = orbit_engine::tutorial_program();
        assert!(community_onboarding_complete(&program, |_| true));
        assert!(!community_onboarding_complete(&program, |id| id != "reinvest"));
        let mut changed = program.clone();
        changed.version += 1;
        assert!(!community_onboarding_complete(&changed, |_| true));
        changed = program.clone();
        changed.id = "unknown-program".into();
        assert!(!community_onboarding_complete(&changed, |_| true));
        changed = program;
        changed.objectives.clear();
        assert!(!community_onboarding_complete(&changed, |_| true));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use orbit_engine::*;
    #[test]
    fn passive_and_presentation_activity_never_qualifies() {
        for action in [
            WorldAction::OpenTutorial,
            WorldAction::ReviewProductionSettings,
            WorldAction::EnterVacation,
            WorldAction::SetTutorialPresentation { beginner: true },
        ] {
            assert!(!qualifying_command(&Input::Command(Command::World {
                action
            })));
        }
        assert!(!qualifying_command(&Input::Event(
            ScheduledEvent::ConstructionDue {
                operation: OperationId::default(),
                generation: 1,
            }
        )));
        assert!(qualifying_command(&Input::Command(Command::StartUpgrade {
            body: BodyId::default(),
            building: Building::MetalMine,
            expected_terms_hash: Hash(String::new()),
        })));
    }
    #[test]
    fn retry_spacing_stays_bounded_without_dropping_evidence() {
        assert_eq!(community_retry_seconds(0), 5);
        assert_eq!(community_retry_seconds(3), 40);
        assert_eq!(community_retry_seconds(u32::MAX), 3600);
    }
}
