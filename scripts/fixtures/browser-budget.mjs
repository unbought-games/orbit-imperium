// Reserve time for Playwright to close browsers before the harness deadline.
export function browserTimeout(seconds, deadlineMs, now = Date.now()) {
  const remaining = deadlineMs === undefined
    ? seconds * 1000
    : Math.min(seconds * 1000, Number(deadlineMs) - now)
  const timeout = Math.floor(remaining - 2000)
  if (!Number.isFinite(timeout) || timeout < 1) {
    throw new Error('Browser budget exhausted during harness setup')
  }
  return timeout
}
