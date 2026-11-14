import { expect, it } from 'vitest'
import type { components } from '../contracts'
import { jumpSelection, jumpShips } from './jump-gate-model'
type S = components['schemas']
const moon = {
  id: 'moon',
  inventories: [
    { item: { kind: 'Ship', id: 'SmallCargo' }, count: '9007199254740993' },
    { item: { kind: 'Ship', id: 'SolarSatellite' }, count: '3' },
    { item: { kind: 'Defense', id: 'RocketLauncher' }, count: '2' },
  ],
} as S['BodyV3']
const catalog = [
  { key: { kind: 'Ship', id: 'SmallCargo' }, mobile: true, enabled: true },
  { key: { kind: 'Ship', id: 'SolarSatellite' }, mobile: false, enabled: true },
] as S['CatalogEntry3'][]
it('selects only installed mobile ships with exact counts beyond Number precision', () => {
  expect(jumpShips(moon, catalog)).toEqual([
    { ship_type: 'SmallCargo', count: '9007199254740993' },
  ])
  expect(
    jumpSelection(
      moon,
      'other',
      'owner',
      { SmallCargo: '9007199254740993' },
      catalog,
    )?.ships,
  ).toEqual([
    { owner: 'owner', ship_type: 'SmallCargo', count: '9007199254740993' },
  ])
})
it('rejects excess, malformed, empty and vanished ship selections without shrinking a reviewed fleet', () => {
  const cases: Record<string, string>[] = [
    { SmallCargo: '9007199254740994' },
    { SmallCargo: '-1' },
    { SmallCargo: '1.5' },
    { SmallCargo: '0' },
    { SmallCargo: '7', Cruiser: '1' },
  ]
  for (const quantities of cases)
    expect(
      jumpSelection(moon, 'other', 'owner', quantities, catalog),
    ).toBeNull()
  expect(
    jumpSelection(moon, 'moon', 'owner', { SmallCargo: '1' }, catalog),
  ).toBeNull()
  expect(
    jumpSelection(moon, '', 'owner', { SmallCargo: '1' }, catalog),
  ).toBeNull()
})
