import { describe, expect, it } from 'vitest'
import { resourceDecision, resourceShortfalls } from './resource-cost-values'

describe('exact resource decisions', () => {
  it('preserves sub-unit shortages and amounts beyond safe integer precision', () => {
    expect(
      resourceDecision('9007199254740993123456', '9007199254740993123455'),
    ).toEqual({ after: '-1', shortfall: '1' })
  })
  it('derives zero and positive after-spend balances without a shortfall', () => {
    expect(resourceDecision('1500000', '1500000')).toEqual({
      after: '0',
      shortfall: null,
    })
    expect(resourceDecision('1500000', '2000000')).toEqual({
      after: '500000',
      shortfall: null,
    })
  })
})

it('collects only exact shortages, including sub-unit amounts', () => {
  expect(
    resourceShortfalls(
      { metal: '303000000', crystal: '75000000', deuterium: '0' },
      { metal: '120000000', crystal: '74999999', deuterium: '1000000' },
    ),
  ).toEqual([
    { resource: 'metal', amount: '183000000' },
    { resource: 'crystal', amount: '1' },
  ])
  expect(
    resourceShortfalls(
      { metal: '0', crystal: '0', deuterium: '0' },
      { metal: '0', crystal: '0', deuterium: '0' },
    ),
  ).toEqual([])
})
