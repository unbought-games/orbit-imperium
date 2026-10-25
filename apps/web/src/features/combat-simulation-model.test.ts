import { describe, expect, it } from 'vitest'
import observation from '../../../../contracts/fixtures/espionage-expanded.json'
import {
  simulationFields,
  simulationInputs,
  unsupportedReportUnits,
  type Espionage,
} from './combat-simulation-model'
import type { components } from '../contracts'
const report = observation as Espionage
const catalog: components['schemas']['CatalogEntry3'][] = [
  {
    key: { kind: 'Ship', id: 'LightFighter' },
    body_kinds: ['Planet'],
    requirements: [],
    enabled: true,
    mobile: true,
  },
  {
    key: { kind: 'Defense', id: 'RocketLauncher' },
    body_kinds: ['Planet'],
    requirements: [],
    enabled: true,
    mobile: false,
  },
]
const attacking = { 'attacker:Ship:LightFighter': '10' }
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
