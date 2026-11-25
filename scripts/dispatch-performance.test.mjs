import assert from 'node:assert/strict'
import test from 'node:test'
import { dispatchPerformance } from './dispatch-performance.mjs'

test('missing observations, repeat quotes, capacity failures and replays keep their own denominators', async () => {
  const start = Date.UTC(2026, 10, 25)
  const t = new Date(start + 1000).toISOString()
  const base = { timestamp: t, universe: 'universe' }
  const api = (command_id, request_id, status, admission, elapsed_us) => ({
    ...base,
    event: 'dispatch_api_response',
    command_id,
    request_id,
    status,
    admission,
    elapsed_us,
  })
  const client = (
    observation_id,
    phase,
    elapsed_ms = 0,
    foreground = true,
  ) => ({
    ...base,
    event: 'dispatch_client_observation',
    observation_id,
    phase,
    elapsed_ms,
    foreground,
  })
  const commit = (command_id, outcome) => ({
    ...base,
    event: 'game_transition_committed',
    command_id,
    action: 'fleet_dispatch',
    outcome,
  })
  const admitted = (command_id) => ({
    ...base,
    event: 'command_admitted',
    action: 'fleet_dispatch',
    source: 'foreground',
    command_id,
    admission_ack_us: (start + 600) * 1000,
  })
  const good = api('one', 'a', 202, 'committed', 250_000)
  const report = await dispatchPerformance(
    [
      client('review-1', 'review_started_warm'),
      client('review-1', 'review_ready_reused', 100),
      client('review-2', 'review_started_warm'),
      client('review-2', 'review_ready_fetched', 55),
      client('review-3', 'review_started_warm'),
      client('cold', 'review_started_cold'),
      client('one', 'send_started'),
      good,
      good,
      admitted('one'),
      commit('one', 'applied'),
      client('one', 'accepted', 300),
      client('one', 'confirmed_visible', 1000),
      api('one', 'b', 202, 'replay', 250_001),
      api('two', 'c', 202, 'committed', 400_000),
      admitted('two'),
      commit('two', 'applied'),
      api('denied', 'd', 403, null, 50),
      client('lost', 'send_started'),
      client('lost', 'uncertain', 5050),
      api('limited', 'e', 429, 'rate_limited', 300),
      admitted('game-reject'),
      commit('game-reject', 'rejected'),
      {
        ...base,
        event: 'game_transition_committed',
        action: 'ManufacturingDue',
        input_id: 'work',
        outcome: 'completed',
      },
    ],
    start,
    start + 5000,
  )
  assert.equal(report.review.eligible, 3)
  assert.equal(report.review.within, 1)
  assert.equal(report.review.warm_repeat_requests, 1)
  assert.equal(report.review.missing_ready, 1)
  assert.equal(report.api_acceptance.eligible, 4)
  assert.equal(report.api_acceptance.within, 1)
  assert.equal(report.api_acceptance.replay_responses, 1)
  assert.equal(report.api_acceptance.refused_requests, 1)
  assert.equal(report.visible_launch.eligible, 4)
  assert.equal(report.visible_launch.within, 1)
  assert.equal(report.visible_launch.game_rejected, 1)
  assert.equal(report.visible_launch.uncertain_orders, 1)
  assert.equal(report.visible_launch.capacity_refused, 1)
  assert.equal(report.visible_launch.missing_visible_confirmation, 3)
  assert.equal(report.click_to_acceptance.max_ms, 300)
  assert.deepEqual(report.concurrent_committed_events, { ManufacturingDue: 1 })
})
