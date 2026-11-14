import { expect, it } from 'vitest'
import { fleetPresentationFixture } from '../test-support/fleet-presentation'
import { fleetTrafficModel } from './fleet-traffic-model'
import type { components } from '../contracts'

function trafficFixture() {
  const { view, body, fleet } = fleetPresentationFixture()
  view.missions.fleets = [
    { ...fleet, id: 'return', leg: 'Returning', due_at: 400 },
    { ...fleet, id: 'outbound', leg: 'Outbound', due_at: 200 },
    { ...fleet, id: 'holding', leg: 'Holding', due_at: 300 },
  ]
  view.missions.incoming = [
    {
      sender: 'other',
      target: body.id,
      origin: body.coordinates,
      arrival_at: 100,
      mission: 'Attack',
      ships: { visibility: 'Unknown' },
    },
  ]
  view.missiles = [
    { id: 'own-missile', outgoing: true, arrival_at: 350 },
    { id: 'incoming-missile', outgoing: false, arrival_at: 250 },
  ] as components['schemas']['MissileFlightView4'][]
  return view
}

it('combines owned missions and detected approaches in arrival order without mutating the snapshot', () => {
  const view = trafficFixture()
  const before = structuredClone(view)
  const result = fleetTrafficModel(view, 'all')
  expect(result.otherCount).toBe(2)
  expect(result.rows.map(({ side, movement }) => [side, movement.key])).toEqual(
    [
      ['other', 'fleet:0'],
      ['own', 'outbound'],
      ['other', 'incoming-missile'],
      ['own', 'holding'],
      ['own', 'own-missile'],
      ['own', 'return'],
    ],
  )
  expect(view).toEqual(before)
})

it('filters ownership rather than direction, retaining own returns and incoming missiles', () => {
  const view = trafficFixture()
  expect(
    fleetTrafficModel(view, 'own').rows.map(({ movement }) => movement.key),
  ).toEqual(['outbound', 'holding', 'own-missile', 'return'])
  expect(
    fleetTrafficModel(view, 'other').rows.map(({ movement }) => movement.key),
  ).toEqual(['fleet:0', 'incoming-missile'])
  for (const scope of ['all', 'own', 'other'] as const)
    expect(fleetTrafficModel(view, scope).otherCount).toBe(2)
})

it('keeps mission details restricted to the selected owned mission regardless of list filter', () => {
  const view = trafficFixture()
  expect(
    fleetTrafficModel(view, 'other', 'return').rows.map(
      ({ movement }) => movement.key,
    ),
  ).toEqual(['return'])
  expect(fleetTrafficModel(view, 'all', 'incoming-missile')).toEqual({
    rows: [],
    otherCount: 0,
  })
})

it('has a single empty collection when no owned or detected movements exist', () => {
  const { view } = fleetPresentationFixture()
  view.missions.fleets = []
  view.missions.incoming = []
  for (const scope of ['all', 'own', 'other'] as const)
    expect(fleetTrafficModel(view, scope)).toEqual({ rows: [], otherCount: 0 })
})
