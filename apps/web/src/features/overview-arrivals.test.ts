import { expect, it } from 'vitest'
import type { BoundView } from '../client-model/commands'
import { overviewArrivals } from './overview-arrivals'
const coords = { galaxy: 1, system: 2, position: 3 }
const remote = { galaxy: 1, system: 2, position: 4 }
const huge = '9007199254740993'
const view = {
  protocol: 4,
  bodies: [
    { id: 'planet', kind: 'Planet', coordinates: coords },
    { id: 'moon', kind: 'Moon', coordinates: coords },
  ],
  missions: {
    incoming: [
      {
        target: 'planet',
        mission: 'Attack',
        origin: remote,
        arrival_at: 200,
        ships: { visibility: 'Unknown' },
      },
      {
        target: 'moon',
        mission: 'Transport',
        origin: remote,
        arrival_at: 50,
        ships: { visibility: 'Total', total: huge },
      },
    ],
    fleets: [
      {
        id: 'return',
        intent: {
          origin: 'planet',
          mission: 'Transport',
          destination: { type: 'Body', id: 'remote' },
        },
        origin: coords,
        destination: remote,
        leg: 'Returning',
        due_at: 100,
        ships: [{ count: huge, ship_type: 'SmallCargo' }],
      },
      {
        id: 'moon-only',
        intent: {
          origin: 'moon',
          mission: 'Transport',
          destination: { type: 'Body', id: 'remote' },
        },
        origin: coords,
        destination: remote,
        leg: 'Outbound',
        due_at: 1,
        ships: [],
      },
    ],
  },
} as unknown as Extract<BoundView, { protocol: 4 }>
it('selects by body identity, orders deadlines, and reverses the returning route', () => {
  const arrivals = overviewArrivals(view, 'planet')
  expect(arrivals.map((arrival) => arrival.key)).toEqual([
    'return',
    'incoming:0',
  ])
  expect(arrivals[0]).toMatchObject({
    route: '[1:2:4] → [1:2:3]',
    ships: `${huge} Small Cargo`,
    item: 'return',
  })
  expect(arrivals[1].ships).toBe('Ship composition unknown')
  expect(overviewArrivals(view, 'missing')).toEqual([])
})
it('preserves visibility tiers and large ship counts without revealing unknown types', () => {
  expect(overviewArrivals(view, 'moon')[1].ships).toBe(
    `${huge} ships · Types unknown`,
  )
  const exact = structuredClone(view)
  exact.missions.incoming[0].ships = {
    visibility: 'Exact',
    total: huge,
    ships: [{ count: huge, ship_type: 'SmallCargo' }],
  }
  expect(overviewArrivals(exact, 'planet')[1].ships).toBe(`${huge} Small Cargo`)
  exact.missions.incoming[0].ships = {
    visibility: 'Types',
    total: huge,
    types: ['SmallCargo'],
  }
  expect(overviewArrivals(exact, 'planet')[1].ships).toBe(
    `${huge} ships · Small Cargo`,
  )
})

it('retains legacy fleet arrivals without substituting unknown locations', () => {
  const legacy = {
    protocol: 2,
    bodies: view.bodies,
    destinations: [],
    fleets: [
      {
        id: 'legacy',
        origin: 'planet',
        target: 'unknown',
        status: 'Returning',
        due_at: 100,
        ships: [{ count: huge, ship_type: 'SmallCargo' }],
      },
      {
        id: 'completed',
        origin: 'planet',
        target: 'unknown',
        status: 'Completed',
        due_at: 1,
        ships: [],
      },
    ],
  } as unknown as BoundView
  expect(overviewArrivals(legacy, 'planet')).toEqual([
    {
      key: 'legacy',
      item: 'legacy',
      mission: 'Transport · Returning',
      route: 'Unrevealed location → [1:2:3]',
      due: 100,
      ships: `${huge} Small Cargo`,
    },
  ])
})
