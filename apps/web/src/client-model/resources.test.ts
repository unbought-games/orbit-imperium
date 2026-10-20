import { expect, it } from 'vitest'
import { canAfford, canFundFleet, resourceShortfalls } from './resources'

it('uses exact balances for every resource, including values above Number precision', () => {
  const cost = { metal: '9007199254740993', crystal: '15', deuterium: '10' }
  expect(canAfford(cost, { ...cost, metal: '9007199254740992' })).toBe(false)
  expect(canAfford(cost, cost)).toBe(true)
  expect(canAfford(cost, { ...cost, crystal: '14' })).toBe(false)
  expect(canAfford(cost, { ...cost, deuterium: '9' })).toBe(false)
  expect(
    resourceShortfalls(cost, { metal: '0', crystal: '14', deuterium: '10' }),
  ).toEqual([
    { name: 'metal', required: '9007199254740993', actual: '0' },
    { name: 'crystal', required: '15', actual: '14' },
  ])
})

it('requires deuterium for both fleet cargo and fuel from the current balance', () => {
  const cargo = { metal: '30', crystal: '15', deuterium: '10' }
  expect(canFundFleet(cargo, '5', { ...cargo, deuterium: '14' })).toBe(false)
  expect(canFundFleet(cargo, '5', { ...cargo, deuterium: '15' })).toBe(true)
  expect(
    canFundFleet(cargo, '5', { ...cargo, metal: '29', deuterium: '15' }),
  ).toBe(false)
})
