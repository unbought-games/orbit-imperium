import { expect, it } from 'vitest'
import { validate } from './schema'
import { id } from '../test-support/bootstrap'

it('accepts known expanded fleet types without a four-type MVP limit', () => {
  const ships = [
    'SmallCargo',
    'LargeCargo',
    'LightFighter',
    'Recycler',
    'EspionageProbe',
  ]
  expect(() =>
    validate('FleetIntent4', {
      origin: id(1),
      destination: {
        type: 'Body',
        id: id(2),
        expected_kind: 'Planet',
        expected_owner: id(3),
      },
      mission: 'Transport',
      ships: ships.map((ship_type) => ({
        owner: id(4),
        ship_type,
        count: '1',
      })),
      cargo: { metal: '0', crystal: '0', deuterium: '0' },
      speed_percent: 100,
    }),
  ).not.toThrow()
})
