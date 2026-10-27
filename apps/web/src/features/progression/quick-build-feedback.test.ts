import { expect, it } from 'vitest'
import { createGameStore } from '../../client-model/game-store'
import type { Attempt, BoundView } from '../../client-model/commands'
import { quickBuildFeedback } from './quick-build-feedback'

const target = {
  body: 'planet',
  item: { kind: 'Building', id: 'SolarPlant' },
} as const
const gesture = { key: 'build', at: 100 }
function fixture(status: Attempt['status'] = 'committed') {
  const state = createGameStore().getState()
  state.now = 100
  state.receivedAt = 100
  const binding = { account: 'a', player: 'p', universe: 'u', epoch: 'e' }
  const paid = { metal: '0', crystal: '0', deuterium: '0' }
  state.view = {
    protocol: 3,
    binding,
    request_id: 'r',
    viewer_revision: '1',
    sampled_at: 1000,
    as_of_ms: 1000,
    speed: 1,
    profile_hash: 'hash',
    catalog: [],
    capabilities: [],
    research: [],
    reports: [],
    fleets: [],
    destinations: [],
    reports_truncated: false,
    destinations_truncated: false,
    bodies: [
      {
        id: 'planet',
        kind: 'Planet',
        coordinates: { galaxy: 1, system: 1, position: 1 },
        levels: { SolarPlant: 1 },
        amounts: paid,
        capacity: paid,
        fields: 10,
        fields_used: 1,
        fields_reserved: 0,
        energy: { supply: '0', demand: '0', utilization: '0' },
        inventories: [],
      },
    ],
    constructions: [
      {
        id: 'operation',
        body: 'planet',
        building: 'SolarPlant',
        target_level: 2,
        due_at: 61000,
        paid,
      },
    ],
    progression: {
      production: [],
      research_operation: null,
      manufacturing: [],
      limits: { max_active_manufacturing_entries: 256 },
    },
  } as BoundView
  const attempt: Attempt = {
    envelope: {
      protocol: 3,
      binding,
      command_id: 'build',
      command: {
        type: 'StartUpgrade',
        body: 'planet',
        building: 'SolarPlant',
        expected_terms_hash: 'hash',
      },
    },
    status,
    receipt: null,
    reconciled: status === 'committed',
  }
  state.attempts.set('build', attempt)
  return state
}

it('holds the optimistic check for three seconds even when confirmation arrives immediately', () => {
  const state = fixture()
  expect(quickBuildFeedback(state, target, gesture).phase).toBe('check')
  state.now = 3099
  expect(quickBuildFeedback(state, target, gesture).phase).toBe('check')
  state.now = 3100
  expect(quickBuildFeedback(state, target, gesture).phase).toBe('countdown')
  expect(state.view!.bodies[0].levels.SolarPlant).toBe(1)
})
it('does not replay acknowledgment when revisiting a row or switching planets', () => {
  const state = fixture()
  expect(quickBuildFeedback(state, target, null).phase).toBe('countdown')
  expect(
    quickBuildFeedback(state, { ...target, body: 'moon' }, gesture).phase,
  ).toBe('hammer')
})
it.each(['rejected', 'uncertain'] as const)(
  'replaces the check immediately on %s',
  (status) => {
    const state = fixture(status)
    state.view!.constructions = []
    const feedback = quickBuildFeedback(state, target, gesture)
    expect(feedback.phase).toBe(status === 'rejected' ? 'hammer' : 'uncertain')
    expect(feedback.recoveryId).toBe(status === 'uncertain' ? 'build' : null)
    expect(!!feedback.problem).toBe(status === 'rejected')
  },
)
it('waits for an authoritative completion instead of advancing the level or replaying success', () => {
  const state = fixture()
  state.now = 60100
  expect(quickBuildFeedback(state, target, gesture)).toMatchObject({
    phase: 'pending',
    status: 'Checking completion',
  })
  expect(state.view!.bodies[0].levels.SolarPlant).toBe(1)
  state.view!.constructions = []
  state.view!.bodies[0].levels.SolarPlant = 2
  expect(quickBuildFeedback(state, target, gesture).phase).toBe('hammer')
})
