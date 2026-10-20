import { expect, it } from 'vitest'
import { detectionPercent } from './detection'
it('formats exact ppm without claiming rounded endpoints are certain', () => {
  expect(detectionPercent(0)).toBe('0.00%')
  expect(detectionPercent(1)).toBe('<0.01%')
  expect(detectionPercent(53584)).toBe('5.36%')
  expect(detectionPercent(999999)).toBe('>99.99%')
  expect(detectionPercent(1000000)).toBe('100.00%')
})
