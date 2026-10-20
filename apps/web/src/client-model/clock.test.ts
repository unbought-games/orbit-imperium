import { it, expect } from 'vitest'
import { remaining } from './clock'
it('uses monotonic elapsed time and awaits server confirmation at zero', () => {
  expect(remaining(12000, 1000, 50, 150)).toBe(11)
  expect(remaining(1000, 1000, 50, 50)).toBe(null)
  expect(remaining(1000, 1000, 50, 100000)).toBe(null)
  expect(remaining(12000, 1000, 50, 0)).toBe(11)
})
