import { expect, it } from 'vitest'
import { formatDuration } from './duration'
import { formatRemaining, remaining } from './clock'

it.each([
  [0, '0s'],
  [0.999, '0s'],
  [18, '18s'],
  [59, '59s'],
  [60, '1m'],
  [97, '1m 37s'],
  [179, '2m 59s'],
  [180, '3m'],
  [181, '3m'],
  [3300, '55m'],
  [3599, '1 hour'],
  [3600, '1 hour'],
  [5820, '1h 37m'],
  [11101, '3h 5m'],
  [14399, '4 hours'],
  [28800, '8 hours'],
  [28837, '8 hours'],
  [86399, '1 day'],
  [86400, '1 day'],
  [97200, '1d 3h'],
  [172799, '2 days'],
  [172800, '2 days'],
  [1140000, '13 days'],
])('formats %s seconds with adaptive precision as %s', (seconds, expected) => {
  expect(formatDuration(seconds * 1000)).toBe(expected)
})

it('handles invalid or negative input without displaying a broken timer', () => {
  expect(formatDuration(-1000)).toBe('0s')
  expect(formatDuration(Infinity)).toBe('Unknown')
  expect(formatDuration(NaN)).toBe('Unknown')
})

it('shares countdown presentation without changing completion or deadline precision', () => {
  expect(formatRemaining(11101)).toBe('3h 5m')
  expect(formatRemaining(97)).toBe('1m 37s')
  expect(formatRemaining(null)).toBe('Awaiting confirmation')
  expect(remaining(11101000, 0, 0, 0)).toBe(11101)
  expect(remaining(11101000, 0, 0, 11101000)).toBeNull()
})
