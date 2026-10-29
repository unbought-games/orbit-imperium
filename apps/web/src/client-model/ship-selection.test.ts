import { expect, it } from 'vitest'
import { availableDispatchShips } from './ship-selection'

it('fills only dispatchable ships, preserves exact quantities, and resets unavailable types to zero', () => {
  expect(
    availableDispatchShips(
      ['SmallCargo', 'LightFighter', 'Recycler'],
      [
        { item: { kind: 'Defense', id: 'RocketLauncher' }, count: '8' },
        { item: { kind: 'Ship', id: 'SmallCargo' }, count: '9007199254740993' },
        { item: { kind: 'Ship', id: 'LightFighter' }, count: '0' },
        { item: { kind: 'Ship', id: 'SolarSatellite' }, count: '50' },
      ],
    ),
  ).toEqual({
    SmallCargo: '9007199254740993',
    LightFighter: '0',
    Recycler: '0',
  })
})
