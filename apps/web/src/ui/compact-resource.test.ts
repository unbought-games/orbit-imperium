import { expect, it } from 'vitest'
import { formatCompactCost, formatCompactResource } from './compact-resource'

it.each([
  ['0', '0'],
  ['999999', '0'],
  ['999999999', '999'],
  ['1000000000', '1K'],
  ['1299999999', '1.2K'],
  ['999999999999', '999K'],
  ['9999999999', '9.9K'],
  ['10999999999', '10K'],
  ['99999999999', '99K'],
  ['-999999999', '-1K'],
  ['-999999999999', '-1M'],
  ['1000000000000', '1M'],
  ['999999999999999', '999M'],
  ['1000000000000000', '1B'],
  ['1234567890000000', '1.2B'],
  ['1000000000000000000', '1T'],
  ['9223372036854775807', '9.2T'],
  ['-1', '-1'],
  ['-1234567890', '-1.3K'],
])(
  'formats scaled stock %s as %s without rounding balances up',
  (value, expected) => {
    expect(formatCompactResource(value)).toBe(expected)
    expect(formatCompactResource(BigInt(value))).toBe(expected)
  },
)

it.each([
  ['0', '0'],
  ['1', '1'],
  ['648000000', '648'],
  ['999000001', '1K'],
  ['1600000000', '1.6K'],
  ['1620000000', '1.7K'],
  ['299273000000', '300K'],
  ['999001000000', '1M'],
  ['4371823000000', '4.4M'],
  ['10929557000000', '11M'],
  ['9223372036854775807', '9.3T'],
])('rounds scaled upgrade cost %s up to %s', (value, expected) => {
  expect(formatCompactCost(value)).toBe(expected)
})
