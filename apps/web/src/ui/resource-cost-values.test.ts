import { describe, expect, it } from 'vitest'
import { resourceDecision } from './resource-cost-values'

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
