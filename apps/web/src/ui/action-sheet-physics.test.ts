import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SHEET_STOPS,
  sheetDepth,
  sheetHeight,
  sheetKeyboardTarget,
  sheetOffset,
  sheetPercent,
  sheetRelease,
  sheetStops,
  sheetTarget,
} from './action-sheet-physics'
const release = (overrides: Partial<Parameters<typeof sheetRelease>[0]> = {}) =>
  sheetRelease({
    current: 94,
    origin: 100,
    velocity: 1000,
    travel: 50,
    points: DEFAULT_SHEET_STOPS,
    mode: 'snap',
    flick: true,
    ...overrides,
  })

describe('Sheet Lab gesture refinements', () => {
  it('gentle flicks move down one stop; the smallest stop stays open', () => {
    expect(release()).toEqual({ height: 50 })
    expect(release({ origin: 50, current: 44, velocity: 1200 })).toEqual({
      height: 12.5,
    })
    expect(release({ origin: 12.5, current: 10, travel: 20 })).toEqual({
      height: 12.5,
    })
  })
  it('dismisses only with both deliberate downward speed and travel', () => {
    expect(release({ velocity: 1500, travel: 36 })).toEqual({ dismiss: true })
    expect(release({ velocity: 2000, travel: 8 })).toEqual({ height: 50 })
    expect(release({ velocity: 1499, travel: 100 })).toEqual({ height: 50 })
    expect(release({ velocity: 1600, travel: 45, flick: false })).toEqual({
      height: 50,
    })
    expect(release({ velocity: -1800, travel: -50 })).toEqual({ height: 100 })
  })
  it('crossing a notch does not skip it and added stops participate', () => {
    expect(release({ current: 49, travel: 420, velocity: 600 })).toEqual({
      height: 50,
    })
    expect(release({ current: 79, points: [12.5, 50, 80, 100] })).toEqual({
      height: 80,
    })
    expect(
      release({
        origin: 50,
        current: 51,
        velocity: -500,
        points: [12.5, 50, 80, 100],
      }),
    ).toEqual({ height: 80 })
  })
  it('slow drags find the nearest stop; freeform retains release height', () => {
    expect(release({ current: 78, velocity: 80 })).toEqual({ height: 100 })
    expect(release({ current: 67, mode: 'free' })).toEqual({ height: 67 })
    expect(release({ current: 5, velocity: 80, flick: false })).toEqual({
      dismiss: true,
    })
    expect(release({ current: 110, mode: 'free', velocity: 0 })).toEqual({
      height: 100,
    })
  })
})

it('validates and normalizes configurable stops without changing caller data', () => {
  const points = [80, 12.5, 35, 35]
  expect(sheetStops(points)).toEqual([12.5, 35, 80])
  expect(points).toEqual([80, 12.5, 35, 35])
  for (const invalid of [[], [0], [101], [NaN], [Infinity]])
    expect(() => sheetStops(invalid)).toThrow(RangeError)
  expect(sheetTarget(50, [12.5, 35, 80], 'snap')).toBe(35)
  expect(sheetTarget(95, [12.5, 35, 80], 'free')).toBe(80)
})
it('keyboard navigation respects configured bounds and freeform increments', () => {
  const points = [12.5, 35, 80]
  expect(sheetKeyboardTarget('Home', 35, points, 'snap')).toBe(12.5)
  expect(sheetKeyboardTarget('End', 35, points, 'snap')).toBe(80)
  expect(sheetKeyboardTarget('ArrowUp', 35, points, 'snap')).toBe(80)
  expect(sheetKeyboardTarget('ArrowDown', 35, points, 'snap')).toBe(12.5)
  expect(sheetKeyboardTarget('ArrowDown', 12.5, points, 'snap')).toBe(12.5)
  expect(sheetKeyboardTarget('ArrowUp', 45, points, 'free')).toBe(55)
  expect(sheetKeyboardTarget('Tab', 35, points, 'snap')).toBeNull()
})
it('keeps a 32px reveal of the recessed page, with its bottom anchored', () => {
  for (const viewport of [844, 667, 350]) {
    const height = sheetHeight(viewport)
    expect(viewport - height).toBe(44)
    const depth = sheetDepth(100, viewport, false)
    expect(viewport * (1 - depth.scaleY)).toBeCloseTo(12)
    expect(44 - viewport * (1 - depth.scaleY)).toBeCloseTo(32)
    expect(sheetPercent(sheetOffset(50, height), height)).toBe(50)
    expect(sheetDepth(100, viewport, true)).toEqual({
      scaleX: 1,
      scaleY: 1,
      radius: 0,
      opacity: 0.36,
    })
  }
})
