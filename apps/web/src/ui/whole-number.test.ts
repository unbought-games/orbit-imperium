import { describe, expect, it } from 'vitest'
import { formatWholeNumber } from './whole-number'

describe('whole number presentation', () => {
  it.each([
    [99.9, 1, '99'],
    [-1.2, 1, '-2'],
    [0, 1, '0'],
    [-0, 1, '0'],
    ['1999999', 1000000, '1'],
    ['1', 1000000, '0'],
    ['-1000001', 1000000, '-2'],
    ['-999999', 1000000, '-1'],
    ['-1000000', 1000000, '-1'],
    ['-1', 1000000, '-1'],
    ['9007199254740993123456', 1000000, '9,007,199,254,740,993'],
    ['-9007199254740993123456', 1000000, '-9,007,199,254,740,994'],
    [9223372036854775807n, 1000000, '9,223,372,036,854'],
    [53584, 10000, '5'],
    [1999, 1000, '1'],
  ] as const)('floors %s at scale %s to %s', (value, divisor, expected) => {
    expect(formatWholeNumber(value, divisor)).toBe(expected)
  })
  it('does not render non-finite numbers or accept invalid scales', () => {
    expect(formatWholeNumber(Infinity)).toBe('Unknown')
    expect(formatWholeNumber(NaN)).toBe('Unknown')
    for (const scale of [0, -1, 1.5, Infinity])
      expect(() => formatWholeNumber('1', scale)).toThrow(RangeError)
  })
})
