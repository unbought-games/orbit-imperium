import { describe, expect, it } from 'vitest'
import { readyFixture, id } from '../../test-support/bootstrap'
import type { components } from '../../contracts'
import {
  affordabilityTime,
  affordabilityForecast,
  affordabilitySummary,
  blockerExplanation,
  buildingInsights,
  constructionProjection,
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
        metal: micro(650),
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
      milliseconds: 2769231,
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
    expect(result.benefit?.qualifier).toBe(
      'Planet total at saved settings, including base production',
    )
    expect(result.energy).toMatchObject({
      current: '0',
      after: micro(-10),
      change: micro(10),
      balanceChange: micro(-10),
      afterUtilization: '909090',
    })
    expect(result.benefit).toMatchObject({
      current: micro(650),
      target: '786363000',
      fullPowerTarget: micro(850),
      planetTotal: true,
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
      qualifier:
        'Mine potential at 100% output and full power; planet estimate unavailable',
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
  it('distinguishes costs below, equal to, and above capacity', () => {
    const { view, body } = fixture()
    for (const amount of [999, 1000, 1001]) {
      const result = affordabilityForecast(view, body, {
        metal: micro(amount),
        crystal: '0',
        deuterium: '0',
      })
      expect(result.blockers).toEqual(
        amount > 1000
          ? [{ resource: 'metal', reason: 'capacity', capacity: micro(1000) }]
          : [],
      )
      expect(result.wait === null).toBe(amount > 1000)
    }
  })
  it('reports all constrained resources even without production metadata, then derives updates', () => {
    const { view, body } = fixture()
    const cost = {
      metal: micro(32000),
      crystal: micro(64000),
      deuterium: micro(9600),
    }
    view.progression.production = []
    const forecast = () => affordabilityForecast(view, body, cost)
    expect(forecast().blockers.map((b) => b.resource)).toEqual([
      'metal',
      'crystal',
      'deuterium',
    ])
    expect(affordabilitySummary(forecast())).toBe(
      'Cost exceeds storage capacity',
    )
    body.capacity = { ...cost }
    expect(forecast().blockers.every((b) => b.reason === 'unknown')).toBe(true)
    expect(affordabilitySummary(forecast())).toBe('Timing unavailable')
    body.amounts = { ...cost }
    body.capacity.metal = '0'
    expect(forecast()).toEqual({ wait: 0, blockers: [] })
    cost.metal = micro(64000)
    expect(forecast().blockers).toEqual([
      { resource: 'metal', capacity: '0', reason: 'capacity' },
    ])
  })
  it('distinguishes idle, draining, full, and unknown production on the selected planet', () => {
    const { view, body, production } = fixture()
    const cost = { metal: micro(600), crystal: '0', deuterium: micro(11) }
    production.gross_per_hour.metal = '0'
    expect(
      affordabilityForecast(view, body, cost).blockers.map((b) => b.reason),
    ).toEqual(['no-production', 'draining'])
    body.amounts.deuterium = '0'
    expect(affordabilityForecast(view, body, cost).blockers[1].reason).toBe(
      'draining',
    )
    body.amounts.metal = body.capacity.metal
    cost.metal = micro(1001)
    expect(affordabilityForecast(view, body, cost).blockers[0].reason).toBe(
      'capacity',
    )
    const other = {
      ...body,
      id: id(999),
      capacity: { ...body.capacity, metal: micro(2000) },
    }
    expect(
      affordabilityForecast(view, other, cost).blockers.map((b) => b.reason),
    ).toEqual(['unknown', 'unknown'])
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

it('keeps energy-adjusted mine output visible at full storage', () => {
  const { view, body, proposal } = fixture()
  body.amounts.metal = body.capacity.metal
  expect(
    buildingInsights(view, body, 'MetalMine', proposal).benefit,
  ).toMatchObject({
    current: micro(650),
    target: '786363000',
    fullPowerTarget: micro(850),
    qualifier: 'Planet total at saved settings, including base production',
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
    qualifier:
      'Mine potential at 100% output and full power; planet estimate unavailable',
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
    qualifier: null,
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
  production.gross_per_hour.metal = micro(30)
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
  ).toMatchObject({
    current: micro(30),
    target: micro(30),
    fullPowerTarget: micro(63),
  })
})

it('includes the active universe base income in both planet totals', () => {
  const { view, body, proposal, production } = fixture()
  body.capacity.metal = micro(10000)
  production.settings.metal_mine = 100
  production.energy_supply = micro(300)
  production.gross_per_hour.metal = micro(1028)
  proposal.building_benefit = {
    kind: 'MetalPerHour',
    current: micro(878),
    target: micro(1207),
  }
  expect(
    buildingInsights(view, body, 'MetalMine', proposal).benefit,
  ).toMatchObject({
    current: micro(1028),
    target: micro(1357),
    fullPowerTarget: micro(1357),
    planetTotal: true,
  })
})

it('keeps base income when throttled off, unpowered, or demolishing the last mine', () => {
  const { view, body, proposal, production } = fixture()
  production.settings.metal_mine = 0
  production.gross_per_hour.metal = micro(150)
  expect(
    buildingInsights(view, body, 'MetalMine', proposal).benefit,
  ).toMatchObject({
    current: micro(150),
    target: micro(150),
  })
  production.settings.metal_mine = 100
  production.energy_supply = '0'
  production.utilization = '0'
  expect(
    buildingInsights(view, body, 'MetalMine', proposal).benefit,
  ).toMatchObject({
    current: micro(150),
    target: micro(150),
    fullPowerTarget: micro(1550),
  })
  production.energy_supply = micro(100)
  production.utilization = micro(1)
  production.gross_per_hour.metal = micro(1150)
  proposal.building_benefit!.target = '0'
  proposal.building_energy!.target_consumption = '0'
  expect(
    buildingInsights(view, body, 'MetalMine', proposal).benefit,
  ).toMatchObject({
    current: micro(1150),
    target: micro(150),
  })
  expect(
    buildingInsights(view, body, 'MetalMine', proposal).energy.balanceChange,
  ).toBe(micro(40))
})

it('preserves net fuel use and empty storage limits without capping deuterium estimates', () => {
  const { view, body, proposal, production } = fixture()
  proposal.building_benefit = {
    kind: 'DeuteriumPerHour',
    current: micro(20),
    target: micro(40),
  }
  production.energy_supply = micro(200)
  const insight = () =>
    buildingInsights(view, body, 'DeuteriumSynthesizer', proposal).benefit
  expect(insight()).toMatchObject({
    current: micro(-5),
    target: micro(15),
    planetTotal: true,
  })
  body.amounts.deuterium = '0'
  expect(insight()).toMatchObject({ current: '0', target: micro(15) })
  body.amounts.deuterium = body.capacity.deuterium
  expect(insight()).toMatchObject({ current: micro(-5), target: micro(15) })
  expect(
    buildingInsights(view, body, 'DeuteriumSynthesizer', proposal)
      .productionPaused,
  ).toBe(false)
})

it('preserves crystal base income and computes the new efficiency during an existing deficit', () => {
  const { view, body, proposal, production } = fixture()
  production.energy_supply = micro(50)
  production.utilization = micro(0.5)
  production.settings.crystal_mine = 50
  production.gross_per_hour.crystal = micro(75)
  proposal.building_benefit = {
    kind: 'CrystalPerHour',
    current: micro(200),
    target: micro(400),
  }
  expect(
    buildingInsights(view, body, 'CrystalMine', proposal).benefit,
  ).toMatchObject({
    current: micro(75),
    target: '115909000',
    fullPowerTarget: micro(225),
  })
})

it('uses server fuel-limited output for fusion previews rather than rated power', () => {
  const { view, body, proposal } = fixture()
  proposal.building_benefit = {
    kind: 'Energy',
    current: micro(80),
    target: micro(100),
  }
  const current = {
    energy_supply: micro(33),
    energy_demand: micro(100),
    utilization: micro(0.33),
    fusion_supply: micro(13),
    fuel_deuterium_per_hour: micro(3),
    fuel_utilization: micro(0.16),
    net_deuterium_per_hour: '0',
    metal_per_hour: micro(40),
    crystal_per_hour: micro(15),
  }
  proposal.building_production = {
    current,
    target: {
      ...current,
      energy_supply: micro(40),
      fusion_supply: micro(20),
      fuel_deuterium_per_hour: micro(4),
      utilization: micro(0.4),
    },
  }
  const insight = buildingInsights(view, body, 'FusionReactor', proposal)
  expect(insight.energy.current).toBe(micro(-67))
  expect(insight.energy.after).toBe(micro(-60))
  expect(insight.energy.balanceChange).toBe(micro(7))
  expect(insight.benefit).toMatchObject({
    current: micro(13),
    target: micro(20),
  })
  expect(insight.fuel).toMatchObject({ current: micro(3), target: micro(4) })
})

it('keeps projected mine income visible at full storage on fusion planets', () => {
  const { view, body, proposal } = fixture()
  body.amounts.metal = body.capacity.metal
  const current = {
    energy_supply: micro(33),
    energy_demand: micro(100),
    utilization: micro(0.33),
    fusion_supply: micro(13),
    fuel_deuterium_per_hour: micro(3),
    fuel_utilization: micro(0.16),
    net_deuterium_per_hour: '0',
    metal_per_hour: micro(40),
    crystal_per_hour: micro(15),
  }
  proposal.building_production = {
    current,
    target: { ...current, metal_per_hour: micro(50) },
  }
  expect(
    buildingInsights(view, body, 'MetalMine', proposal).benefit,
  ).toMatchObject({ current: micro(40), target: micro(50) })
  expect(
    buildingInsights(view, body, 'MetalMine', proposal).productionPaused,
  ).toBe(true)
})

for (const [building, resource, kind] of [
  ['MetalMine', 'metal', 'MetalPerHour'],
  ['CrystalMine', 'crystal', 'CrystalPerHour'],
  ['DeuteriumSynthesizer', 'deuterium', 'DeuteriumPerHour'],
] as const) {
  it.each([1000, 1500])(
    `preserves ${resource} output estimates at %s stored and clears the pause when capacity returns`,
    (amount) => {
      const { view, body, proposal, production } = fixture()
      proposal.building_benefit = {
        kind,
        current: micro(20),
        target: micro(40),
      }
      production.net_deuterium_per_hour = {
        sign: 'Nonnegative',
        magnitude: micro(20),
      }
      const before = buildingInsights(view, body, building, proposal)
      expect(before.productionPaused).toBe(false)
      body.amounts[resource] = micro(amount)
      const full = buildingInsights(view, body, building, proposal)
      expect(full.benefit).toEqual(before.benefit)
      expect(full.productionPaused).toBe(true)
      expect(full.storage?.rate).toBe('0')
      body.amounts[resource] = micro(900)
      expect(
        buildingInsights(view, body, building, proposal).productionPaused,
      ).toBe(false)
    },
  )
}

it('only accepts an authoritative projection for the active body, building and target', () => {
  const { view, body, proposal } = fixture()
  const work = { building: 'MetalMine', targetLevel: 5 }
  proposal.terms = {
    type: 'Building',
    profile_hash: view.profile_hash,
    body: body.id,
    building: 'MetalMine',
    action: 'Upgrade',
    source_level: 4,
    target_level: 5,
    paid: body.amounts,
    duration_ms: 1000,
    formula: 'BuildingRedesign2011',
    facilities: [],
    required_energy: '0',
    reserve_fields: 1,
  }
  expect(constructionProjection(proposal, body, work)).toBe(proposal)
  expect(constructionProjection(null, body, work)).toBeNull()
  expect(
    constructionProjection(proposal, body, { ...work, targetLevel: 6 }),
  ).toBeNull()
  expect(
    constructionProjection(proposal, body, {
      ...work,
      building: 'CrystalMine',
    }),
  ).toBeNull()
  expect(
    constructionProjection(proposal, { ...body, id: id(99) }, work),
  ).toBeNull()
  expect(
    constructionProjection(
      proposal,
      { ...body, levels: { ...body.levels, MetalMine: 5 } },
      work,
    ),
  ).toBeNull()
  proposal.terms.action = 'Demolition'
  proposal.terms.target_level = 3
  expect(
    constructionProjection(proposal, body, { ...work, targetLevel: 3 }),
  ).toBe(proposal)
})
