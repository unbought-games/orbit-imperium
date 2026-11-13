import { describe, expect, it } from 'vitest'
import observation from '../../../../contracts/fixtures/espionage-expanded.json'
import missileDefenses from '../../../../contracts/fixtures/espionage-missile-defenses.json'
import {
  attackerLosses,
  battleEstimates,
  simulationGroupSummary,
  averageSurvivors,
  planningSummary,
  sampledAmounts,
  type SimulationResponse,
  simulationFields,
  simulationInputs,
  unsupportedReportUnits,
  blankSimulationEdits,
  type Espionage,
} from './combat-simulation-model'
import type { components } from '../contracts'
const report = observation as Espionage
const technicalData = {
  facts: [],
  bonuses: [],
  storage_capacities: null,
  combat: {
    attack_ticks: '5000000',
    shield_ticks: '1000000',
    hull_ticks: '40000000',
    rapid_fire_against: [],
    rapid_fire_from: [],
  },
}
const catalog: components['schemas']['CatalogEntry3'][] = [
  {
    key: { kind: 'Ship', id: 'LightFighter' },
    body_kinds: ['Planet'],
    requirements: [],
    enabled: true,
    mobile: true,
    technical_data: technicalData,
  },
  {
    key: { kind: 'Defense', id: 'RocketLauncher' },
    body_kinds: ['Planet'],
    requirements: [],
    enabled: true,
    mobile: false,
    technical_data: technicalData,
  },
]
const attacking = { 'attacker:Ship:LightFighter': '10' }
it('imports combat defenses while excluding revealed missiles from fleet simulation', () => {
  const observed: Espionage = {
    ...report,
    defenses: missileDefenses as Espionage['defenses'],
  }
  const fields = simulationFields(observed, catalog, [])
  expect(unsupportedReportUnits(observed, fields)).toEqual([])
  const result = simulationInputs(fields, attacking)
  expect(result.error).toBeNull()
  expect(result.inputs?.defender.units).toEqual([
    { item: { kind: 'Defense', id: 'RocketLauncher' }, count: 100 },
  ])
})
it.each([true, false])(
  'prefills retained Gauss Cannons only on the defending side (enabled=%s)',
  (enabled) => {
    const item = { kind: 'Defense', id: 'GaussCannon' } as const
    const observed: Espionage = {
      ...report,
      defenses: { visibility: 'Known', value: [{ item, count: '7' }] },
    }
    const fields = simulationFields(
      observed,
      [...catalog, { ...catalog[1], key: item, enabled }],
      [],
    )
    expect(
      fields.find((f) => f.key === 'defender:Defense:GaussCannon')?.value,
    ).toBe('7')
    expect(fields.some((f) => f.key === 'attacker:Defense:GaussCannon')).toBe(
      false,
    )
    expect(unsupportedReportUnits(observed, fields)).toEqual([])
    expect(
      simulationInputs(fields, attacking).inputs?.defender.units,
    ).toContainEqual({ item, count: 7 })
  },
)
describe('report combat prefill', () => {
  it('maps visible forces and combat technology without disclosing unrelated facts', () => {
    const fields = simulationFields(
      {
        ...report,
        fleet: {
          visibility: 'Known',
          value: [{ item: { kind: 'Ship', id: 'LightFighter' }, count: '12' }],
        },
        research: {
          visibility: 'Known',
          value: { ...observation.research.value, WeaponsTechnology: 9 },
        },
      } as Espionage,
      catalog,
      [{ research: 'ArmourTechnology', level: 6 }],
    )
    const { inputs } = simulationInputs(fields, attacking)
    expect(inputs).toEqual({
      attacker: {
        technology: [0, 0, 6],
        units: [{ item: { kind: 'Ship', id: 'LightFighter' }, count: 10 }],
      },
      defender: {
        technology: [9, 0, 0],
        units: [{ item: { kind: 'Ship', id: 'LightFighter' }, count: 12 }],
      },
    })
    expect(JSON.stringify(inputs)).not.toContain(report.target.owner)
    expect(JSON.stringify(inputs)).not.toContain('resources')
  })
  it('keeps unknown distinct from observed zero even if an unknown section has a stray value', () => {
    const hidden = {
      ...report,
      fleet: {
        visibility: 'Unknown',
        value: [{ item: { kind: 'Ship', id: 'LightFighter' }, count: '100' }],
      },
      research: { visibility: 'Unknown', value: { WeaponsTechnology: 40 } },
    } as unknown as Espionage
    const fields = simulationFields(hidden, catalog, [])
    expect(
      fields.find((f) => f.key === 'defender:Ship:LightFighter')?.value,
    ).toBeNull()
    expect(
      fields.find((f) => f.key === 'defender:Defense:RocketLauncher')?.value,
    ).toBe('0')
    expect(simulationInputs(fields, attacking).inputs?.defender).toEqual({
      technology: [0, 0, 0],
      units: [],
    })
  })
  it('never truncates large reports or silently drops unsupported observed units', () => {
    const large = {
      ...report,
      fleet: {
        visibility: 'Known',
        value: [
          {
            item: { kind: 'Ship', id: 'LightFighter' },
            count: '9007199254740993',
          },
        ],
      },
    } as Espionage
    const fields = simulationFields(large, catalog, [])
    expect(
      fields.find((f) => f.key === 'defender:Ship:LightFighter')?.value,
    ).toBe('9007199254740993')
    expect(simulationInputs(fields, attacking).inputs).toBeNull()
    expect(unsupportedReportUnits(large, [])).toHaveLength(1)
  })
  it.each(['-1', '1.5', '1e3', 'Infinity', '2001'])(
    'rejects invalid player input %s',
    (value) => {
      expect(
        simulationInputs(simulationFields(report, catalog, []), {
          ...attacking,
          'attacker:Ship:LightFighter': value,
        }).inputs,
      ).toBeNull()
    },
  )
  it('uses historical observations unchanged regardless of report age and preserves edits separately', () => {
    const fields = simulationFields({ ...report, observed_at: 1 }, catalog, [])
    const edits = { ...attacking, 'defender:WeaponsTechnology': '7' }
    expect(simulationInputs(fields, edits).inputs?.defender.technology).toEqual(
      [7, 0, 0],
    )
    expect(
      fields.find((f) => f.key === 'defender:WeaponsTechnology')?.value,
    ).toBe('0')
  })
})

it('excludes catalog units without combat rules and blocks observed unsupported forces', () => {
  const unavailable = catalog.map((e) => ({
    ...e,
    technical_data: { ...technicalData, combat: null },
  }))
  const fields = simulationFields(report, unavailable, [])
  expect(fields.filter((f) => f.item)).toEqual([])
  const observed = {
    ...report,
    fleet: {
      visibility: 'Known',
      value: [{ item: { kind: 'Ship', id: 'LightFighter' }, count: '5' }],
    },
  } as Espionage
  expect(unsupportedReportUnits(observed, fields)).toHaveLength(1)
  // Earlier clients expose ship combat data separately; never use enabled/mobile
  // as a proxy for whether the combat engine supports a unit.
  const legacy = [
    {
      ...catalog[0],
      enabled: false,
      technical_data: undefined,
      ship_statistics: { propulsion: null, combat: technicalData.combat },
    },
  ]
  expect(
    simulationFields(report, legacy, []).filter((f) => f.item),
  ).toHaveLength(2)
})

it.each([true, false])(
  'satellites remain defenders only even when manufacture is disabled (%s)',
  (enabled) => {
    const item = { kind: 'Ship', id: 'SolarSatellite' } as const
    const observed: Espionage = {
      ...report,
      fleet: { visibility: 'Known', value: [{ item, count: '7' }] },
    }
    const fields = simulationFields(
      observed,
      [...catalog, { ...catalog[0], key: item, enabled, mobile: false }],
      [],
    )
    expect(
      fields.find((f) => f.key === 'defender:Ship:SolarSatellite')?.value,
    ).toBe('7')
    expect(fields.some((f) => f.key === 'attacker:Ship:SolarSatellite')).toBe(
      false,
    )
    expect(unsupportedReportUnits(observed, fields)).toEqual([])
  },
)

it('shows selected stationed inventory without constraining hypothetical forces', () => {
  const fields = simulationFields(
    report,
    catalog,
    [],
    [{ item: { kind: 'Ship', id: 'LightFighter' }, count: '3' }],
  )
  expect(
    fields.find((f) => f.key === 'attacker:Ship:LightFighter')?.available,
  ).toBe('3')
  expect(
    simulationInputs(fields, attacking).inputs?.attacker.units[0].count,
  ).toBe(10)
  expect(
    simulationFields(report, catalog, [], []).find(
      (f) => f.key === 'attacker:Ship:LightFighter',
    )?.available,
  ).toBe('0')
  expect(
    simulationFields(report, catalog, []).find(
      (f) => f.key === 'attacker:Ship:LightFighter',
    )?.available,
  ).toBeUndefined()
  expect(
    fields.find((f) => f.key === 'defender:Ship:LightFighter')?.available,
  ).toBeUndefined()
})
it('sends only observed resource snapshots and never leaks stray unknown values', () => {
  const fields = simulationFields(report, catalog, [])
  expect(
    simulationInputs(fields, attacking, report.resources).inputs
      ?.observed_resources,
  ).toEqual(
    report.resources.visibility === 'Known'
      ? report.resources.value
      : undefined,
  )
  expect(
    simulationInputs(fields, attacking, {
      visibility: 'Unknown',
      value: { metal: '99', crystal: '99', deuterium: '99' },
    } as Espionage['resources']).inputs?.observed_resources,
  ).toBeUndefined()
})
const sampleResponse = {
  binding: { account: '', player: '', universe: '', epoch: '' },
  request_id: '',
  profile_hash: '',
  loot_rules_enabled: true,
  samples: [
    {
      outcome: 'AttackerVictory',
      rounds: 1,
      attacker: [{ item: { kind: 'Ship', id: 'LightFighter' }, count: 8 }],
      defender: [],
      debris: { metal: '18000000', crystal: '6000000', deuterium: '0' },
      surviving_cargo_capacity: '400000000',
      estimated_loot: { metal: '99000000', crystal: '0', deuterium: '0' },
    },
    {
      outcome: 'Draw',
      rounds: 6,
      attacker: [{ item: { kind: 'Ship', id: 'LightFighter' }, count: 2 }],
      defender: [],
      debris: { metal: '18000000', crystal: '6000000', deuterium: '0' },
      surviving_cargo_capacity: '100000000',
      estimated_loot: { metal: '0', crystal: '0', deuterium: '0' },
    },
    {
      outcome: 'DefenderVictory',
      rounds: 3,
      attacker: [],
      defender: [],
      debris: { metal: '18000000', crystal: '6000000', deuterium: '0' },
      surviving_cargo_capacity: '0',
      estimated_loot: { metal: '0', crystal: '0', deuterium: '0' },
    },
  ],
} satisfies SimulationResponse
it('derives losses and aggregates per-battle loot including non-wins and absent survivors', () => {
  const unit = {
    item: { kind: 'Ship', id: 'LightFighter' },
    count: 10,
  } as const
  expect(averageSurvivors(sampleResponse, 'attacker', unit.item)).toBeCloseTo(
    10 / 3,
  )
  expect(attackerLosses(sampleResponse, unit)).toBeCloseTo(20 / 3)
  const summary = planningSummary(sampleResponse)
  expect(summary.cargo).toEqual({
    average: 166666666n,
    minimum: 0n,
    maximum: 400000000n,
  })
  expect(summary.total).toEqual({
    average: 33000000n,
    minimum: 0n,
    maximum: 99000000n,
  })
  expect(summary.loot?.[0].average).toBe(33000000n)
  expect(
    planningSummary({
      ...sampleResponse,
      samples: sampleResponse.samples.map((s) => ({
        ...s,
        estimated_loot: null,
      })),
    }).loot,
  ).toBeNull()
})
it('keeps large resource averages exact and handles absent samples', () => {
  expect(sampledAmounts(['90071992547409930', '90071992547409932'])).toEqual({
    average: 90071992547409931n,
    minimum: 90071992547409930n,
    maximum: 90071992547409932n,
  })
  expect(sampledAmounts([])).toBeNull()
})

it('defaults unobserved standalone defenders to zero and preserves player edits', () => {
  const fields = simulationFields(undefined, catalog, [
    { research: 'WeaponsTechnology', level: 4 },
  ])
  expect(
    fields.filter((f) => f.side === 'defender').every((f) => f.value === null),
  ).toBe(true)
  expect(fields.some((f) => f.source === 'Report')).toBe(false)
  expect(simulationInputs(fields, attacking).inputs?.defender).toEqual({
    technology: [0, 0, 0],
    units: [],
  })
  const edits = {
    ...attacking,
    'defender:WeaponsTechnology': '7',
    'defender:Ship:LightFighter': '2',
  }
  expect(simulationInputs(fields, edits).inputs).toEqual({
    attacker: {
      technology: [4, 0, 0],
      units: [{ item: { kind: 'Ship', id: 'LightFighter' }, count: 10 }],
    },
    defender: {
      technology: [7, 0, 0],
      units: [{ item: { kind: 'Ship', id: 'LightFighter' }, count: 2 }],
    },
  })
})

it('aggregates new debris across every sample, including zero and losing outcomes', () => {
  const samples = sampleResponse.samples.map((sample, index) => ({
    ...sample,
    debris: {
      metal: String(index * 9_000_000),
      crystal: String(index * 3_000_000),
      deuterium: String(index * 1_000_000),
    },
  }))
  expect(planningSummary({ ...sampleResponse, samples }).debris).toEqual([
    {
      resource: 'metal',
      average: 9_000_000n,
      minimum: 0n,
      maximum: 18_000_000n,
    },
    {
      resource: 'crystal',
      average: 3_000_000n,
      minimum: 0n,
      maximum: 6_000_000n,
    },
    {
      resource: 'deuterium',
      average: 1_000_000n,
      minimum: 0n,
      maximum: 2_000_000n,
    },
  ])
  expect(planningSummary({ ...sampleResponse, samples: [] }).debris).toEqual([])
})

// Cleared values override observations; submitting must fill only those edits.
it('converts blank technology and unit edits to zero without changing entered values or report facts', () => {
  const fields = simulationFields(report, catalog, [
    { research: 'WeaponsTechnology', level: 8 },
  ])
  const edits = {
    ...attacking,
    'attacker:WeaponsTechnology': '',
    'defender:ShieldingTechnology': '',
    'defender:Ship:LightFighter': '',
    'defender:Defense:RocketLauncher': '5',
  }
  expect(blankSimulationEdits(fields, edits)).toEqual({
    'attacker:WeaponsTechnology': '0',
    'defender:ShieldingTechnology': '0',
    'defender:Ship:LightFighter': '0',
  })
  const parsed = simulationInputs(fields, edits)
  expect(parsed.error).toBeNull()
  expect(parsed.inputs?.attacker.technology).toEqual([0, 0, 0])
  expect(parsed.inputs?.attacker.units).toEqual([
    { item: { kind: 'Ship', id: 'LightFighter' }, count: 10 },
  ])
  expect(parsed.inputs?.defender.technology).toEqual([0, 0, 0])
  expect(parsed.inputs?.defender.units).toEqual([
    { item: { kind: 'Defense', id: 'RocketLauncher' }, count: 5 },
  ])
  expect(
    fields.find((f) => f.key === 'attacker:WeaponsTechnology')?.value,
  ).toBe('8')
})

it('still requires an attacking ship when the only ship field is cleared', () => {
  expect(
    simulationInputs(simulationFields(undefined, catalog, []), {
      'attacker:Ship:LightFighter': '',
    }).error,
  ).toBe('Add at least one attacking ship.')
})

it('uses per-sample moon chances and mean rounds, with explicit target eligibility', () => {
  const response = {
    ...sampleResponse,
    moons_enabled: true,
    samples: sampleResponse.samples.map((s, i) => ({
      ...s,
      moon_chance_percent: [0, 20, 10][i],
    })),
  }
  expect(battleEstimates(response, 'Unknown').moon).toEqual({
    average: 10,
    minimum: 0,
    maximum: 20,
  })
  expect(
    battleEstimates(response, 'PlanetWithoutMoon').averageRounds,
  ).toBeCloseTo(10 / 3)
  for (const target of ['Moon', 'PlanetWithMoon'] as const)
    expect(battleEstimates(response, target).moon?.average).toBe(0)
  expect(
    battleEstimates({ ...response, moons_enabled: false }, 'PlanetWithoutMoon')
      .moon?.average,
  ).toBe(0)
  expect(battleEstimates(sampleResponse, 'Unknown').moon).toBeNull()
})
it('rounds recyclers up from the average harvestable field using supplied capacity and all debris resources', () => {
  const response = {
    ...sampleResponse,
    recycler_capacity: '10000000',
    samples: sampleResponse.samples.slice(0, 2).map((s, i) => ({
      ...s,
      debris: {
        metal: '9999999',
        crystal: '0',
        deuterium: i ? '22000000' : '0',
      },
    })),
  }
  // Fields contain 9 and 31 whole units: mean 20 needs two ships, max 31 needs four.
  expect(battleEstimates(response, 'Unknown').recyclers).toEqual({
    estimate: 2n,
    maximum: 4n,
    capacity: 10n,
  })
  expect(
    battleEstimates({ ...response, recycler_capacity: '3000000' }, 'Unknown')
      .recyclers?.estimate,
  ).toBe(7n)
  expect(
    battleEstimates({ ...response, recycler_capacity: '0' }, 'Unknown')
      .recyclers,
  ).toBeNull()
  expect(
    battleEstimates({ ...response, samples: [] }, 'Unknown').recyclers,
  ).toBeNull()
})
it('compares cargo coverage for victorious samples against rule-calculated available loot', () => {
  expect(
    battleEstimates(
      {
        ...sampleResponse,
        available_loot: { metal: '99000000', crystal: '0', deuterium: '0' },
      },
      'Unknown',
    ),
  ).toMatchObject({ cargoCovered: 1, victories: 1 })
  expect(
    battleEstimates(
      {
        ...sampleResponse,
        available_loot: { metal: '100000000', crystal: '0', deuterium: '0' },
      },
      'Unknown',
    ).cargoCovered,
  ).toBe(0)
  expect(battleEstimates(sampleResponse, 'Unknown').cargoCovered).toBeNull()
})
it('keeps unknown and invalid force values discoverable in collapsed summaries', () => {
  const fields = simulationFields(undefined, catalog, []).filter(
    (f) => f.side === 'defender' && f.item,
  )
  expect(simulationGroupSummary(fields, {})).toMatchObject({
    total: 0n,
    unknown: fields.length,
    invalid: 0,
  })
  expect(
    simulationGroupSummary(fields, { [fields[0].key]: '2001' }),
  ).toMatchObject({ invalid: 1 })
  expect(
    simulationGroupSummary(fields, { [fields[0].key]: '23' }),
  ).toMatchObject({ total: 23n, types: 1 })
})
it('shares canonical ship ordering on both sides without mutating the catalog', () => {
  const ships = ['ColonyShip', 'SmallCargo', 'Cruiser', 'LightFighter'].map(
    (id, i) => ({
      ...catalog[0],
      key: { kind: 'Ship' as const, id: id as 'LightFighter' },
      ship_statistics: {
        combat: technicalData.combat,
        propulsion: null,
        cost: [String([40000, 4000, 29000, 4000][i]), '0', '0'] as [
          string,
          string,
          string,
        ],
      },
    }),
  )
  const before = ships.map((s) => s.key.id)
  for (const side of ['attacker', 'defender'])
    expect(
      simulationFields(undefined, ships, [])
        .filter((f) => f.side === side && f.item)
        .map((f) => f.item?.id),
    ).toEqual(['LightFighter', 'Cruiser', 'SmallCargo', 'ColonyShip'])
  expect(ships.map((s) => s.key.id)).toEqual(before)
})
