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
it('keeps allied technology unknown until supplied and combines result counts only', () => {
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
