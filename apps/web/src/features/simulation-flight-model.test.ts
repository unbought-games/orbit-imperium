import { expect, it } from 'vitest'
import observation from '../../../../contracts/fixtures/espionage-expanded.json'
import type { components } from '../contracts'
import type { Espionage, SimulationField } from './combat-simulation-model'
import {
  simulationFlightDraft,
  simulationAttackProblem,
  simulationDestination,
} from './simulation-flight-model'
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
  const result = simulationFlightDraft(
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
  'estimates hypothetical fleet %s without clipping it while blocking attack preparation',
  (count) => {
    const result = simulationFlightDraft(
      report,
      fields,
      { 'attacker:Ship:LightFighter': count },
      body,
      100,
    )
    expect(result.draft?.ships).toEqual({ LightFighter: count })
    expect(result.problem).toBe('')
    expect(simulationAttackProblem(result.draft!, body)).toContain(
      `${count} selected, 3 stationed`,
    )
  },
)
it.each(['-1', '1.2', '1e2'])('rejects invalid count %s', (count) => {
  expect(
    simulationFlightDraft(
      report,
      fields,
      { 'attacker:Ship:LightFighter': count },
      body,
      100,
    ).draft,
  ).toBeNull()
})
it('checks current stationed inventory independently of advisory estimates', () => {
  const outdated = [{ ...fields[0], available: '99' }]
  const { draft } = simulationFlightDraft(
    report,
    outdated,
    { 'attacker:Ship:LightFighter': '4' },
    body,
    100,
  )
  expect(simulationAttackProblem(draft!, body)).toContain(
    '4 selected, 3 stationed',
  )
  expect(
    simulationAttackProblem(draft!, { ...body, inventories: [] }),
  ).toContain('4 selected, 0 stationed')
  expect(
    simulationAttackProblem(draft!, {
      ...body,
      inventories: [{ item: { kind: 'Ship', id: 'LightFighter' }, count: '4' }],
    }),
  ).toBe('')
  expect(
    simulationFlightDraft(report, fields, {}, body, 100).problem,
  ).toContain('Select attacking ships')
  expect(
    simulationFlightDraft(report, fields, {}, undefined, 100).problem,
  ).toContain('Select an origin')
})
it.each(['Planet', 'Moon'] as const)(
  'uses manual %s coordinates and the current origin and speed without inventing an observation',
  (kind) => {
    const destination = {
      coordinates: { galaxy: 2, system: 10, position: 3 },
      kind,
    }
    for (const [origin, speed] of [
      ['origin', 100],
      ['other-origin', 30],
    ] as const) {
      const { draft } = simulationFlightDraft(
        undefined,
        fields,
        { 'attacker:Ship:LightFighter': '15' },
        { ...body, id: origin, inventories: [] },
        speed,
        destination,
      )
      expect(draft).toEqual({
        origin,
        speed,
        mission: 'Attack',
        coordinates: destination.coordinates,
        targetKind: kind.toLowerCase(),
        ships: { LightFighter: '15' },
      })
    }
  },
)
it('distinguishes incomplete and invalid manual coordinates using universe bounds', () => {
  const settings = {
    galaxies: 3,
    systems_per_galaxy: 499,
    positions_per_system: 15 as const,
  }
  expect(simulationDestination('', settings)).toMatchObject({
    coordinates: null,
    problem: 'Enter destination coordinates to estimate flight.',
  })
  for (const text of [
    '1:2',
    '0:1:1',
    '1:1:16',
    '1:500:1',
    '4:1:1',
    '1:1:1.5',
    '99999999999999999999:1:1',
  ]) {
    expect(simulationDestination(text, settings).coordinates).toBeNull()
    expect(simulationDestination(text, settings).problem).not.toBe('')
  }
  expect(simulationDestination('3:499:15', settings)).toEqual({
    coordinates: { galaxy: 3, system: 499, position: 15 },
    problem: '',
  })
})

it.each([false, true])(
  'treats an unused attacking ship as zero for flight planning (cleared=%s)',
  (cleared) => {
    const withBomber: SimulationField[] = [
      ...fields,
      {
        key: 'attacker:Ship:Bomber',
        side: 'attacker',
        label: 'Bomber',
        item: { kind: 'Ship', id: 'Bomber' },
        value: cleared ? '5' : null,
        source: 'Plan',
      },
    ]
    const edits: Record<string, string> = { 'attacker:Ship:LightFighter': '3' }
    if (cleared) edits['attacker:Ship:Bomber'] = ''
    const { draft, problem } = simulationFlightDraft(
      report,
      withBomber,
      edits,
      body,
      100,
    )
    expect(problem).toBe('')
    expect(draft?.ships).toEqual({ LightFighter: '3' })
    expect(simulationAttackProblem(draft!, body)).toBe('')
  },
)

it('requires a nonzero attacking ship after the only ship count is cleared', () => {
  const result = simulationFlightDraft(
    report,
    fields,
    { 'attacker:Ship:LightFighter': '' },
    body,
    100,
  )
  expect(result.draft).toBeNull()
  expect(result.problem).toBe(
    'Select attacking ships to estimate flight and prepare an attack.',
  )
})
