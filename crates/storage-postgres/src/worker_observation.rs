//! One scheduler attempt. Tokio scopes this to the resolution future. Concurrent
//! attempts, renewals and unrelated SQL on the same thread cannot contribute.
use std::{
    cell::RefCell,
    time::{Duration, Instant},
};

tokio::task_local! { static SAMPLE: RefCell<WorkerSample>; }

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Phase {
    FactLoad,
    CpuQueue,
    CpuExecution,
    Revalidation,
    AllianceWait,
    AllianceHold,
    Persistence,
    ScopedFence,
    Commit,
}

impl Phase {
    pub const ALL: [Self; 9] = [
        Self::FactLoad,
        Self::CpuQueue,
        Self::CpuExecution,
        Self::Revalidation,
        Self::AllianceWait,
        Self::AllianceHold,
        Self::Persistence,
        Self::ScopedFence,
        Self::Commit,
    ];
    pub fn name(self) -> &'static str {
        match self {
            Self::FactLoad => "fact_load",
            Self::CpuQueue => "cpu_queue",
            Self::CpuExecution => "cpu_execution",
            Self::Revalidation => "commit_revalidation",
            Self::AllianceWait => "alliance_wait",
            Self::AllianceHold => "alliance_hold",
            Self::Persistence => "persistence",
            Self::ScopedFence => "scoped_fence",
            Self::Commit => "commit_round_trip",
        }
    }
}

#[derive(Default, Debug)]
pub struct WorkerSample {
    phases: [Option<Duration>; Phase::ALL.len()],
    pub fact_lots_read: u64,
    pub revalidation_lots_read: u64,
    pub fact_stacks_read: u64,
    pub revalidation_stacks_read: u64,
    pub stacks_written: u64,
    pub lots_inserted: u64,
    pub lots_deleted: u64,
    pub commit_ack_us: Option<u64>,
    pub terminal: Option<&'static str>,
    read_phase: Option<Phase>,
}

impl WorkerSample {
    pub fn duration(&self, phase: Phase) -> Option<Duration> {
        self.phases[phase as usize]
    }
}

pub async fn collect<T>(work: impl Future<Output = T>) -> (T, WorkerSample) {
    SAMPLE
        .scope(RefCell::default(), async {
            let result = work.await;
            (result, SAMPLE.with(RefCell::take))
        })
        .await
}

pub fn duration(phase: Phase, value: Duration) {
    let _ = SAMPLE.try_with(|s| s.borrow_mut().phases[phase as usize] = Some(value));
}

pub(crate) struct Timer(Phase, Instant);
impl Timer {
    pub fn start(phase: Phase) -> Self {
        if matches!(phase, Phase::FactLoad | Phase::Revalidation) {
            let _ = SAMPLE.try_with(|s| s.borrow_mut().read_phase = Some(phase));
        }
        Self(phase, Instant::now())
    }
}
impl Drop for Timer {
    fn drop(&mut self) {
        duration(self.0, self.1.elapsed());
        if matches!(self.0, Phase::FactLoad | Phase::Revalidation) {
            let _ = SAMPLE.try_with(|s| s.borrow_mut().read_phase = None);
        }
    }
}

pub(crate) fn read_stacks(count: usize) {
    let _ = SAMPLE.try_with(|s| {
        let mut s = s.borrow_mut();
        match s.read_phase {
            Some(Phase::FactLoad) => s.fact_stacks_read += count as u64,
            Some(Phase::Revalidation) => s.revalidation_stacks_read += count as u64,
            _ => {}
        }
    });
}

pub(crate) fn wrote_stacks(count: u64) {
    let _ = SAMPLE.try_with(|s| s.borrow_mut().stacks_written += count);
}

pub(crate) fn acknowledged(outcome: &orbit_engine::TransitionResult) {
    let _ = SAMPLE.try_with(|cell| {
        let mut sample = cell.borrow_mut();
        sample.commit_ack_us = orbit_application::diagnostics::wall_time_us();
        sample.terminal = match outcome {
            orbit_engine::TransitionResult::Applied(_) => Some("applied"),
            orbit_engine::TransitionResult::Rejected(_) => Some("rejected"),
            orbit_engine::TransitionResult::InvalidState(_) => None,
        };
    });
}
