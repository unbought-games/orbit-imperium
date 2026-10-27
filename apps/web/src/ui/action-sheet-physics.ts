/** Percentages of the available sheet height (viewport minus the top reveal). */
export const DEFAULT_SHEET_STOPS = [12.5, 50, 100] as const
export const SHEET_TOP_REVEAL = 44
export const SHEET_PAINT_EXTENSION = 64
export const SHEET_HANDLE_HEIGHT = 48
export const SHEET_SPRINGS = {
  silky: { stiffness: 360, damping: 38, mass: 1 },
  snappy: { stiffness: 560, damping: 43, mass: 0.85 },
  soft: { stiffness: 220, damping: 29, mass: 1.1 },
} as const
export type SheetSpring = keyof typeof SHEET_SPRINGS
export type SheetMode = 'snap' | 'free'
export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export function sheetStops(points: readonly number[]): number[] {
  if (
    !points.length ||
    points.some((p) => !Number.isFinite(p) || p < 12.5 || p > 100)
  )
    throw new RangeError(
      'Action sheet stops must be between 12.5 and 100 percent',
    )
  return [...new Set(points)].sort((a, b) => a - b)
}

export function sheetHeight(viewportHeight: number) {
  return Math.max(1, viewportHeight - SHEET_TOP_REVEAL)
}
export function sheetPercent(y: number, height: number) {
  return clamp(((height - y) / height) * 100, 0, 100)
}
export function sheetOffset(percent: number, height: number) {
  return height * (1 - percent / 100)
}
export function sheetTarget(
  percent: number,
  points: readonly number[],
  mode: SheetMode,
) {
  const value = clamp(
    Number.isFinite(percent) ? percent : 50,
    points[0],
    points[points.length - 1],
  )
  return mode === 'free'
    ? value
    : points.reduce((a, b) =>
        Math.abs(b - value) < Math.abs(a - value) ? b : a,
      )
}

/** Ported from Sheet Lab's final tuning, including the travel guard and origin-based notch. */
export function sheetRelease({
  current,
  origin,
  velocity,
  travel,
  points,
  mode,
  flick,
}: {
  current: number
  origin: number
  velocity: number
  travel: number
  points: readonly number[]
  mode: SheetMode
  flick: boolean
}): { dismiss: true } | { height: number } {
  if (current < 7 || (flick && velocity >= 1500 && travel >= 36))
    return { dismiss: true }
  if (mode === 'free') return { height: sheetTarget(current, points, mode) }
  let target = sheetTarget(current, points, mode)
  if (Math.abs(velocity) > 250) {
    const candidates = points.filter((p) =>
      velocity < 0 ? p > origin + 2 : p < origin - 2,
    )
    if (candidates.length) {
      const next =
        velocity < 0 ? Math.min(...candidates) : Math.max(...candidates)
      target = velocity < 0 ? Math.max(target, next) : Math.min(target, next)
    }
  }
  return { height: target }
}

export function sheetKeyboardTarget(
  key: string,
  current: number,
  points: readonly number[],
  mode: SheetMode,
) {
  if (key === 'Home') return points[0]
  if (key === 'End') return points[points.length - 1]
  if (key !== 'ArrowUp' && key !== 'ArrowDown') return null
  if (mode === 'free')
    return sheetTarget(current + (key === 'ArrowUp' ? 10 : -10), points, mode)
  const candidates = points.filter((p) =>
    key === 'ArrowUp' ? p > current + 1 : p < current - 1,
  )
  return candidates.length
    ? key === 'ArrowUp'
      ? Math.min(...candidates)
      : Math.max(...candidates)
    : current
}

export function sheetDepth(
  percent: number,
  viewportHeight: number,
  reduced: boolean,
) {
  const progress = clamp(percent / 50, 0, 1)
  return {
    scaleX: reduced ? 1 : 1 - progress * 0.055,
    scaleY: reduced ? 1 : 1 - (progress * 12) / Math.max(1, viewportHeight),
    radius: reduced ? 0 : progress * 22,
    opacity: progress * 0.36,
  }
}
