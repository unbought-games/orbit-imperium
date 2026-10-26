import { expect, it } from 'vitest'
import { createGameStore } from '../client-model/game-store'
import { readyFixture } from '../test-support/bootstrap'
import {
  attemptKey,
  type BoundProgressionOptions,
} from '../client-model/commands'
import { developmentActivity } from './navigation-activity'

const paid = { metal: '100', crystal: '50', deuterium: '0' }
function fixture() {
  const state = createGameStore().getState()
  const view = readyFixture(4).snapshot.view
  if (view.protocol !== 4) throw new Error('Expected protocol 4')
  state.view = view
  state.now = 1_000_000
  return { state, view }
}

it.each([
  ['MetalMine', 'resources'],
  ['SolarPlant', 'resources'],
  ['ResearchLab', 'facilities'],
  ['Shipyard', 'facilities'],
] as const)(
  'marks %s construction only in %s on its planet until the server clears it',
  (building, page) => {
    const { state, view } = fixture()
    view.constructions = [
      { id: 'work', body: 'home', building, target_level: 2, due_at: 1, paid },
    ]
    expect([...developmentActivity(state, 'home')]).toEqual([page])
    expect([...developmentActivity(state, 'colony')]).toEqual([])
    view.constructions = []
    expect([...developmentActivity(state, 'home')]).toEqual([])
  },
)

it('marks account-wide research on either planet and independently marks producing and queued units', () => {
  const { state, view } = fixture()
  view.progression.research_operation = {
    id: 'research',
    host: 'colony',
    research: 'EnergyTechnology',
    source_level: 1,
    target_level: 2,
    paid,
    started_at: 1,
    due_at: 2,
    labs: [],
    effective_lab: '1',
    can_cancel: true,
  }
  const batch = {
    body: 'home',
    quantity: '2',
    remaining: '1',
    completed_prefix: '1',
    paid,
    accepted_at: 1,
    first_start_at: 1,
    next_due_at: 2,
    final_due_at: 3,
    unit_duration_ms: 1,
    can_cancel: false as const,
  }
  view.progression.manufacturing = [
    {
      ...batch,
      id: 'ship',
      item: { kind: 'Ship', id: 'SolarSatellite' },
      state: 'Producing',
    },
    {
      ...batch,
      id: 'defense',
      item: { kind: 'Defense', id: 'RocketLauncher' },
      state: 'PaidQueued',
    },
  ]
  expect(developmentActivity(state, 'home')).toEqual(
    new Set(['research', 'shipyard', 'defense']),
  )
  expect([...developmentActivity(state, 'colony')]).toEqual(['research'])
  expect([...developmentActivity(state)]).toEqual(['research'])
  view.progression.manufacturing[0].remaining = '0'
  expect([...developmentActivity(state, 'home')]).toEqual([
    'research',
    'defense',
  ])
  view.progression.research_operation = null
  view.progression.manufacturing = []
  expect([...developmentActivity(state, 'home')]).toEqual([])
})

it('includes unresolved submitted work and removes rejected work without storing badge state', () => {
  const { state, view } = fixture()
  const quote: BoundProgressionOptions = {
    protocol: 4,
    binding: view.binding,
    request_id: 'q',
    viewer_revision: view.viewer_revision,
    sampled_at: 1000,
    as_of_ms: 1000,
    terms_hash: 'hash',
    blockers: [],
    estimates: null,
    request: {
      type: 'Manufacture',
      body: 'home',
      item: { kind: 'Defense', id: 'RocketLauncher' },
      quantity: '2',
    },
    terms: {
      type: 'Manufacture',
      profile_hash: view.profile_hash,
      body: 'home',
      item: { kind: 'Defense', id: 'RocketLauncher' },
      quantity: '2',
      unit_cost: paid,
      paid,
      unit_duration_ms: 1000,
      formula: 'ManufactureClassic',
      facilities: [],
    },
  }
  const key = attemptKey(view.binding, 'order')
  state.attempts.set(key, {
    envelope: {
      protocol: 4,
      binding: view.binding,
      command_id: 'order',
      presence: null,
      command: {
        type: 'StartManufacture',
        body: 'home',
        item: { kind: 'Defense', id: 'RocketLauncher' },
        quantity: '2',
        expected_terms_hash: 'hash',
      },
    },
    status: 'submitting',
    receipt: null,
    reconciled: false,
  })
  state.intents.set(key, {
    quote,
    submittedAt: 1000,
    baseRevision: view.viewer_revision,
  })
  expect([...developmentActivity(state, 'home')]).toEqual(['defense'])
  state.attempts.get(key)!.status = 'uncertain'
  expect([...developmentActivity(state, 'home')]).toEqual(['defense'])
  state.attempts.get(key)!.status = 'rejected'
  expect([...developmentActivity(state, 'home')]).toEqual([])
})

it('supports legacy construction and an empty session', () => {
  const state = createGameStore().getState()
  expect([...developmentActivity(state, 'home')]).toEqual([])
  state.view = readyFixture(2).snapshot.view
  state.view.constructions = [
    {
      id: 'work',
      body: 'home',
      building: 'MetalMine',
      target_level: 2,
      due_at: 1,
      paid,
    },
  ]
  expect([...developmentActivity(state, 'home')]).toEqual(['resources'])
})
