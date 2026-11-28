import assert from 'node:assert/strict'
import test from 'node:test'
import { workerLatency } from './worker-latency.mjs'

test('admission cohorts retain missing orders, split sources and modes, and count recovered inputs once', async () => {
  const start = 10_000_000
  const base = { universe: 'u', action: 'fleet_dispatch', logical_at_ms: 42 }
  const admit = (id, source, at = start) => ({
    ...base,
    event: 'command_admitted',
    input_id: id,
    source,
    admission_ack_us: at,
  })
  const attempt = (id, mode, outcome, claim, ack) => ({
    ...base,
    event: 'worker_input_attempt',
    input_id: id,
    mode,
    outcome,
    claim_ack_us: start + claim,
    commit_ack_us: ack == null ? undefined : start + ack,
    fact_load_us: 300,
  })
  const a = {
    ...admit('a', 'foreground'),
    admission_alliance_wait_us: 400,
    admission_alliance_hold_us: 900,
  }
  const b = admit('b', 'machine')
  const applied = {
    ...attempt('a', 'serial', 'applied', 999_000, 1_000_000),
    alliance_wait_us: 200,
    alliance_hold_us: 700,
  }
  const report = await workerLatency(
    [
      applied,
      b,
      a,
      a,
      applied,
      {
        ...attempt('a', 'serial', 'retry', 50_000),
        event: 'worker_input_claimed',
      },
      attempt('a', 'serial', 'existing', 1_500_000),
      attempt('b', 'scoped', 'rejected', 100, 1_000_001),
      admit('c', 'foreground'),
      admit('d', 'machine'),
      attempt('d', 'scoped', 'applied', -200, 800),
      admit('skew', 'machine'),
      attempt('skew', 'scoped', 'applied', 200, 100),
      admit('e', 'foreground', start + 10),
      { ...a, event: 'old' },
      attempt('orphan', 'serial', 'applied', 0, 3),
      { ...a, admission_ack_us: undefined },
    ],
    start,
    start + 10,
    'fleet_dispatch',
  )
  assert.equal(report.admissions_without_wall_time_or_source_in_export, 1)
  assert.equal(report.terminals_in_window_without_admission_in_export, 1)
  const serial = report.groups.find((g) => g.mode === 'serial')
  assert.equal(serial.admitted, 1)
  assert.equal(serial.source, 'foreground')
  assert.equal(serial.within_1s, 1)
  assert.equal(
    serial.distributions.admission_to_first_observed_claim.p95_ms,
    50,
  )
  assert.equal(serial.distributions.admission_to_terminal.p99_ms, 1000)
  assert.equal(
    serial.distributions.admission_to_terminal.cumulative_buckets_ms[1000],
    1,
  )
  assert.equal(
    serial.distributions.admission_to_terminal.cumulative_buckets_ms[500],
    0,
  )
  assert.equal(serial.distributions.fact_load.p50_ms, 0.3)
  assert.equal(serial.distributions.admission_alliance_wait.p50_ms, 0.4)
  assert.equal(serial.distributions.admission_alliance_hold.p50_ms, 0.9)
  assert.equal(serial.distributions.alliance_wait.p50_ms, 0.2)
  assert.equal(serial.distributions.alliance_hold.p50_ms, 0.7)
  const scoped = report.groups.find((g) => g.mode === 'scoped')
  assert.equal(scoped.source, 'machine')
  assert.equal(scoped.admitted, 3)
  assert.equal(scoped.rejected, 1)
  assert.equal(scoped.invalid_terminal_clock, 1)
  assert.equal(scoped.claim_before_admission_ack, 1)
  assert.equal(scoped.within_1s, 1)
  assert.equal(scoped.distributions.admission_to_terminal.count, 2)
  assert.equal(
    report.groups.find((g) => g.mode === 'unknown').missing_terminal,
    1,
  )
})
