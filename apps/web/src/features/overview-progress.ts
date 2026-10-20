/** Estimated progress only; reaching the deadline never confirms completion. */
export function elapsedProgress(
  start: number,
  due: number,
  now: number,
): number | null {
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(due) ||
    !Number.isFinite(now) ||
    due <= start
  )
    return null
  return Math.max(0, Math.min(100, ((now - start) / (due - start)) * 100))
}
