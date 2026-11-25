//! Bounded operational vocabulary. Never include identities, URLs or payloads.
use crate::{RuntimeObserver, StoreError};
use orbit_engine::{Command, ManufacturedItem, WorldAction};
use std::{
    sync::Arc,
    time::{Duration, Instant},
};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, PartialOrd, Ord)]
pub enum RequestAction {
    #[default]
    Unknown,
    BuildingUpgrade,
    ShipOrder,
    DefenseOrder,
    MissileOrder,
    Research,
    FleetDispatch,
    FleetRecall,
    Cancel,
    Presence,
    Other,
}
impl RequestAction {
    pub fn of_v3(command: &crate::CommandDto3) -> Self {
        match command {
            crate::CommandDto3::Legacy(command) => Self::of_legacy(command),
            crate::CommandDto3::Progression(command) => Self::of(command),
        }
    }
    pub fn of_legacy(command: &crate::CommandDto) -> Self {
        match command {
            crate::CommandDto::StartUpgrade { .. } => Self::BuildingUpgrade,
            crate::CommandDto::CancelConstruction { .. } => Self::Cancel,
            crate::CommandDto::LaunchTransport { .. } => Self::FleetDispatch,
            crate::CommandDto::RecallFleet { .. } => Self::FleetRecall,
        }
    }
    pub fn of(command: &Command) -> Self {
        match command {
            Command::StartUpgrade { .. } => Self::BuildingUpgrade,
            Command::StartManufacture { item, .. } => match item {
                ManufacturedItem::Ship(_) => Self::ShipOrder,
                ManufacturedItem::Defense(_) => Self::DefenseOrder,
                ManufacturedItem::Missile(_) => Self::MissileOrder,
            },
            Command::StartResearch { .. } => Self::Research,
            Command::LaunchTransport { .. }
            | Command::World {
                action: WorldAction::LaunchFleet { .. },
            } => Self::FleetDispatch,
            Command::RecallFleet { .. }
            | Command::World {
                action: WorldAction::RecallMission { .. },
            } => Self::FleetRecall,
            Command::CancelConstruction { .. } | Command::CancelResearch { .. } => Self::Cancel,
            Command::World {
                action: WorldAction::RecordForegroundPresence { .. },
            } => Self::Presence,
            _ => Self::Other,
        }
    }
    pub fn name(self) -> &'static str {
        match self {
            Self::Unknown => "unknown",
            Self::BuildingUpgrade => "building_upgrade",
            Self::ShipOrder => "ship_order",
            Self::DefenseOrder => "defense_order",
            Self::MissileOrder => "missile_order",
            Self::Research => "research",
            Self::FleetDispatch => "fleet_dispatch",
            Self::FleetRecall => "fleet_recall",
            Self::Cancel => "cancel",
            Self::Presence => "presence",
            Self::Other => "other",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum AdmissionOutcome {
    Committed,
    Replay,
    Rejected,
    RateLimited,
    Error,
    Cancelled,
}
impl AdmissionOutcome {
    pub fn name(self) -> &'static str {
        match self {
            Self::Committed => "committed",
            Self::Replay => "replay",
            Self::Rejected => "rejected",
            Self::RateLimited => "rate_limited",
            Self::Error => "error",
            Self::Cancelled => "cancelled",
        }
    }
}

/// Records commit acknowledgement immediately, even if later response delivery fails.
pub struct AdmissionTimer {
    observer: Arc<dyn RuntimeObserver>,
    action: RequestAction,
    machine: bool,
    started: Option<Instant>,
}
impl AdmissionTimer {
    pub fn new(observer: Arc<dyn RuntimeObserver>, action: RequestAction, machine: bool) -> Self {
        Self {
            observer,
            action,
            machine,
            started: Some(Instant::now()),
        }
    }
    pub fn finish(&mut self, outcome: AdmissionOutcome) {
        if let Some(started) = self.started.take() {
            self.observer
                .admission(self.action, self.machine, outcome, started.elapsed());
        }
    }
    pub fn error(&mut self, error: &StoreError) {
        self.finish(match error {
            StoreError::RateLimited => AdmissionOutcome::RateLimited,
            StoreError::GameRejected(_)
            | StoreError::Conflict
            | StoreError::EpochChanged
            | StoreError::UnsupportedProtocol
            | StoreError::NotFound
            | StoreError::BotDenied(_) => AdmissionOutcome::Rejected,
            _ => AdmissionOutcome::Error,
        });
    }
}
impl Drop for AdmissionTimer {
    fn drop(&mut self) {
        self.finish(AdmissionOutcome::Cancelled);
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
#[repr(usize)]
pub enum RequestPhase {
    Authentication,
    PoolWait,
    OrderingWait,
    OrderingHold,
    AdmissionCommit,
    AdmissionAllianceWait,
    AdmissionAllianceHold,
    Admission,
}
impl RequestPhase {
    pub const ALL: [Self; 8] = [
        Self::Authentication,
        Self::PoolWait,
        Self::OrderingWait,
        Self::OrderingHold,
        Self::AdmissionCommit,
        Self::AdmissionAllianceWait,
        Self::AdmissionAllianceHold,
        Self::Admission,
    ];
    pub fn name(self) -> &'static str {
        match self {
            Self::Authentication => "authentication",
            Self::PoolWait => "pool_wait",
            Self::OrderingWait => "ordering_wait",
            Self::OrderingHold => "ordering_hold",
            Self::AdmissionCommit => "admission_commit",
            Self::AdmissionAllianceWait => "admission_alliance_wait",
            Self::AdmissionAllianceHold => "admission_alliance_hold",
            Self::Admission => "admission",
        }
    }
}

#[derive(Clone, Debug)]
pub struct RequestObservation {
    /// Router-owned template, never the incoming URI.
    pub route: String,
    pub method: &'static str,
    pub action: RequestAction,
    /// None means the handler was cancelled before producing a response.
    pub status: Option<u16>,
    pub elapsed: Duration,
    /// Nested/overlapping timings; do not sum these to reconstruct total duration.
    pub phases: [Option<Duration>; RequestPhase::ALL.len()],
    pub admission: Option<AdmissionOutcome>,
}
impl RequestObservation {
    pub fn outcome(&self) -> &'static str {
        match self.status {
            None => "cancelled",
            Some(202) => "accepted",
            Some(200..=299) => "success",
            Some(300..=399) => "redirect",
            Some(401 | 403) => "unauthorized",
            Some(429) => "rate_limited",
            Some(400..=499) => "rejected",
            Some(500..=599) => "server_error",
            Some(_) => "unexpected",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{RuntimeEvent, RuntimeStage};
    use orbit_engine::*;
    use std::sync::Mutex;
    #[derive(Default)]
    struct Recorder(Mutex<Vec<AdmissionOutcome>>);
    impl RuntimeObserver for Recorder {
        fn duration(&self, _: RuntimeStage, _: Duration) {}
        fn event(&self, _: RuntimeEvent) {}
        fn admission(&self, _: RequestAction, _: bool, outcome: AdmissionOutcome, _: Duration) {
            self.0.lock().unwrap().push(outcome);
        }
    }
    #[test]
    fn admission_is_observed_once_and_response_failure_cannot_revoke_commit() {
        let recorder = Arc::new(Recorder::default());
        let mut timer = AdmissionTimer::new(recorder.clone(), RequestAction::ShipOrder, false);
        assert!(recorder.0.lock().unwrap().is_empty());
        timer.finish(AdmissionOutcome::Committed);
        timer.error(&StoreError::Unavailable);
        drop(timer);
        let mut failed = AdmissionTimer::new(recorder.clone(), RequestAction::ShipOrder, false);
        failed.error(&StoreError::Unavailable);
        drop(failed);
        drop(AdmissionTimer::new(
            recorder.clone(),
            RequestAction::FleetDispatch,
            true,
        ));
        assert_eq!(
            *recorder.0.lock().unwrap(),
            vec![
                AdmissionOutcome::Committed,
                AdmissionOutcome::Error,
                AdmissionOutcome::Cancelled
            ]
        );
    }
    #[test]
    fn gameplay_classes_distinguish_ship_orders_defenses_upgrades_and_dispatches() {
        let body = BodyId(uuid::Uuid::nil());
        for (item, expected) in [
            (
                ManufacturedItem::Ship(ShipType::EspionageProbe),
                RequestAction::ShipOrder,
            ),
            (
                ManufacturedItem::Defense(DefenseId::RocketLauncher),
                RequestAction::DefenseOrder,
            ),
            (
                ManufacturedItem::Missile(MissileId::AntiBallisticMissile),
                RequestAction::MissileOrder,
            ),
        ] {
            assert_eq!(
                RequestAction::of_v3(&crate::CommandDto3::Progression(
                    Command::StartManufacture {
                        body,
                        item,
                        quantity: 1,
                        expected_terms_hash: Hash("0".repeat(64)),
                    }
                )),
                expected
            );
        }
        assert_eq!(
            RequestAction::of_legacy(&crate::CommandDto::StartUpgrade {
                body,
                building: Building::MetalMine,
                expected_terms_hash: Hash("0".repeat(64))
            }),
            RequestAction::BuildingUpgrade
        );
        let fleet = Command::World {
            action: WorldAction::LaunchFleet {
                intent: FleetIntent {
                    cargo_fill: None,
                    attack_group: None,
                    hold_hours: None,
                    origin: body,
                    destination: MissionDestination::Body {
                        id: body,
                        expected_kind: BodyKind::Planet,
                        expected_owner: PlayerId(uuid::Uuid::nil()),
                    },
                    mission: Mission::Transport,
                    ships: vec![],
                    cargo: Resources::default(),
                    speed_percent: 100,
                },
                expected_terms_hash: Hash("0".repeat(64)),
            },
        };
        assert_eq!(
            RequestAction::of_v3(&crate::CommandDto3::Progression(fleet)),
            RequestAction::FleetDispatch
        );
    }
}
