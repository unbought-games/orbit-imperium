import type { components } from '../../src/contracts'
import { productionFixture } from '../../src/test-support/production'
import { readyFixture, id } from '../../src/test-support/bootstrap'

type S = components['schemas']

// Shared by Node test collection and browser scenes. Keep all runtime imports pure.
export { id }
export const now = Date.UTC(2026, 10, 9, 12)
export const originId = id(5)
export const colonyId = id(6)
export const player = id(2)
export const originBody: S['BodyV3'] = {
  id: originId,
  name: 'Aster Haven',
  kind: 'Planet',
  coordinates: { galaxy: 1, system: 371, position: 12 },
  amounts: {
    metal: '6661686240',
    crystal: '9420339537',
    deuterium: '3122000000',
  },
  capacity: {
    metal: '10000000000',
    crystal: '10000000000',
    deuterium: '10000000000',
  },
  levels: {
    MetalMine: 1,
    CrystalMine: 1,
    DeuteriumSynthesizer: 0,
    SolarPlant: 1,
    MetalStorage: 0,
    CrystalStorage: 0,
    DeuteriumTank: 0,
    RoboticsFactory: 0,
    ResearchLab: 0,
    Shipyard: 0,
  },
  fields: 163,
  fields_used: 0,
  fields_reserved: 0,
  energy: { supply: '0', demand: '0', utilization: '1000000' },
  inventories: [
    { item: { kind: 'Ship', id: 'SmallCargo' }, count: '2' },
    ...(['EspionageProbe', 'Recycler', 'ColonyShip'] as const).map((id) => ({
      item: { kind: 'Ship' as const, id },
      count: '1',
    })),
  ],
}
export type DispatchFixtureOptions = {
  launchOutcome?: 'Committed' | 'Pending' | 'Rejected'
  blocker: S['GameError4'] | null
  estimateError: S['GameError4'] | null
  resolveError?: S['GameError4']
  quoteError: S['GameError4'] | null
  observationAvailable: boolean
  debris: boolean
  fuel: string
  capacity: string
  maximumPayload: string
  duration: number
  profiles: boolean
}
export function dispatchData() {
  const ready = readyFixture(4)
  if (ready.snapshot.view.protocol !== 4) throw Error('Expected protocol 4')
  // Match the application Dispatch fixture: the real comparator uses total cost.
  // LightFighter deliberately has no statistics in that fixture.
  const catalogCosts = {
    EspionageProbe: ['0', '1000', '0'],
    SmallCargo: ['2000', '2000', '0'],
    Recycler: ['10000', '6000', '2000'],
    ColonyShip: ['10000', '20000', '10000'],
  } satisfies Record<string, [string, string, string]>
  const view: S['BoundView4'] = {
    ...ready.snapshot.view,
    viewer_revision: '1',
    sampled_at: now,
    as_of_ms: now,
    homeworld_id: originId,
    bodies: [
      structuredClone(originBody),
      {
        ...structuredClone(originBody),
        id: colonyId,
        name: 'Haven Colony',
        coordinates: { galaxy: 1, system: 1, position: 2 },
        colony: {
          diameter_km: 12000,
          min_temperature: 0,
          max_temperature: 40,
          created_at: 1000,
          profile: 'oi-redesign-reconstructed-v1',
        },
      },
    ],
    player_names: { [player]: 'Commander' },
    research: [{ research: 'Astrophysics', level: 8 }],
    capabilities: (
      [
        'Transport',
        'Attack',
        'Espionage',
        'Harvest',
        'Deploy',
        'Reports',
        'Colonize',
        'Galaxy',
      ] as const
    ).map((capability) => ({ capability, enabled: true, reason: 'Available' })),
    catalog: (
      [
        'EspionageProbe',
        'Recycler',
        'ColonyShip',
        'SmallCargo',
        'LightFighter',
      ] as const
    ).map((id) => ({
      key: { kind: 'Ship', id },
      enabled: true,
      mobile: true,
      body_kinds: ['Planet'],
      requirements: [],
      ...(id === 'LightFighter'
        ? {}
        : {
            ship_statistics: {
              propulsion: null,
              combat: null,
              cost: catalogCosts[id],
            },
          }),
    })),
    missions: {
      fleets: [],
      incoming: [],
      score_value_micro: '0',
      fleet_slots: '5',
    },
  }
  view.progression.production = view.bodies.map(productionFixture)
  ready.snapshot.view = view
  ready.snapshot.candidate.sampled_at = now
  ready.snapshot.settings = {
    ...ready.snapshot.settings,
    galaxies: 1,
    systems_per_galaxy: 499,
  }
  const options: DispatchFixtureOptions = {
    blocker: null,
    quoteError: null,
    estimateError: null,
    observationAvailable: true,
    debris: true,
    duration: 100000,
    fuel: '1000000',
    capacity: '5000000000',
    maximumPayload: '4999000000',
    profiles: true,
  }
  return { ready, view, options }
}
