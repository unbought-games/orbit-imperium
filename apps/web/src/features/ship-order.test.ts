import { expect, it } from 'vitest'
import { compareShips, shipGroup } from './ship-order'
import type { components } from '../contracts'
type Entry = components['schemas']['CatalogEntry3']
const entry = (id: string, cost: string[], mobile = true) =>
  ({ key: { kind: 'Ship', id }, mobile, ship_statistics: { cost } }) as Entry
it('groups ships and sorts by total point cost, including colony ships and stationary satellites', () => {
  const ships = [
    entry('ColonyShip', ['10000', '20000', '10000']),
    entry('SolarSatellite', ['0', '2000', '500'], false),
    entry('LargeCargo', ['6000', '6000', '0']),
    entry('Cruiser', ['20000', '7000', '2000']),
    entry('Recycler', ['10000', '6000', '2000']),
    entry('LightFighter', ['3000', '1000', '0']),
    entry('SmallCargo', ['2000', '2000', '0']),
    entry('EspionageProbe', ['0', '1000', '0']),
  ]
  expect(ships.sort(compareShips).map((x) => x.key.id)).toEqual([
    'LightFighter',
    'Cruiser',
    'EspionageProbe',
    'SolarSatellite',
    'SmallCargo',
    'LargeCargo',
    'Recycler',
    'ColonyShip',
  ])
  expect(shipGroup(ships.at(-1)!)).toBe('Peace')
  expect(
    compareShips(
      entry('Cruiser', ['9007199254740993']),
      entry('LightFighter', ['9007199254740992']),
    ),
  ).toBe(1)
})
