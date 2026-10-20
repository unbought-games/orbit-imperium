import { expect, it } from 'vitest'
import { formatResource, formatExactResource } from './format'
it('displays whole resources without floating point loss or rounding up stockpiles', () => {
  expect(formatResource('9223372036854775807')).toBe('9,223,372,036,854')
  expect(formatResource('1999999')).toBe('1')
  expect(formatResource('1')).toBe('0')
  expect(formatResource('-1000001')).toBe('-1')
  expect(formatResource('-999999')).toBe('0')
})

it('formats exact micro-units, including negative fractions and huge balances', () => {
  expect(formatExactResource('26400000')).toBe('26.4')
  expect(formatExactResource('-1')).toBe('-0.000001')
  expect(formatExactResource('9007199254740993123456')).toBe(
    '9,007,199,254,740,993.123456',
  )
  expect(formatExactResource('0')).toBe('0')
})
