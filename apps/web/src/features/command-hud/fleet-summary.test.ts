import { describe, expect, it } from 'vitest'
import { bootstrapFixture } from '../../test-support/bootstrap'
import { createGameStore } from '../../client-model/game-store'
import type { Attempt } from '../../client-model/commands'
import type { components } from '../../contracts'
import {
  fleetSummaryRows,
  fleetFlight,
  fleetShipCount,
  ownFleetTone,
  enemyAttackRows,
} from './fleet-summary'

type S = components['schemas']
function fixture() {
  const { result } = bootstrapFixture(4)
  if (
    result.status !== 'authenticated' ||
    result.game.status !== 'ready' ||
    result.game.snapshot.view.protocol !== 4
  )
    throw Error('Fixture not ready')
  const view = result.game.snapshot.view
  return { ...createGameStore().getState(), view, binding: view.binding }
}
const intent: S['FleetIntent4'] = {
  origin: 'home',
  destination: {
    type: 'EmptyPosition',
    slot_revision: '1',
    coordinates: { galaxy: 1, system: 2, position: 3 },
  },
  mission: 'Colonize',
  ships: [{ owner: 'player', ship_type: 'ColonyShip', count: '1' }],
  cargo: { metal: '0', crystal: '0', deuterium: '0' },
  speed_percent: 100,
}
function fleet(
  id: string,
  dueAt: number,
  leg: S['OwnMission4']['leg'] = 'Outbound',
): S['OwnMission4'] {
  return {
    id,
    intent,
    origin: { galaxy: 1, system: 1, position: 1 },
    destination: { galaxy: 1, system: 2, position: 3 },
    leg,
    ships: intent.ships,
    cargo: intent.cargo,
    due_at: dueAt,
    launched_at: 0,
    duration_ms: dueAt,
    paid_fuel: '0',
    can_recall: leg === 'Outbound',
  }
}
function departure(
  state: ReturnType<typeof fixture>,
  status: Attempt['status'] = 'uncertain',
) {
  const attempt: Attempt = {
    envelope: {
      protocol: 4,
      binding: state.view.binding,
      command_id: 'launch',
      presence: null,
      command: {
        type: 'World',
        action: { type: 'LaunchFleet', intent, expected_terms_hash: 'hash' },
      },
    },
    status,
    receipt: null,
    reconciled: false,
  }
  state.attempts.set('launch', attempt)
  state.intents.set('launch', {
    submittedAt: 0,
    baseRevision: state.view.viewer_revision,
  })
  return attempt
}

describe('empire fleet summary', () => {
  it('includes every origin, sorts by authoritative due time, and keeps home and target fixed across legs', () => {
    const state = fixture()
    const other = {
      ...fleet('other', 8000),
      intent: { ...intent, origin: 'other-world' },
    }
    state.view.missions.fleets = [other, fleet('homeward', 2000, 'Returning')]
    expect(fleetSummaryRows(state)).toMatchObject([
      {
        id: 'homeward',
        home: { address: '[1:1:1]' },
        target: { address: '[1:2:3]' },
        leg: 'Returning',
        dueAt: 2000,
        ships: [{ ship_type: 'ColonyShip', count: '1' }],
      },
      {
        id: 'other',
        origin: 'other-world',
        home: { address: '[1:1:1]' },
        target: { address: '[1:2:3]' },
        dueAt: 8000,
      },
    ])
    expect(state.view.missions.fleets.map((fleet) => fleet.id)).toEqual([
      'other',
      'homeward',
    ])
  })
  it('keeps overdue fleets until the server removes them', () => {
    const state = fixture()
    state.now = 50000
    state.view.missions.fleets = [fleet('overdue', 2000)]
    expect(fleetSummaryRows(state)[0].dueAt).toBe(2000)
    state.view.missions.fleets = []
    expect(fleetSummaryRows(state)).toEqual([])
  })
  it('shows unresolved launch facts with no invented ETA and removes rejected attempts', () => {
    const state = fixture()
    const attempt = departure(state)
    expect(fleetSummaryRows(state)).toMatchObject([
      {
        key: 'launch',
        mission: 'Colonize',
        leg: 'Launching',
        target: { address: '[1:2:3]' },
        dueAt: null,
        status: 'Awaiting confirmation',
      },
    ])
    state.intents.clear()
    expect(fleetSummaryRows(state)).toHaveLength(1)
    attempt.status = 'pending'
    expect(fleetSummaryRows(state)[0].status).toBe('Confirming departure')
    attempt.status = 'rejected'
    expect(fleetSummaryRows(state)).toEqual([])
  })
  it('reconciles an accepted departure into one authoritative fleet', () => {
    const state = fixture()
    const attempt = departure(state, 'committed')
    attempt.receipt = {
      protocol: 4,
      binding: state.view.binding,
      command_id: 'launch',
      admitted_at: 0,
      executed_at: 0,
      status: 'Committed',
      result_ids: ['fleet'],
      minimum_viewer_revision: '1',
    }
    expect(fleetSummaryRows(state)).toMatchObject([
      { id: 'fleet', dueAt: null },
    ])
    state.view.viewer_revision = '1'
    state.view.missions.fleets = [fleet('fleet', 9000)]
    expect(fleetSummaryRows(state)).toHaveLength(1)
    expect(fleetSummaryRows(state)[0].dueAt).toBe(9000)
  })
  it('uses body names and coordinates for pending body destinations', () => {
    const state = fixture()
    state.view.destinations = [
      {
        id: 'target',
        name: 'Outpost',
        kind: 'Planet',
        coordinates: { galaxy: 1, system: 3, position: 7 },
      },
    ]
    const attempt = departure(state)
    if (
      attempt.envelope.command.type !== 'World' ||
      attempt.envelope.command.action.type !== 'LaunchFleet'
    )
      throw Error('Expected launch')
    attempt.envelope.command.action.intent = {
      ...intent,
      destination: {
        type: 'Body',
        id: 'target',
        expected_owner: 'other',
        expected_kind: 'Planet',
      },
    }
    expect(fleetSummaryRows(state)[0].target).toMatchObject({
      name: 'Outpost',
      address: '[1:3:7]',
      kind: 'Planet',
    })
    state.view.destinations = []
    expect(fleetSummaryRows(state)[0].target.address).toBe(
      'Coordinates unavailable',
    )
  })
})

it('sums massive mixed fleets without losing integer precision', () => {
  expect(
    fleetShipCount([
      { ship_type: 'LightFighter', count: '9007199254740993' },
      { ship_type: 'Cruiser', count: '60000' },
      { ship_type: 'Destroyer', count: '4000' },
    ]),
  ).toBe(9007199254804993n)
  expect(fleetShipCount([])).toBe(0n)
})

it('places outbound and returning fleets on the same home-to-target route with one relative time', () => {
  const state = fixture()
  state.view.missions.fleets = [fleet('out', 8000)]
  const row = fleetSummaryRows(state)[0]
  expect(fleetFlight(row, 0).position).toBe(0)
  expect(fleetFlight(row, 4000)).toMatchObject({
    position: 0.5,
    x: 160,
    y: 14,
    label: 'Arrives in',
    time: '4s',
  })
  expect(fleetFlight(row, 8000)).toMatchObject({
    position: 1,
    label: null,
    time: 'Awaiting confirmation',
  })
  const returning = { ...row, leg: 'Returning' as const, dueAt: 16000 }
  expect(fleetFlight(returning, 8000).position).toBe(1)
  expect(fleetFlight(returning, 12000)).toMatchObject({
    position: 0.5,
    label: 'Home in',
    time: '4s',
  })
  expect(fleetFlight(returning, 16000).position).toBe(0)
  expect(
    fleetFlight(returning, 12000).angle - fleetFlight(row, 4000).angle,
  ).toBe(180)
})

it('turns early recalls back from their actual fraction of the route and clamps overdue markers', () => {
  const state = fixture()
  state.view.missions.fleets = [fleet('recall', 4000, 'Returning')]
  const row = { ...fleetSummaryRows(state)[0], duration: 10000 }
  expect(fleetFlight(row, 2000).position).toBe(0.2)
  expect(fleetFlight(row, 3000).position).toBe(0.1)
  expect(fleetFlight(row, 5000)).toMatchObject({
    position: 0,
    label: null,
    time: 'Awaiting confirmation',
  })
  expect(fleetFlight({ ...row, duration: 0 }, 2000).position).toBe(0)
})

it('keeps pending departures at home without inventing a time or flight progress', () => {
  const state = fixture()
  departure(state)
  expect(fleetFlight(fleetSummaryRows(state)[0], 999999)).toMatchObject({
    position: 0,
    label: null,
    time: 'Awaiting confirmation',
  })
})

it.each([
  ['Attack', 'attack'],
  ['Espionage', 'attack'],
  ['Transport', 'peaceful'],
  ['Harvest', 'peaceful'],
  ['Colonize', 'peaceful'],
  ['Deploy', 'peaceful'],
] as const)('colors owned %s missions as %s on either leg', (mission, tone) => {
  expect(ownFleetTone(mission)).toBe(tone)
})

it('keeps enemy attacks separate, arrival-ordered and honest about hidden ships and unknown progress', () => {
  const state = fixture()
  state.view.destinations = [
    {
      id: 'home',
      kind: 'Planet',
      name: 'Home',
      coordinates: { galaxy: 1, system: 1, position: 1 },
    },
    {
      id: 'enemy',
      kind: 'Planet',
      name: 'Enemy world',
      coordinates: { galaxy: 1, system: 2, position: 3 },
    },
  ]
  const attack: S['IncomingMission4'] = {
    sender: 'enemy',
    origin: { galaxy: 1, system: 2, position: 3 },
    target: 'home',
    mission: 'Attack',
    arrival_at: 5000,
    ships: { visibility: 'Unknown' },
  }
  state.view.missions.incoming = [
    attack,
    { ...attack, mission: 'Transport' },
    { ...attack, mission: 'Espionage' },
    {
      ...attack,
      arrival_at: 2000,
      ships: {
        visibility: 'Exact',
        total: '12',
        ships: [{ ship_type: 'Cruiser', count: '12' }],
      },
    },
  ]
  const entries = enemyAttackRows(state)
  expect(entries).toHaveLength(2)
  expect(entries[0].row).toMatchObject({
    leg: 'Incoming',
    dueAt: 2000,
    duration: null,
    ships: [{ ship_type: 'Cruiser', count: '12' }],
    home: { name: 'Home' },
    target: { name: 'Unknown origin', address: '[1:2:3]', kind: 'Unknown' },
  })
  expect(entries[1].row.ships).toEqual([])
  expect(fleetFlight(entries[1].row, 1000)).toMatchObject({
    position: null,
    angle: 225,
    label: 'Arrives in',
    time: '4s',
  })
  state.now = 999999
  expect(enemyAttackRows(state)).toHaveLength(2)
  state.view.missions.incoming = []
  expect(enemyAttackRows(state)).toEqual([])
})

it('never infers enemy origin identity or planet/moon art from a shared coordinate slot', () => {
  const state = fixture()
  const origin = { galaxy: 1, system: 2, position: 3 }
  const planet: S['Destination'] = {
    id: 'enemy-planet',
    kind: 'Planet',
    name: 'Enemy planet',
    coordinates: origin,
  }
  const moon: S['Destination'] = {
    id: 'enemy-moon',
    kind: 'Moon',
    name: 'Enemy moon',
    coordinates: origin,
  }
  state.view.missions.incoming = [
    {
      sender: 'enemy',
      origin,
      target: 'home',
      mission: 'Attack',
      arrival_at: 5000,
      ships: { visibility: 'Unknown' },
    },
  ]
  for (const candidates of [[planet, moon], [moon, planet], [planet], [moon]]) {
    state.view.destinations = candidates
    expect(enemyAttackRows(state)[0].row.target).toEqual({
      name: 'Unknown origin',
      address: '[1:2:3]',
      kind: 'Unknown',
    })
  }
})
