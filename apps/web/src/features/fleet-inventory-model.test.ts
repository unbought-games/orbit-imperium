import { expect, it } from 'vitest'
import { fleetPresentationFixture } from '../test-support/fleet-presentation'
import { fleetInventoryRows } from './fleet-inventory-model'

it('derives exact confirmed counts per origin and remaining queue, including returning fleets', () => {
  const { view, body, moon } = fleetPresentationFixture()
  expect(
    fleetInventoryRows(view, body).map(({ entry, counts }) => [
      entry.key.id,
      counts.stationed,
      counts.flying,
      counts.ordered,
    ]),
  ).toEqual([['SmallCargo', '9223372036854775807', '5', '5']])
  expect(
    fleetInventoryRows(view, moon).map(({ entry, counts }) => [
      entry.key.id,
      counts.stationed,
      counts.flying,
      counts.ordered,
    ]),
  ).toEqual([['SmallCargo', '0', '9', '7']])
  expect(body.inventories[0].count).toBe('9223372036854775807')
})

it.each(['stationed', 'flying', 'queued', 'empty'] as const)(
  'retains %s ships and omits rows known to be entirely empty',
  (source) => {
    const { view, body } = fleetPresentationFixture()
    body.inventories =
      source === 'stationed'
        ? [{ item: { kind: 'Ship', id: 'SmallCargo' }, count: '1' }]
        : []
    view.missions.fleets =
      source === 'flying' ? view.missions.fleets.slice(0, 1) : []
    view.progression.manufacturing =
      source === 'queued' ? view.progression.manufacturing.slice(0, 1) : []
    const rows = fleetInventoryRows(view, body)
    expect(rows).toHaveLength(source === 'empty' ? 0 : 1)
    if (source !== 'empty')
      expect(rows[0].counts).toMatchObject({
        stationed: source === 'stationed' ? '1' : '0',
        flying: source === 'flying' ? '5' : '0',
        ordered: source === 'queued' ? '3' : '0',
      })
  },
)

it('orders military before civil ships without changing the catalog source order', () => {
  const { view, body } = fleetPresentationFixture()
  body.inventories = [
    { item: { kind: 'Ship', id: 'SmallCargo' }, count: '42' },
    { item: { kind: 'Ship', id: 'LightFighter' }, count: '16' },
    { item: { kind: 'Ship', id: 'SolarSatellite' }, count: '8' },
  ]
  const before = view.catalog.map((entry) => entry.key.id)
  expect(
    fleetInventoryRows(view, body).map(({ entry }) => entry.key.id),
  ).toEqual(['LightFighter', 'SolarSatellite', 'SmallCargo'])
  expect(view.catalog.map((entry) => entry.key.id)).toEqual(before)
})
