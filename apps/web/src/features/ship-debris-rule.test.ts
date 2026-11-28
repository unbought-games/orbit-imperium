import { expect, it } from 'vitest'
import { readyFixture } from '../test-support/bootstrap'
import { shipDebrisRule } from './ship-debris-rule'

const { settings } = readyFixture(4).snapshot
if (settings.protocol !== 4) throw Error('World settings fixture required')

it('explains the configured construction resources and the narrower moon calculation', () => {
  expect(
    shipDebrisRule({
      ...settings,
      ship_debris: {
        basis_points: 4567,
        deuterium_in_debris: true,
        moons_enabled: true,
      },
    }),
  ).toBe(
    'Destroyed ships leave 45.67% of their metal, crystal and deuterium build costs as debris. Carried cargo and fuel add nothing to the field. Only newly created metal and crystal debris count toward moon chance.',
  )
})

it('preserves a zero rate and disabled deuterium and moon formation', () => {
  expect(
    shipDebrisRule({
      ...settings,
      ship_debris: {
        basis_points: 0,
        deuterium_in_debris: false,
        moons_enabled: false,
      },
    }),
  ).toBe(
    'Destroyed ships leave 0% of their metal and crystal build costs as debris. Carried cargo and fuel add nothing to the field. Moons cannot form in this universe.',
  )
})

it('omits the rule when the active server has not supplied it', () => {
  expect(shipDebrisRule(settings)).toBeNull()
  expect(shipDebrisRule(readyFixture(3).snapshot.settings)).toBeNull()
  expect(shipDebrisRule(null)).toBeNull()
})
