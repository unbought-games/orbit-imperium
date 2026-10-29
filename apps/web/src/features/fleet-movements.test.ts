import { expect, it } from 'vitest'
import { incomingMovements, outgoingMovements } from './fleet-movements'
import type { components } from '../contracts'
type S = components['schemas']
it('interleaves missiles with the matching fleet direction and supports outgoing details', () => {
  const view = {
    missions: {
      fleets: [{ id: 'ship', due_at: 200 }],
      incoming: [{ arrival_at: 100 }],
    },
    missiles: [
      { id: 'out', outgoing: true, arrival_at: 50 },
      { id: 'in', outgoing: false, arrival_at: 150 },
    ],
  } as S['BoundView4']
  expect(outgoingMovements(view, null).map((x) => [x.kind, x.key])).toEqual([
    ['missile', 'out'],
    ['fleet', 'ship'],
  ])
  expect(incomingMovements(view).map((x) => [x.kind, x.key])).toEqual([
    ['fleet', 'fleet:0'],
    ['missile', 'in'],
  ])
  expect(outgoingMovements(view, 'out')).toHaveLength(1)
  expect(outgoingMovements(view, 'in')).toEqual([])
  expect(view.missions.fleets).toHaveLength(1)
  expect(view.missions.incoming).toHaveLength(1)
})
it('keeps old views without missiles readable', () => {
  const view = {
    missions: { fleets: [], incoming: [] },
  } as unknown as S['BoundView4']
  expect(outgoingMovements(view, null)).toEqual([])
  expect(incomingMovements(view)).toEqual([])
})

it('orders next arrivals and returns without mutating the source or reordering ties', () => {
  const fleets = [
    { id: 'later', due_at: 3000, leg: 'Outbound' },
    { id: 'return', due_at: 2000, leg: 'Returning' },
    { id: 'overdue', due_at: 0, leg: 'Outbound' },
    { id: 'tie', due_at: 2000, leg: 'Outbound' },
  ] as components['schemas']['OwnMission4'][]
  const view = {
    missions: { fleets, incoming: [] },
  } as unknown as S['BoundView4']
  expect(outgoingMovements(view, null).map((row) => row.flight.id)).toEqual([
    'overdue',
    'return',
    'tie',
    'later',
  ])
  expect(fleets.map((fleet) => fleet.id)).toEqual([
    'later',
    'return',
    'overdue',
    'tie',
  ])
})
