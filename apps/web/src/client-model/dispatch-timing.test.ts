import { expect, it } from 'vitest'
import {
  dispatchShips,
  dispatchSelection,
  flightSchedule,
  flightDuration,
} from './dispatch-timing'

it('preserves seconds in flight durations instead of rounding to whole minutes', () => {
  expect(flightDuration(200000)).toBe('3m 20s')
  expect(flightDuration(400000)).toBe('6m 40s')
  expect(flightDuration(3700000)).toBe('1h 1m 40s')
})

it('calculates outbound, return, and total time from server duration', () => {
  expect(flightSchedule(100000, 1000, 'Attack')).toEqual({
    arrival: 101000,
    returnAt: 201000,
    total: 200000,
  })
  expect(flightSchedule(200000, 1000, 'Transport')).toEqual({
    arrival: 201000,
    returnAt: 401000,
    total: 400000,
  })
})
it('uses one-way deployment and a conditional colony return', () => {
  expect(flightSchedule(100000, 1000, 'Deploy')).toEqual({
    arrival: 101000,
    returnAt: null,
    total: 100000,
  })
  expect(flightSchedule(100000, 1000, 'Colonize').returnAt).toBe(201000)
})
it('quotes only selected ships and does not truncate invalid counts', () => {
  expect(
    dispatchShips(
      ['SmallCargo', 'LightFighter'],
      { SmallCargo: '2', LightFighter: '' },
      'me',
    ),
  ).toEqual([{ owner: 'me', ship_type: 'SmallCargo', count: '2' }])
  expect(() =>
    dispatchShips(['SmallCargo'], { SmallCargo: '-1' }, 'me'),
  ).toThrow()
})
it('resolves the mission-specific destination', () => {
  const coordinates = { galaxy: 1, system: 2, position: 3 }
  expect(dispatchSelection('Harvest', coordinates)).toEqual({
    type: 'DebrisAt',
    coordinates,
  })
  expect(dispatchSelection('Colonize', coordinates)).toEqual({
    type: 'EmptyPositionAt',
    coordinates,
  })
  expect(dispatchSelection('Attack', coordinates)).toEqual({
    type: 'BodyAt',
    coordinates,
    kind: 'Planet',
  })
})
