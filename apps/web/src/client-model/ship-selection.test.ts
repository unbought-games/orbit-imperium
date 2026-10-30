import { expect, it } from 'vitest'
import { availableDispatchShips, dispatchShipVisible } from './ship-selection'

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

it.each([undefined, '', ' ', '0', '000'])(
  'hides unavailable ships without a selected count (%j)',
  (selected) => {
    expect(dispatchShipVisible('0', selected)).toBe(false)
  },
)
it.each(['1', '01', '-1', '1.5', '1e2', 'invalid'])(
  'retains an unavailable ship with an edit to correct (%j)',
  (selected) => {
    expect(dispatchShipVisible('0', selected)).toBe(true)
  },
)
it('shows available ships even before selection, preserving large inventory counts', () => {
  expect(dispatchShipVisible('1')).toBe(true)
  expect(dispatchShipVisible('9007199254740993', '0')).toBe(true)
})
