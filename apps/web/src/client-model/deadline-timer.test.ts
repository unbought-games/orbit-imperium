import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { atDeadline } from './deadline-timer'
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
})
afterEach(() => vi.useRealTimers())
it('rechecks a sixty-day title deadline without overflow or premature fallback', () => {
  const notify = vi.fn()
  const deadline = 60 * 24 * 60 * 60 * 1000
  atDeadline(deadline, notify)
  vi.advanceTimersByTime(deadline - 1)
  expect(notify).not.toHaveBeenCalled()
  vi.advanceTimersByTime(1)
  expect(notify).toHaveBeenCalledExactlyOnceWith()
  vi.advanceTimersByTime(deadline)
  expect(notify).toHaveBeenCalledTimes(1)
})
it('cancels a rescheduled long deadline when the title changes or unmounts', () => {
  const notify = vi.fn()
  const cancel = atDeadline(5_000_000_000, notify)
  vi.advanceTimersByTime(2_147_483_647)
  cancel()
  vi.advanceTimersByTime(5_000_000_000)
  expect(notify).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})
it('reschedules after a backward wall-clock change', () => {
  const notify = vi.fn()
  atDeadline(1000, notify)
  vi.setSystemTime(-1000)
  vi.advanceTimersByTime(1000)
  expect(notify).not.toHaveBeenCalled()
  vi.advanceTimersByTime(1000)
  expect(notify).toHaveBeenCalledTimes(1)
})
it('notifies once for an already elapsed deadline', () => {
  const notify = vi.fn()
  atDeadline(-1, notify)
  vi.advanceTimersByTime(0)
  expect(notify).toHaveBeenCalledTimes(1)
})
