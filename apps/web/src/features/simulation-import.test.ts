import { expect, it } from 'vitest'
import { ownedDefenderImport, replaceDefenderEdits } from './simulation-import'
import { simulationFields, simulationInputs } from './combat-simulation-model'
import type { components } from '../contracts'

type S = components['schemas']
const body = {
  id: 'owned-id',
  kind: 'Planet' as const,
  coordinates: { galaxy: 1, system: 2, position: 3 },
  inventories: [],
}
const combat = {
  attack_ticks: '1',
  shield_ticks: '1',
  hull_ticks: '1',
  rapid_fire_against: [],
  rapid_fire_from: [],
}
const items = [
  { kind: 'Ship', id: 'LightFighter' },
  { kind: 'Ship', id: 'SolarSatellite' },
  { kind: 'Defense', id: 'RocketLauncher' },
] as const
const catalog: S['CatalogEntry3'][] = items.map((key) => ({
  key,
  body_kinds: ['Planet'],
  enabled: false,
  mobile: key.id === 'LightFighter',
  requirements: [],
  technical_data: { combat, facts: [], bonuses: [], storage_capacities: null },
}))
const view = {
  bodies: [
    {
      ...body,
      name: 'Home',
      inventories: items.map((item, i) => ({ item, count: String(i + 3) })),
    },
  ],
  research: [{ research: 'WeaponsTechnology', level: 7 } as const],
  catalog,
  as_of_ms: 1000,
}
it.each(['Planet', 'Moon'] as const)(
  'explicitly imports owned %s research and defenses, with ships opt-in',
  (kind) => {
    const current = { ...view, bodies: [{ ...view.bodies[0], kind }] }
    const fields = simulationFields(undefined, catalog, current.research)
    for (const includeShips of [false, true]) {
      const imported = ownedDefenderImport(
        current,
        body.id,
        includeShips,
        false,
      )
      expect(imported.error).toBeNull()
      expect(imported.source).toContain(`${kind} · Home`)
      const edits = replaceDefenderEdits(
        {
          'attacker:Ship:LightFighter': '13',
          'defender:WeaponsTechnology': '99',
          'ally:attacker:WeaponsTechnology': '4',
        },
        imported.values!,
      )
      expect(edits['attacker:Ship:LightFighter']).toBe('13')
      expect(edits['ally:attacker:WeaponsTechnology']).toBe('4')
      expect(simulationInputs(fields, edits).inputs?.defender).toEqual({
        technology: [7, 0, 0],
        units: [
          ...(includeShips
            ? [
                { item: items[0], count: 3 },
                { item: items[1], count: 4 },
              ]
            : []),
          { item: items[2], count: 5 },
        ],
      })
      // Imported draft values are independent from subsequent world changes.
      current.bodies[0] = { ...current.bodies[0], inventories: [] }
      expect(edits['defender:Defense:RocketLauncher']).toBe('5')
      current.bodies[0] = { ...view.bodies[0], kind }
    }
  },
)
it('rejects missing, stale or non-owned body data, and never substitutes zeros for unavailable collections', () => {
  for (const [current, selected, stale] of [
    [null, body.id, false],
    [view, 'enemy-id', false],
    [view, undefined, false],
    [view, body.id, true],
    [{ ...view, research: undefined }, body.id, false],
    [
      { ...view, bodies: [{ ...body, inventories: undefined }] },
      body.id,
      false,
    ],
  ] as const) {
    expect(
      ownedDefenderImport(current as typeof view, selected, true, stale).values,
    ).toBeNull()
  }
})
it('rejects unsupported included forces and preserves oversized inventory instead of truncating', () => {
  const missing = { ...view, catalog: catalog.slice(2) }
  expect(ownedDefenderImport(missing, body.id, true, false).values).toBeNull()
  expect(
    ownedDefenderImport(missing, body.id, false, false).values,
  ).not.toBeNull()
  const large = {
    ...view,
    bodies: [
      { ...body, inventories: [{ item: items[2], count: '9007199254740993' }] },
    ],
  }
  const imported = ownedDefenderImport(large, body.id, false, false)
  expect(imported.values?.['defender:Defense:RocketLauncher']).toBe(
    '9007199254740993',
  )
  expect(
    simulationInputs(simulationFields(undefined, catalog, []), {
      ...imported.values,
      'attacker:Ship:LightFighter': '1',
    }).inputs,
  ).toBeNull()
})
it('restoring report defaults clears only primary defender edits', () => {
  expect(
    replaceDefenderEdits(
      {
        'defender:WeaponsTechnology': '7',
        'attacker:WeaponsTechnology': '8',
        'ally:defender:WeaponsTechnology': '9',
      },
      {},
    ),
  ).toEqual({
    'attacker:WeaponsTechnology': '8',
    'ally:defender:WeaponsTechnology': '9',
  })
})
