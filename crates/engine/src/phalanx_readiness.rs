//! Explicit operational boundaries. Never called by startup or ordinary migration.
use crate::*;
use thiserror::Error;

/// Private operational diagnostics, with fixed messages safe for operator output.
/// Do not turn these into fleet-dependent public scan rejection details.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Error)]
pub enum PhalanxReadinessError {
    #[error("finish rolling deployment and exclude legacy writers before activating scans")]
    LegacyWritersMayWrite,
    #[error(
        "load complete active fleet membership under the activation barrier before activating scans"
    )]
    IncompleteFleetCoverage,
    #[error(
        "an active deployment return has no proven cause; explicitly classify it from conclusive journal evidence or let it settle before activating scans"
    )]
    UnknownDeploymentReturn,
    #[error("repair inconsistent fleet return facts before activating scans")]
    InvalidReturnFacts,
}

/// Supplied proofs are derived by the future activation coordinator, never saved
/// readiness flags. In particular, a new process running does not prove exclusion
/// of old workers, admissions, editors or rollback binaries.
///
/// Part 2 must call this under the rules-activation barrier with complete universe
/// membership, and enforce the same return-fact check on each complete scan load.
/// This function performs no I/O, activation, historical traversal or mutation.
pub fn validate_phalanx_scan_readiness<'a>(
    legacy_writers_excluded: bool,
    complete_active_fleet_coverage: bool,
    fleets: impl IntoIterator<Item = &'a MissionFleet>,
) -> Result<(), PhalanxReadinessError> {
    if !legacy_writers_excluded {
        return Err(PhalanxReadinessError::LegacyWritersMayWrite);
    }
    if !complete_active_fleet_coverage {
        return Err(PhalanxReadinessError::IncompleteFleetCoverage);
    }
    for fleet in fleets {
        validate_mission_return_reason(fleet)
            .map_err(|_| PhalanxReadinessError::InvalidReturnFacts)?;
        if fleet.intent.mission == Mission::Deploy
            && fleet.leg == MissionLeg::Returning
            && fleet.return_reason.is_none()
        {
            return Err(PhalanxReadinessError::UnknownDeploymentReturn);
        }
    }
    Ok(())
}

/// A trusted operational loader extracts this only from an immutable, successful
/// Applied transition journal. Arbitrary user JSON or reports are not evidence.
/// The loader must establish completeness/provenance of the candidate evidence;
/// this pure helper cannot certify database coverage or exclude omitted conflicts.
pub struct AppliedMissionReturnEvidence<'a> {
    pub input: &'a OrderedInput,
    pub before: &'a MissionFleet,
    pub after: &'a MissionFleet,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Error)]
pub enum MissionReturnEvidenceError {
    #[error("select an unknown active returning deployment for explicit classification")]
    NotUnknownDeployment,
    #[error(
        "no conclusive return transition supplied; restore authoritative journal evidence or let the fleet settle"
    )]
    MissingEvidence,
    #[error(
        "evidence does not match the retained fleet; reload under the operational barrier and do not infer a cause from timing"
    )]
    StaleEvidence,
    #[error(
        "journal evidence is not a valid deployment return transition; verify the applied journal and producing release"
    )]
    InvalidEvidence,
    #[error(
        "journal evidence conflicts; resolve its provenance or let the fleet settle without enabling scans"
    )]
    ConflictingEvidence,
}

/// Explicit, read-only classification of a caller-bounded evidence set. No queries
/// or writes are performed. A result is not scan readiness or permission to write.
/// Future backfill must compare-and-set the exact inspected retained record under
/// the operational barrier, adding only the causal fact, and recheck readiness.
pub fn classify_legacy_deployment_return(
    retained: &MissionFleet,
    evidence: &[AppliedMissionReturnEvidence<'_>],
) -> Result<MissionReturnReason, MissionReturnEvidenceError> {
    use MissionReturnEvidenceError::*;
    if retained.intent.mission != Mission::Deploy
        || retained.leg != MissionLeg::Returning
        || retained.return_reason.is_some()
    {
        return Err(NotUnknownDeployment);
    }
    let mut proven = None;
    for record in evidence {
        let mut after = record.after.clone();
        // Old writers can erase an already-recorded cause on a full JSON rewrite.
        // Compare every other fact; never relax revision/commitment equality.
        after.return_reason = None;
        if after != *retained {
            return Err(StaleEvidence);
        }
        let before = record.before;
        if before.id != retained.id
            || before.owner != retained.owner
            || before.leg != MissionLeg::Outbound
            || before.return_reason.is_some()
            || before.intent != retained.intent
            || before.terms != retained.terms
            || before.generation.checked_add(1) != Some(retained.generation)
            || before.revision.checked_add(1) != Some(retained.revision)
        {
            return Err(InvalidEvidence);
        }
        // These two deployment transitions change only leg/deadline/counters
        // (and the new cause). Reject mismatched cargo, manifest, authorization,
        // coordinates or other facts rather than stitching unrelated snapshots.
        let mut expected = before.clone();
        expected.leg = MissionLeg::Returning;
        expected.due_at = retained.due_at;
        expected.generation = retained.generation;
        expected.revision = retained.revision;
        if expected != after {
            return Err(InvalidEvidence);
        }
        let reason = match (&record.input.actor, &record.input.payload) {
            (
                Actor::Player(owner),
                Input::Command(Command::World {
                    action: WorldAction::RecallMission { fleet },
                }),
            ) if *owner == retained.owner && *fleet == retained.id => {
                MissionReturnReason::VoluntaryRecall
            }
            (
                Actor::Scheduler,
                Input::Event(ScheduledEvent::FleetLegDue {
                    fleet,
                    generation,
                    expected_leg: MissionLeg::Outbound,
                }),
            ) if *fleet == retained.id && *generation == before.generation => {
                MissionReturnReason::InvalidTarget
            }
            _ => return Err(InvalidEvidence),
        };
        if record.after.return_reason.is_some_and(|r| r != reason)
            || proven.is_some_and(|r| r != reason)
        {
            return Err(ConflictingEvidence);
        }
        proven = Some(reason);
    }
    proven.ok_or(MissingEvidence)
}
