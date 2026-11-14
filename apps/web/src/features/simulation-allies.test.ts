import { expect, it } from 'vitest'
import {
  allyFields,
  withSimulationAllies,
  combinedSimulationUnits,
} from './simulation-allies'
import type {
  SimulationField,
  SimulationInputs,
} from './combat-simulation-model'
const fields: SimulationField[] = [
  {
    key: 'attacker:w',
    side: 'attacker',
    label: 'WeaponsTechnology',
    technology: 0,
    value: '1',
    source: 'Your research',
  },
  {
    key: 'attacker:ship',
    side: 'attacker',
    label: 'LightFighter',
    item: { kind: 'Ship', id: 'LightFighter' },
    value: '0',
    source: 'Plan',
  },
]
const ally = { id: 'one', side: 'attacker' as const }
const inputs: SimulationInputs = {
  attacker: {
    technology: [1, 2, 3],
    units: [{ item: { kind: 'Ship', id: 'LightFighter' }, count: 2 }],
  },
  defender: { technology: [0, 0, 0], units: [] },
}
it('keeps allied technology provenance and combines result counts only', () => {
  expect(allyFields(fields, ally)[0].value).toBeNull()
  expect(
    withSimulationAllies({ inputs, error: null }, fields, [ally], {}).inputs,
  ).toBeNull()
  const result = withSimulationAllies({ inputs, error: null }, fields, [ally], {
    'one:attacker:w': '9',
    'one:attacker:ship': '3',
  })
  expect(result.inputs?.attacking_allies?.[0].technology[0]).toBe(9)
  expect(result.inputs?.attacker.technology[0]).toBe(1)
  expect(combinedSimulationUnits(result.inputs, 'attacker')[0].count).toBe(5)
})
it('enforces the total simulation limit across every contingent', () => {
  const result = withSimulationAllies({ inputs, error: null }, fields, [ally], {
    'one:attacker:w': '0',
    'one:attacker:ship': '2000',
  })
  expect(result.inputs).toBeNull()
  expect(result.error).toContain('2,000')
})

it.each(['attacker', 'defender'] as const)(
  'defaults unknown and cleared %s ally technology to zero',
  (side) => {
    for (const technology of [undefined, '']) {
      const edits: Record<string, string> = { 'one:attacker:ship': '3' }
      if (technology !== undefined) edits['one:attacker:w'] = technology
      const result = withSimulationAllies(
        { inputs, error: null },
        fields,
        [{ ...ally, side }],
        edits,
      )
      expect(result.error).toBeNull()
      expect(
        result.inputs?.[
          side === 'attacker' ? 'attacking_allies' : 'defending_allies'
        ],
      ).toEqual([
        {
          technology: [0, 0, 0],
          units: [{ item: { kind: 'Ship', id: 'LightFighter' }, count: 3 }],
        },
      ])
    }
  },
)

it('keeps combined allied survivors in canonical field order even when a primary fleet omits a type', () => {
  const cargo = { item: { kind: 'Ship', id: 'SmallCargo' } as const, count: 2 }
  const mixed = {
    ...inputs,
    attacker: { ...inputs.attacker, units: [cargo] },
    attacking_allies: [inputs.attacker],
  }
  const ordered = [
    ...fields,
    {
      ...fields[1],
      key: 'attacker:cargo',
      label: 'SmallCargo',
      item: cargo.item,
    },
  ]
  expect(
    combinedSimulationUnits(mixed, 'attacker', ordered).map(
      (unit) => unit.item.id,
    ),
  ).toEqual(['LightFighter', 'SmallCargo'])
})
