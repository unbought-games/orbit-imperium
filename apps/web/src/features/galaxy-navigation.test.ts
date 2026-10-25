import { expect, it } from 'vitest'
import { parseGalaxyCoordinate } from './galaxy-navigation'

it('accepts whole coordinates within the actual universe bounds', () => {
  expect(parseGalaxyCoordinate(' 024 ', 420)).toBe(24)
  expect(parseGalaxyCoordinate('1', 3)).toBe(1)
  expect(parseGalaxyCoordinate('3', 3)).toBe(3)
  expect(parseGalaxyCoordinate('420', 420)).toBe(420)
  for (const value of [
    '',
    ' ',
    '0',
    '-1',
    '421',
    '1.5',
    '1e2',
    '0x12',
    'NaN',
    '12abc',
    '9007199254740993',
  ]) {
    expect(parseGalaxyCoordinate(value, 420)).toBeNull()
  }
})
