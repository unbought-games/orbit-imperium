import { describe, expect, it } from 'vitest'
import observation from '../../../../contracts/fixtures/espionage-expanded.json'
import {
  attackerLosses,
  averageSurvivors,
  planningSummary,
  sampledAmounts,
  type SimulationResponse,
  simulationFields,
  simulationInputs,
  unsupportedReportUnits,
  unknownAssumptions,
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
    expect(simulationInputs(fields, attacking).inputs).toBeNull()
    const assumptions = Object.fromEntries(
      fields.filter((f) => f.value === null).map((f) => [f.key, '0']),
    )
    expect(
      simulationInputs(fields, { ...attacking, ...assumptions }).inputs
        ?.defender,
    ).toEqual({ technology: [0, 0, 0], units: [] })
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
  it.each(['', '-1', '1.5', '1e3', 'Infinity', '2001'])(
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
      surviving_cargo_capacity: '400000000',
      estimated_loot: { metal: '99000000', crystal: '0', deuterium: '0' },
    },
    {
      outcome: 'Draw',
      rounds: 6,
      attacker: [{ item: { kind: 'Ship', id: 'LightFighter' }, count: 2 }],
      defender: [],
      surviving_cargo_capacity: '100000000',
      estimated_loot: { metal: '0', crystal: '0', deuterium: '0' },
    },
    {
      outcome: 'DefenderVictory',
      rounds: 3,
      attacker: [],
      defender: [],
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

it('starts standalone defenders unknown and only submits explicit assumptions without observed intel', () => {
  const fields = simulationFields(undefined, catalog, [
    { research: 'WeaponsTechnology', level: 4 },
  ])
  expect(
    fields.filter((f) => f.side === 'defender').every((f) => f.value === null),
  ).toBe(true)
  expect(fields.some((f) => f.source === 'Report')).toBe(false)
  expect(simulationInputs(fields, attacking).inputs).toBeNull()
  const edits = {
    ...attacking,
    'defender:WeaponsTechnology': '7',
    'defender:Ship:LightFighter': '2',
  }
  const assumptions = unknownAssumptions(fields, edits)
  expect(assumptions).not.toHaveProperty('defender:WeaponsTechnology')
  expect(simulationInputs(fields, { ...edits, ...assumptions }).inputs).toEqual(
    {
      attacker: {
        technology: [4, 0, 0],
        units: [{ item: { kind: 'Ship', id: 'LightFighter' }, count: 10 }],
      },
      defender: {
        technology: [7, 0, 0],
        units: [{ item: { kind: 'Ship', id: 'LightFighter' }, count: 2 }],
      },
    },
  )
})
