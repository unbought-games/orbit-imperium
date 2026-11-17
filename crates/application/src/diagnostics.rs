//! Allowlisted operational diagnostics. Never serialize claims, facts, payloads,
//! errors with free-text contents, or state here. This is not a commit journal.
use crate::{RequestAction, ServiceError, StepOutcome};
use orbit_engine::{Command, Input, OrderedInput, ScheduledEvent, TransitionResult, WorldAction};
use std::sync::OnceLock;

pub fn release() -> &'static str {
    static RELEASE: OnceLock<String> = OnceLock::new();
    RELEASE.get_or_init(|| {
        // Official deployment supplies the immutable image reference. Do not
        // echo arbitrary environment text on configuration errors.
        std::env::var("ORBIT_RELEASE")
            .ok()
            .as_deref()
            .and_then(release_identity)
            .unwrap_or_else(|| env!("CARGO_PKG_VERSION").into())
    })
}

/// Log only an immutable digest/commit, never an arbitrary URL or credentials
/// accidentally put into an image reference by an operator.
pub fn release_identity(value: &str) -> Option<String> {
    let digest = value
        .rsplit_once("@sha256:")
        .map(|(_, digest)| digest)
        .or_else(|| value.strip_prefix("sha256:"));
    if let Some(digest) = digest {
        return (digest.len() == 64 && digest.bytes().all(|b| b.is_ascii_hexdigit()))
            .then(|| format!("sha256:{digest}"));
    }
    (matches!(value.len(), 40 | 64) && value.bytes().all(|b| b.is_ascii_hexdigit()))
        .then(|| value.to_owned())
}

pub fn role() -> &'static str {
    static ROLE: OnceLock<&'static str> = OnceLock::new();
    ROLE.get_or_init(|| match std::env::var("ORBIT_ROLE").as_deref() {
        Ok("api") => "api",
        Ok("worker") => "worker",
        _ => "combined_or_cli",
    })
}

/// Fixed target excludes third-party wire/debug logging at every threshold.
/// Arguments are evaluated only when enabled by tracing's subscriber.
#[macro_export]
macro_rules! orbit_log {
    ($level:ident, $($fields:tt)*) => {
        tracing::event!(target: "orbit", tracing::Level::$level,
            release = $crate::diagnostics::release(), role = $crate::diagnostics::role(), $($fields)*)
    };
}

pub fn action(input: &Input) -> &'static str {
    match input {
        Input::Command(command) => command_action(command),
        Input::Event(event) => event_action(event),
    }
}

pub fn command_action(command: &Command) -> &'static str {
    match command {
        Command::World { action } => match action {
            WorldAction::RenamePlanet { .. } => "rename_planet",
            WorldAction::RecordForegroundPresence { .. } => "presence",
            WorldAction::LaunchFleet { .. } => "fleet_dispatch",
            WorldAction::RecallMission { .. } => "fleet_recall",
            WorldAction::JumpShips { .. } => "jump_ships",
            WorldAction::ScanPlanet { .. } => "scan_planet",
            WorldAction::RequestEmpireDeletion => "request_empire_deletion",
            WorldAction::CancelEmpireDeletion => "cancel_empire_deletion",
            WorldAction::EnterVacation => "enter_vacation",
            WorldAction::ExitVacation => "exit_vacation",
            WorldAction::CreateAttackGroup { .. } => "create_attack_group",
            WorldAction::InviteAttackGroup { .. } => "invite_attack_group",
            WorldAction::RevokeAttackGroupInvitation { .. } => "revoke_attack_group_invitation",
            WorldAction::SupplyHoldingFleet { .. } => "supply_holding_fleet",
            WorldAction::AbandonPlanet { .. } => "abandon_planet",
            WorldAction::LaunchMissiles { .. } => "launch_missiles",
            WorldAction::ScrapMissiles { .. } => "scrap_missiles",
            WorldAction::SetTutorialPresentation { .. } => "tutorial_presentation",
            WorldAction::OpenTutorial => "open_tutorial",
            WorldAction::ReviewProductionSettings => "review_production",
            WorldAction::MarkReportRead { .. } | WorldAction::MarkReportsRead { .. } => {
                "read_reports"
            }
            WorldAction::SetReportStarred { .. } => "star_report",
            WorldAction::SetReportHidden { .. } | WorldAction::SetReportsHidden { .. } => {
                "hide_reports"
            }
        },
        Command::SetProduction { .. } => "set_production",
        Command::StartDemolition { .. } => "start_demolition",
        command => RequestAction::of(command).name(),
    }
}

fn event_action(event: &ScheduledEvent) -> &'static str {
    match event {
        ScheduledEvent::EmpireDeletionDue { .. } => "EmpireDeletionDue",
        ScheduledEvent::AttackGroupDue { .. } => "AttackGroupDue",
        ScheduledEvent::AbandonedSlotDue { .. } => "AbandonedSlotDue",
        ScheduledEvent::MissileImpact { .. } => "MissileImpact",
        ScheduledEvent::FleetLegDue { .. } => "FleetLegDue",
        ScheduledEvent::DebrisCleanupDue { .. } => "DebrisCleanupDue",
        ScheduledEvent::ResearchDue { .. } => "ResearchDue",
        ScheduledEvent::ManufacturingDue { .. } => "ManufacturingDue",
        ScheduledEvent::TransportArrived { .. } => "TransportArrived",
        ScheduledEvent::FleetReturned { .. } => "FleetReturned",
        ScheduledEvent::ConstructionDue { .. } => "ConstructionDue",
    }
}

pub fn resolution(input: &OrderedInput, result: &Result<StepOutcome, ServiceError>) {
    let action = action(&input.payload);
    match result {
        // The application commit boundary has the durable receipt status.
        Ok(StepOutcome::Committed { .. }) => {}
        Ok(StepOutcome::Retry) => crate::orbit_log!(DEBUG, event = "game_transition_retry",
            input_id = %input.id, universe = %input.universe, action, stage = "resolve", outcome = "retry", commit_outcome = "unknown"),
        Ok(StepOutcome::Blocked { .. }) => {
            crate::orbit_log!(ERROR, event = "game_transition_blocked",
            input_id = %input.id, universe = %input.universe, action, stage = "resolve", outcome = "blocked", error_code = "InvalidState", commit_outcome = "unknown")
        }
        Err(
            ServiceError::GameRejected(_) | ServiceError::Forbidden | ServiceError::RateLimited,
        ) => {
            crate::orbit_log!(DEBUG, event = "game_resolution_rejected", input_id = %input.id,
                universe = %input.universe, action, stage = "resolve", outcome = "rejected");
        }
        Err(error) => {
            let error_code = match error {
                ServiceError::Unavailable => "StorageOrExecutorUnavailable",
                ServiceError::UnsupportedState => "UnsupportedState",
                ServiceError::InvariantFailure => "InvariantFailure",
                _ => "ResolutionFailed",
            };
            crate::orbit_log!(ERROR, event = "game_transition_failed", input_id = %input.id,
                universe = %input.universe, action, stage = "resolve", outcome = "failed", error_code, commit_outcome = "unknown");
        }
        Ok(StepOutcome::Idle) => {}
    }
}

pub fn engine_decision(input: &OrderedInput, result: &TransitionResult) {
    if !tracing::enabled!(target: "orbit", tracing::Level::DEBUG) {
        return;
    }
    let (decision, changed_bodies, scheduled_events) = match result {
        TransitionResult::Applied(changes) => {
            ("applied", changes.bodies.len(), changes.events.len())
        }
        TransitionResult::Rejected(_) => ("rejected", 0, 0),
        TransitionResult::InvalidState(_) => ("invalid_state", 0, 0),
    };
    let changed_body = match result {
        TransitionResult::Applied(changes) => changes.bodies.first(),
        _ => None,
    };
    let quantity = match &input.payload {
        Input::Command(Command::StartManufacture { quantity, .. }) => Some(*quantity),
        _ => None,
    };
    crate::orbit_log!(DEBUG, event = "game_engine_decision", input_id = %input.id,
        universe = %input.universe, action = action(&input.payload), stage = "engine",
        outcome = decision, commit_outcome = "not_attempted", at_ms = input.at,
        sequence = input.sequence, epoch = %input.epoch, quantity,
        changed_bodies, scheduled_events, changed_body_id = changed_body.map(|b| b.id.to_string()),
        proposed_body_revision = changed_body.map(|b| b.revision),
        proposed_metal = changed_body.map(|b| b.checkpoint.amounts.metal),
        proposed_crystal = changed_body.map(|b| b.checkpoint.amounts.crystal),
        proposed_deuterium = changed_body.map(|b| b.checkpoint.amounts.deuterium));
}

/// Call only after admission COMMIT is acknowledged. Input IDs are unrelated to
/// client command IDs: this record is the explicit join between them.
pub fn admitted(
    universe: orbit_engine::UniverseId,
    command: orbit_engine::CommandId,
    input: orbit_engine::InputId,
    action: &'static str,
) {
    if action == "presence" {
        crate::orbit_log!(DEBUG, event = "command_admitted", command_id = %command,
            input_id = %input, universe = %universe, action, stage = "admission", outcome = "accepted", commit_outcome = "acknowledged");
    } else {
        crate::orbit_log!(INFO, event = "command_admitted", command_id = %command,
            input_id = %input, universe = %universe, action, stage = "admission", outcome = "accepted", commit_outcome = "acknowledged");
    }
}

/// Application commit boundary for serial/scoped execution and the future
/// journal-independent implementation. A store error cannot prove rollback.
pub fn commit_result(
    input: &OrderedInput,
    result: &Result<crate::CommitOutcome, crate::StoreError>,
) {
    let action = action(&input.payload);
    match result {
        Ok(crate::CommitOutcome::Committed { receipt, .. }) => {
            let outcome = match receipt.as_ref().map(|r| &r.status) {
                Some(crate::ReceiptStatus::Rejected { .. }) => "rejected",
                Some(crate::ReceiptStatus::Committed { .. }) => "applied",
                Some(crate::ReceiptStatus::Pending) => "pending",
                None => "completed",
            };
            if action == "presence" {
                crate::orbit_log!(DEBUG, event = "game_transition_committed", input_id = %input.id,
                    universe = %input.universe, command_id = receipt.as_ref().map(|r| r.command_id.to_string()),
                    action, stage = "commit", outcome, commit_outcome = "acknowledged");
            } else {
                crate::orbit_log!(INFO, event = "game_transition_committed", input_id = %input.id,
                    universe = %input.universe, command_id = receipt.as_ref().map(|r| r.command_id.to_string()),
                    action, stage = "commit", outcome, commit_outcome = "acknowledged");
            }
        }
        Err(
            crate::StoreError::StaleClaim
            | crate::StoreError::Conflict
            | crate::StoreError::SnapshotRetry
            | crate::StoreError::GameRejected(_)
            | crate::StoreError::RateLimited,
        ) => {
            crate::orbit_log!(DEBUG, event = "game_commit_retry", input_id = %input.id,
                universe = %input.universe, action, stage = "commit", outcome = "retry", commit_outcome = "unknown");
        }
        Err(error) => crate::orbit_log!(ERROR, event = "game_commit_failed", input_id = %input.id,
            universe = %input.universe, action, stage = "commit", error_code = %error, commit_outcome = "unknown"),
        Ok(crate::CommitOutcome::Conflict | crate::CommitOutcome::StaleClaim) => {}
    }
}
