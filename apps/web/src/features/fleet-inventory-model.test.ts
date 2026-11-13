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

it('totals all owned worlds and actual active manifests, including holds, returns and missing origins', () => {
  const { view, body, moon, fleet } = fleetPresentationFixture()
  moon.inventories = [{ item: { kind: 'Ship', id: 'SmallCargo' }, count: '10' }]
  view.missions.fleets.push(
    {
      ...fleet,
      id: 'outbound',
      leg: 'Outbound',
      ships: [{ ship_type: 'SmallCargo', count: '3' }],
    },
    {
      ...fleet,
      id: 'holding',
      leg: 'Holding',
      intent: { ...fleet.intent, origin: 'former-world' },
      ships: [{ ship_type: 'SmallCargo', count: '2' }],
    },
  )
  // Intents retain launch quantities; a return can have fewer surviving ships.
  view.missions.fleets[0].intent.ships[0].count = '100'
  view.missions.incoming.push({
    sender: 'foreign-player',
    target: body.id,
    origin: moon.coordinates,
    mission: 'Transport',
    arrival_at: 123,
    ships: {
      visibility: 'Exact',
      total: '1000',
      ships: [{ ship_type: 'SmallCargo', count: '1000' }],
    },
  })
  const counts = fleetInventoryRows(view, body, 'empire')[0].counts
  expect(counts).toEqual({
    stationed: '9223372036854775817',
    flying: '19',
    ordered: '12',
    total: '9223372036854775836',
  })
  expect(fleetInventoryRows(view, moon, 'empire')[0].counts).toEqual(counts)
})

it('keeps existing totals stable when a confirmed departure or return moves ships between locations', () => {
  const { view, body, fleet } = fleetPresentationFixture()
  body.inventories[0].count = '20'
  view.missions.fleets = []
  const counts = () => fleetInventoryRows(view, body, 'empire')[0].counts
  expect(counts().total).toBe('20')
  body.inventories[0].count = '15'
  view.missions.fleets = [{ ...fleet, leg: 'Outbound' }]
  expect(counts()).toMatchObject({ stationed: '15', flying: '5', total: '20' })
  view.missions.fleets[0].leg = 'Returning'
  expect(counts().total).toBe('20')
  body.inventories[0].count = '20'
  view.missions.fleets = []
  expect(counts()).toMatchObject({ stationed: '20', flying: '0', total: '20' })
})

it('includes stationary ships in totals, excludes defense and keeps queued-only totals zero', () => {
  const { view, body } = fleetPresentationFixture()
  body.inventories = [
    { item: { kind: 'Ship', id: 'SolarSatellite' }, count: '8' },
    { item: { kind: 'Defense', id: 'RocketLauncher' }, count: '999' },
  ]
  view.missions.fleets = []
  expect(
    fleetInventoryRows(view, body, 'empire').map(({ entry, counts }) => [
      entry.key.id,
      counts.total,
      counts.ordered,
    ]),
  ).toEqual([
    ['SolarSatellite', '8', '0'],
    ['SmallCargo', '0', '12'],
  ])
})
