import { expect, it } from 'vitest'
import { elapsedProgress } from './overview-progress'
it('derives bounded estimated progress without inventing a duration', () => {
  expect(elapsedProgress(100, 200, 150)).toBe(50)
  expect(elapsedProgress(100, 200, 90)).toBe(0)
  expect(elapsedProgress(100, 200, 220)).toBe(100)
  expect(elapsedProgress(100, 100, 200)).toBeNull()
  expect(elapsedProgress(NaN, 200, 150)).toBeNull()
})
