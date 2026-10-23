import { describe, expect, it } from 'vitest'
import { readyFixture, id } from '../../test-support/bootstrap'
import type { components } from '../../contracts'
import {
  affordabilityTime,
  blockerExplanation,
  buildingInsights,
  energySources,
  nextLevelDependents,
  storageProjection,
} from './detail-insights'
type S = components['schemas']
const micro = (n: number) => String(n * 1000000)
function fixture() {
  const view = readyFixture(3).snapshot.view as S['BoundView3']
  const body: S['BodyV3'] = {
    id: id(6),
    kind: 'Planet',
    coordinates: { galaxy: 1, system: 1, position: 1 },
    amounts: { metal: micro(500), crystal: micro(200), deuterium: micro(10) },
    capacity: {
      metal: micro(1000),
      crystal: micro(1000),
      deuterium: micro(1000),
    },
    levels: {
      MetalMine: 4,
      CrystalMine: 0,
      DeuteriumSynthesizer: 0,
      SolarPlant: 5,
      MetalStorage: 0,
      CrystalStorage: 0,
      DeuteriumTank: 0,
      RoboticsFactory: 0,
      ResearchLab: 0,
      Shipyard: 0,
    },
    fields: 100,
    fields_used: 9,
    fields_reserved: 0,
    energy: { supply: micro(100), demand: micro(100), utilization: micro(1) },
    inventories: [],
  }
  view.bodies = [body]
  view.progression.production = [
    {
      body: body.id,
      settings_revision: '1',
      settings: {
        metal_mine: 50,
        crystal_mine: 100,
        deuterium_synthesizer: 100,
        solar_plant: 100,
        fusion_reactor: 100,
        solar_satellite: 100,
      },
      editable: ['metal_mine'],
      gross_per_hour: {
        metal: micro(100),
        crystal: micro(50),
        deuterium: micro(20),
      },
      net_deuterium_per_hour: { sign: 'Negative', magnitude: micro(5) },
      fuel_deuterium_per_hour: micro(25),
      energy_supply: micro(100),
      energy_demand: micro(100),
      utilization: micro(1),
      fuel_utilization: micro(1),
    },
  ]
  const proposal: S['BoundProgressionOptions'] = {
    protocol: 3,
    binding: view.binding,
    request_id: id(20),
    viewer_revision: '0',
    sampled_at: 1000,
    as_of_ms: 1000,
    request: { type: 'Upgrade', body: body.id, building: 'MetalMine' },
    terms: null,
    terms_hash: null,
    blockers: [],
    estimates: null,
    building_benefit: {
      kind: 'MetalPerHour',
      current: micro(1000),
      target: micro(1400),
    },
    building_energy: {
      current_consumption: micro(40),
      target_consumption: micro(60),
    },
  }
  return { view, body, proposal, production: view.progression.production[0] }
}
describe('detail decision estimates', () => {
  it('uses current rates and balances for storage, including full and declining stores', () => {
    const { view, body } = fixture()
    expect(storageProjection(view, body, 'metal')).toMatchObject({
      percent: 50,
      state: 'filling',
      milliseconds: 18000000,
    })
    expect(storageProjection(view, body, 'deuterium')).toMatchObject({
      state: 'idle',
      milliseconds: null,
      rate: micro(-5),
    })
    body.amounts.metal = body.capacity.metal
    expect(storageProjection(view, body, 'metal')).toMatchObject({
      state: 'full',
      percent: 100,
      milliseconds: null,
      rate: '0',
    })
    view.progression.production = []
    expect(storageProjection(view, body, 'crystal')).toMatchObject({
      state: 'unknown',
      milliseconds: null,
    })
  })
  it('derives saved throttle, extra demand, post-upgrade energy and reduced output together', () => {
    const { view, body, proposal } = fixture()
    const before = structuredClone(view)
    const result = buildingInsights(view, body, 'MetalMine', proposal)
    expect(result.benefit?.qualifier).toBeNull()
    expect(result.energy).toMatchObject({
      current: '0',
      after: micro(-10),
      change: micro(10),
      afterUtilization: '909090',
    })
    expect(result.benefit).toMatchObject({
      current: micro(500),
      target: '636363000',
    })
    expect(view).toEqual(before)
  })
  it('includes additional supply for power plants and reverses consumption for demolition', () => {
    const { view, body, proposal } = fixture()
    proposal.building_energy = {
      current_consumption: micro(60),
      target_consumption: micro(40),
    }
    expect(
      buildingInsights(view, body, 'MetalMine', proposal).energy.after,
    ).toBe(micro(10))
    proposal.building_benefit = {
      kind: 'Energy',
      current: micro(100),
      target: micro(150),
    }
    proposal.building_energy = {
      current_consumption: '0',
      target_consumption: '0',
    }
    expect(
      buildingInsights(view, body, 'SolarPlant', proposal).energy.after,
    ).toBe(micro(50))
  })
  it('does not invent fusion power or missing production metadata', () => {
    const { view, body, proposal } = fixture()
    expect(
      buildingInsights(view, body, 'FusionReactor', proposal).energy.after,
    ).toBeNull()
    view.progression.production = []
    expect(
      buildingInsights(view, body, 'MetalMine', proposal).benefit,
    ).toMatchObject({
      current: micro(1000),
      target: micro(1400),
      qualifier: 'Potential at 100% output and full power',
    })
    expect(buildingInsights(view, body, 'MetalMine', null).benefit).toBeNull()
  })
  it('uses the slowest missing resource and refuses unreachable or draining balances', () => {
    const { view, body } = fixture()
    expect(
      affordabilityTime(view, body, {
        metal: micro(600),
        crystal: micro(400),
        deuterium: '0',
      }),
    ).toBe(14400000)
    expect(
      affordabilityTime(view, body, {
        metal: micro(1001),
        crystal: '0',
        deuterium: '0',
      }),
    ).toBeNull()
    expect(
      affordabilityTime(view, body, {
        metal: '0',
        crystal: '0',
        deuterium: micro(11),
      }),
    ).toBeNull()
    expect(
      affordabilityTime(view, body, {
        metal: '0',
        crystal: '0',
        deuterium: '0',
      }),
    ).toBe(0)
  })
  it('keeps very large balances exact and rejects unrepresentable time intervals', () => {
    const { view, body, production } = fixture()
    body.amounts.metal = '9007199254740993000'
    body.capacity.metal = '9007199254741993000'
    production.gross_per_hour.metal = '1000000'
    expect(storageProjection(view, body, 'metal').milliseconds).toBe(3600000)
    body.amounts.metal = '0'
    production.gross_per_hour.metal = '1'
    expect(storageProjection(view, body, 'metal').milliseconds).toBeNull()
  })
  it('explains busy slots with their own work and never promises overdue completion', () => {
    const { view, body } = fixture()
    const block: S['ProgressionBlocker'] = {
      code: 'ActiveConstruction',
      required: null,
      actual: null,
      resource: null,
      requirement: null,
      unit: null,
    }
    view.constructions = [
      {
        id: id(7),
        body: body.id,
        building: 'RoboticsFactory',
        target_level: 2,
        paid: { metal: '0', crystal: '0', deuterium: '0' },
        due_at: 61000,
      },
    ]
    expect(blockerExplanation(block, view, body, 1000)).toBe(
      'Robotics Factory level 2 · finishes in 1m',
    )
    expect(blockerExplanation(block, view, body, 62000)).toContain(
      'awaiting completion',
    )
  })
  it('recommends only enabled power sources for the selected body and identifies new unlock gates', () => {
    const { view, body } = fixture()
    view.catalog = [
      {
        key: { kind: 'Building', id: 'SolarPlant' },
        enabled: true,
        mobile: false,
        body_kinds: ['Planet'],
        requirements: [],
      },
      {
        key: { kind: 'Building', id: 'FusionReactor' },
        enabled: false,
        mobile: false,
        body_kinds: ['Planet'],
        requirements: [],
      },
      {
        key: { kind: 'Ship', id: 'SolarSatellite' },
        enabled: true,
        mobile: false,
        body_kinds: ['Moon'],
        requirements: [],
      },
      {
        key: { kind: 'Ship', id: 'SmallCargo' },
        enabled: true,
        mobile: true,
        body_kinds: ['Planet'],
        requirements: [
          { type: 'PlayerResearch', research: 'CombustionDrive', level: 3 },
        ],
      },
    ]
    expect(energySources(view, body).map((entry) => entry.key.id)).toEqual([
      'SolarPlant',
    ])
    expect(
      nextLevelDependents(
        view,
        { kind: 'Research', id: 'CombustionDrive' },
        2,
        3,
      ),
    ).toEqual([{ kind: 'Ship', id: 'SmallCargo' }])
    expect(
      nextLevelDependents(
        view,
        { kind: 'Research', id: 'CombustionDrive' },
        3,
        4,
      ),
    ).toEqual([])
  })
})

it('shows stopped mine output at full storage and labels the target condition', () => {
  const { view, body, proposal } = fixture()
  body.amounts.metal = body.capacity.metal
  expect(
    buildingInsights(view, body, 'MetalMine', proposal).benefit,
  ).toMatchObject({
    current: '0',
    target: '636363000',
    qualifier: 'Estimate at saved settings, when storage has room',
  })
})

it('keeps both nominal outputs consistent when the energy estimate is missing', () => {
  const { view, body, proposal } = fixture()
  delete proposal.building_energy
  expect(
    buildingInsights(view, body, 'MetalMine', proposal).benefit,
  ).toMatchObject({
    current: micro(1000),
    target: micro(1400),
    qualifier: 'Potential at 100% output and full power',
  })
})

it('scales energy generation by the saved power setting and recognizes construction power gates', () => {
  const { view, body, proposal, production } = fixture()
  production.settings.solar_plant = 50
  proposal.building_benefit = {
    kind: 'Energy',
    current: micro(100),
    target: micro(150),
  }
  proposal.building_energy = {
    current_consumption: '0',
    target_consumption: '0',
  }
  proposal.blockers = [
    {
      code: 'EnergyRequired',
      required: micro(500),
      actual: micro(100),
      unit: 'MicroEnergy',
      resource: null,
      requirement: null,
    },
  ]
  const result = buildingInsights(view, body, 'SolarPlant', proposal)
  expect(result.benefit).toMatchObject({
    current: micro(50),
    target: micro(75),
    qualifier: 'At saved production settings',
  })
  expect(result.energy).toMatchObject({
    after: micro(25),
    constructionBlocked: true,
  })
})

it('does not use an unrelated planet lab timer to explain a local lock', () => {
  const { view, body } = fixture()
  const blocker: S['ProgressionBlocker'] = {
    code: 'LabLocked',
    required: null,
    actual: null,
    unit: null,
    resource: null,
    requirement: null,
  }
  view.constructions = [
    {
      id: id(30),
      body: id(31),
      building: 'ResearchLab',
      target_level: 2,
      paid: { metal: '0', crystal: '0', deuterium: '0' },
      due_at: 61000,
    },
  ]
  expect(blockerExplanation(blocker, view, body, 1000)).toBeNull()
  view.constructions[0].body = body.id
  expect(blockerExplanation(blocker, view, body, 1000)).toBe(
    'Research Lab construction · finishes in 1m',
  )
})

it('distinguishes a level-zero mine from its powered first-level potential', () => {
  const { view, body, proposal, production } = fixture()
  production.energy_supply = '0'
  production.energy_demand = '0'
  production.settings.metal_mine = 100
  body.levels.MetalMine = 0
  proposal.building_benefit = {
    kind: 'MetalPerHour',
    current: '0',
    target: micro(33),
  }
  proposal.building_energy = {
    current_consumption: '0',
    target_consumption: micro(11),
  }
  expect(
    buildingInsights(view, body, 'MetalMine', proposal).benefit,
  ).toMatchObject({ current: '0', target: '0', fullPowerTarget: micro(33) })
})
