import type { components } from '../contracts'
import { id, readyFixture } from './bootstrap'

type S = components['schemas']
export const fleetFixtureTime = Date.parse('2026-11-01T12:00:00Z')

/** Prepared confirmed state for models and isolated fleet views; no transport. */
export function fleetPresentationFixture() {
  const { snapshot } = readyFixture(4)
  if (snapshot.view.protocol !== 4) throw new Error('Expected fleet protocol')
  const view = structuredClone(snapshot.view)
  const cargo = {
    metal: '1000000000',
    crystal: '2000000000',
    deuterium: '3000000',
  }
  const body: S['BodyV3'] = {
    id: id(5),
    name: 'Hades',
    kind: 'Planet',
    coordinates: { galaxy: 1, system: 15, position: 7 },
    levels: {},
    amounts: cargo,
    capacity: cargo,
    fields: 163,
    fields_used: 0,
    fields_reserved: 0,
    energy: { supply: '0', demand: '0', utilization: '1000000' },
    inventories: [
      {
        item: { kind: 'Ship', id: 'SmallCargo' },
        count: '9223372036854775807',
      },
    ],
  }
  const moon: S['BodyV3'] = {
    ...body,
    id: id(6),
    name: 'Hades Moon',
    kind: 'Moon',
    inventories: [],
  }
  view.bodies = [body, moon]
  view.catalog = ['SmallCargo', 'LightFighter', 'SolarSatellite'].map(
    (ship) => ({
      key: { kind: 'Ship', id: ship as S['ShipId3'] },
      ship_statistics: {
        propulsion: null,
        combat: null,
        cost:
          ship === 'SolarSatellite'
            ? ['0', '2000', '500']
            : ship === 'LightFighter'
              ? ['3000', '1000', '0']
              : ['2000', '2000', '0'],
      },
      enabled: true,
      mobile: ship !== 'SolarSatellite',
      body_kinds: ['Planet', 'Moon'],
      requirements: [],
    }),
  )
  const fleet: S['OwnMission4'] = {
    id: id(30),
    intent: {
      origin: body.id,
      destination: {
        type: 'Body',
        id: moon.id,
        expected_kind: 'Moon',
        expected_owner: view.binding.player,
      },
      mission: 'Transport',
      ships: [
        { owner: view.binding.player, ship_type: 'SmallCargo', count: '5' },
      ],
      cargo,
      speed_percent: 100,
    },
    origin: body.coordinates,
    destination: moon.coordinates,
    leg: 'Returning',
    ships: [{ ship_type: 'SmallCargo', count: '5' }],
    cargo,
    due_at: fleetFixtureTime + 600_000,
    launched_at: fleetFixtureTime - 10_000,
    duration_ms: 610_000,
    paid_fuel: '1000000',
    can_recall: false,
  }
  view.missions.fleets = [
    fleet,
    {
      ...fleet,
      id: id(31),
      intent: { ...fleet.intent, origin: moon.id },
      ships: [{ ship_type: 'SmallCargo', count: '9' }],
    },
  ]
  view.missions.fleet_slots = '8'
  const batch: S['ManufacturingBatchDto'] = {
    id: id(70),
    body: body.id,
    item: { kind: 'Ship', id: 'SmallCargo' },
    quantity: '11',
    remaining: '3',
    completed_prefix: '8',
    paid: cargo,
    accepted_at: fleetFixtureTime - 100_000,
    first_start_at: fleetFixtureTime - 100_000,
    next_due_at: fleetFixtureTime + 100_000,
    final_due_at: fleetFixtureTime + 300_000,
    unit_duration_ms: 100_000,
    state: 'Producing',
    can_cancel: false,
  }
  view.progression.manufacturing = [
    batch,
    { ...batch, id: id(71), remaining: '2', completed_prefix: '9' },
    {
      ...batch,
      id: id(72),
      body: moon.id,
      remaining: '7',
      completed_prefix: '4',
    },
  ]
  view.player_names = { [view.binding.player]: 'Commander' }
  return { view, body, moon, fleet, batch }
}
