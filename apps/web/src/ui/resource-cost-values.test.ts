import { describe, expect, it } from 'vitest'
import { exactResource, resourceDecision } from './resource-cost-values'

describe('exact resource decisions', () => {
  it('preserves sub-unit shortages and amounts beyond safe integer precision', () => {
    expect(exactResource('9007199254740993123456')).toBe(
      '9,007,199,254,740,993.123456',
    )
    expect(exactResource('-1')).toBe('−0.000001')
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
    expect(exactResource('500000')).toBe('0.5')
  })
})
