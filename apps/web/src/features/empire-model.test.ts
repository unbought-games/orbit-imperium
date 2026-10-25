import { expect, it } from 'vitest'
import type { BoundView } from '../client-model/commands'
import {
  bodyTraffic,
  empireFlights,
  empireNodes,
  empirePaths,
  empireTotals,
  storagePercent,
} from './empire-model'

function fixture() {
  return {
    protocol: 4,
    bodies: [
      {
        id: 'a',
        kind: 'Planet',
        coordinates: { galaxy: 1, system: 2, position: 4 },
        amounts: {
          metal: '900719925474099300',
          crystal: '1500000',
          deuterium: '0',
        },
      },
      {
        id: 'moon',
        kind: 'Moon',
        coordinates: { galaxy: 1, system: 2, position: 4 },
        amounts: { metal: '7', crystal: '1500000', deuterium: '9' },
      },
      {
        id: 'b',
        kind: 'Planet',
        coordinates: { galaxy: 1, system: 3, position: 8 },
        amounts: { metal: '3', crystal: '0', deuterium: '1' },
      },
    ],
    destinations: [],
    missions: {
      fleets: [
        {
          id: 'own',
          intent: {
            origin: 'a',
            destination: { type: 'Body', id: 'b' },
            mission: 'Transport',
          },
          origin: { galaxy: 1, system: 2, position: 4 },
          destination: { galaxy: 1, system: 3, position: 8 },
          leg: 'Outbound',
          due_at: 200,
          ships: [{ ship_type: 'SmallCargo', count: '9007199254740993' }],
        },
      ],
      incoming: [
        {
          sender: 'enemy',
          target: 'moon',
          mission: 'Attack',
          origin: { galaxy: 1, system: 4, position: 5 },
          arrival_at: 100,
          ships: { visibility: 'Unknown' },
        },
      ],
    },
  } as unknown as Extract<BoundView, { protocol: 4 }>
}
it('counts each fleet once across an empire and keeps colocated moons separate', () => {
  const flights = empireFlights(fixture())
  expect(flights.map((f) => f.key)).toEqual(['incoming:0', 'own'])
  expect(bodyTraffic(flights, 'a')).toMatchObject({
    incoming: [],
    outgoing: [{ key: 'own' }],
  })
  expect(bodyTraffic(flights, 'b')).toMatchObject({
    incoming: [{ key: 'own' }],
    outgoing: [],
  })
  expect(bodyTraffic(flights, 'moon')).toMatchObject({
    incoming: [{ hostile: true }],
    outgoing: [],
  })
  expect(flights[1].ships).toBe('9007199254740993 Small Cargo')
})
it('reverses a returning flight without treating an owned attack as an incoming threat', () => {
  const view = fixture()
  view.missions.fleets[0].leg = 'Returning'
  view.missions.fleets[0].intent.mission = 'Attack'
  const flights = empireFlights(view)
  expect(flights[1]).toMatchObject({
    from: 'b',
    to: 'a',
    route: '[1:3:8] → [1:2:4]',
    hostile: false,
  })
  expect(bodyTraffic(flights, 'a').incoming).toHaveLength(1)
  expect(bodyTraffic(flights, 'a').outgoing).toHaveLength(0)
})
it('keeps debris destinations distinct from a body at the same coordinates', () => {
  const view = fixture()
  view.missions.fleets[0].intent.destination = {
    type: 'Debris',
    coordinates: view.bodies[2].coordinates,
    field_identity: 'debris',
  }
  expect(bodyTraffic(empireFlights(view), 'b').incoming).toEqual([])
})
it('preserves every visibility tier without inventing ship details', () => {
  const view = fixture()
  expect(empireFlights(view)[0].ships).toBe('Ship composition unknown')
  view.missions.incoming[0].ships = {
    visibility: 'Total',
    total: '9007199254740993',
  }
  expect(empireFlights(view)[0].ships).toBe(
    '9007199254740993 ships · Types unknown',
  )
  view.missions.incoming[0].ships = {
    visibility: 'Types',
    total: '8',
    types: ['SmallCargo', 'LightFighter'],
  }
  expect(empireFlights(view)[0].ships).toBe(
    '8 ships · Small Cargo, Light Fighter',
  )
  view.missions.incoming[0].ships = {
    visibility: 'Exact',
    total: '8',
    ships: [{ ship_type: 'LightFighter', count: '8' }],
  }
  expect(empireFlights(view)[0].ships).toBe('8 Light Fighter')
})
it('sums micro-resources exactly before formatting and clamps storage meters', () => {
  expect(empireTotals(fixture())).toEqual({
    metal: '900719925474099310',
    crystal: '3000000',
    deuterium: '10',
  })
  expect(storagePercent('900719925474099300', '1801439850948198600')).toBe(50)
  expect(storagePercent('200', '100')).toBe(100)
  expect(storagePercent('10', '0')).toBe(0)
})
it('retains legacy missions, excludes completed fleets and keeps unknown locations honest', () => {
  const view = {
    ...fixture(),
    protocol: 2,
    fleets: [
      {
        id: 'legacy',
        origin: 'a',
        target: 'unknown',
        status: 'Returning',
        due_at: 100,
        ships: [],
      },
      { id: 'done', status: 'Completed' },
    ],
  } as unknown as BoundView
  expect(empireFlights(view)).toMatchObject([
    {
      key: 'legacy',
      to: 'a',
      from: 'unknown',
      route: 'Unrevealed location → [1:2:4]',
    },
  ])
})
it('lays out every body deterministically without mutating the source', () => {
  const view = fixture(),
    original = structuredClone(view.bodies)
  const nodes = empireNodes(view.bodies)
  expect(nodes.map((n) => n.body.id)).toEqual(
    empireNodes([...view.bodies].reverse()).map((n) => n.body.id),
  )
  expect(nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y))).toBe(
    true,
  )
  expect(empireNodes([])).toEqual([])
  expect(empireNodes([view.bodies[0]])).toHaveLength(1)
  expect(view.bodies).toEqual(original)
})

it('draws only known owned routes and switches dense networks to the roster', () => {
  const view = fixture()
  expect(
    empirePaths(empireNodes(view.bodies), empireFlights(view)).map(
      (path) => path.key,
    ),
  ).toEqual(['own'])
  const many = Array.from({ length: 16 }, (_, i) => ({
    ...view.bodies[0],
    id: `body-${i}`,
  }))
  expect(empirePaths(empireNodes(many), empireFlights(view))).toEqual([])
})

it.each([
  ['Attack', true],
  ['Espionage', true],
  ['Transport', false],
  ['Deploy', false],
  ['Harvest', false],
  ['Colonize', false],
] as const)(
  'classifies incoming %s consistently without flagging owned fleets',
  (mission, hostile) => {
    const view = fixture()
    view.missions.incoming[0].mission = mission
    view.missions.fleets[0].intent.mission = mission
    expect(empireFlights(view).map((flight) => flight.hostile)).toEqual([
      hostile,
      false,
    ])
    view.missions.fleets[0].leg = 'Returning'
    expect(empireFlights(view).map((flight) => flight.hostile)).toEqual([
      hostile,
      false,
    ])
  },
)
