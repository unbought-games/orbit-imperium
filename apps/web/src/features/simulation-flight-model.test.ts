import { expect, it } from 'vitest'
import observation from '../../../../contracts/fixtures/espionage-expanded.json'
import type { components } from '../contracts'
import type { Espionage, SimulationField } from './combat-simulation-model'
import { simulationAttackDraft } from './simulation-flight-model'
const report = observation as Espionage
const fields: SimulationField[] = [
  {
    key: 'attacker:Ship:LightFighter',
    side: 'attacker',
    label: 'LightFighter',
    item: { kind: 'Ship', id: 'LightFighter' },
    value: '0',
    source: 'Plan',
  },
  {
    key: 'attacker:WeaponsTechnology',
    side: 'attacker',
    label: 'WeaponsTechnology',
    technology: 0,
    value: '3',
    source: 'Your research',
  },
  {
    key: 'defender:Ship:LightFighter',
    side: 'defender',
    label: 'LightFighter',
    item: { kind: 'Ship', id: 'LightFighter' },
    value: '99',
    source: 'Report',
  },
]
const body = {
  id: 'origin',
  inventories: [{ item: { kind: 'Ship', id: 'LightFighter' }, count: '3' }],
} as components['schemas']['BodyV3']
it('transfers selected counts, origin, speed and observed moon, without simulated technology or defender forces', () => {
  const moon = {
    ...report,
    target: { ...report.target, kind: 'Moon' as const },
  }
  const result = simulationAttackDraft(
    moon,
    fields,
    { 'attacker:Ship:LightFighter': '3', 'attacker:WeaponsTechnology': '100' },
    body,
    60,
  )
  expect(result).toEqual({
    problem: '',
    draft: {
      origin: 'origin',
      ships: { LightFighter: '3' },
      speed: 60,
      mission: 'Attack',
      coordinates: report.target.coordinates,
      targetKind: 'moon',
      observedAt: report.observed_at,
      target: {
        type: 'Body',
        id: report.target.body,
        expected_kind: 'Moon',
        expected_owner: report.target.owner,
      },
    },
  })
})
it.each(['4', '99999999999999999999999999999999'])(
  'rejects unavailable hypothetical fleet %s without clipping it',
  (count) => {
    const result = simulationAttackDraft(
      report,
      fields,
      { 'attacker:Ship:LightFighter': count },
      body,
      100,
    )
    expect(result.draft).toBeNull()
    expect(result.problem).toContain(`${count} selected, 3 stationed`)
  },
)
it.each(['', '-1', '1.2', '1e2'])('rejects invalid count %s', (count) => {
  expect(
    simulationAttackDraft(
      report,
      fields,
      { 'attacker:Ship:LightFighter': count },
      body,
      100,
    ).draft,
  ).toBeNull()
})
it('checks live inventory rather than stored field availability', () => {
  const outdated = [{ ...fields[0], available: '99' }]
  expect(
    simulationAttackDraft(
      report,
      outdated,
      { 'attacker:Ship:LightFighter': '4' },
      body,
      100,
    ).draft,
  ).toBeNull()
  expect(
    simulationAttackDraft(report, fields, {}, body, 100).problem,
  ).toContain('Select attacking ships')
  expect(
    simulationAttackDraft(report, fields, {}, undefined, 100).problem,
  ).toContain('Select an origin')
})
