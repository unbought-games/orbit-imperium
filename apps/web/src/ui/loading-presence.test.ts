import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { LoadingPresence } from './loading-presence'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

it('never flashes an indicator for a request that completes before 200ms', () => {
  const presence = new LoadingPresence()
  const notify = vi.fn()
  presence.subscribe(notify)
  presence.update(true)
  vi.advanceTimersByTime(199)
  presence.update(false)
  vi.runAllTimers()
  expect(presence.snapshot()).toBe(false)
  expect(notify).not.toHaveBeenCalled()
})

it('keeps a revealed indicator visible for 500ms after its reveal', () => {
  const presence = new LoadingPresence()
  presence.update(true)
  vi.advanceTimersByTime(200)
  expect(presence.snapshot()).toBe(true)
  vi.advanceTimersByTime(100)
  presence.update(false)
  vi.advanceTimersByTime(399)
  expect(presence.snapshot()).toBe(true)
  vi.advanceTimersByTime(1)
  expect(presence.snapshot()).toBe(false)
})

it('reveals results immediately when a long request finishes', () => {
  const presence = new LoadingPresence()
  presence.update(true)
  vi.advanceTimersByTime(1000)
  presence.update(false)
  expect(presence.snapshot()).toBe(false)
  expect(vi.getTimerCount()).toBe(0)
})

it('keeps feedback continuous when another request starts during the minimum hold', () => {
  const presence = new LoadingPresence()
  presence.update(true)
  vi.advanceTimersByTime(200)
  presence.update(false)
  vi.advanceTimersByTime(100)
  presence.update(true)
  vi.advanceTimersByTime(1000)
  expect(presence.snapshot()).toBe(true)
  presence.update(false)
  expect(presence.snapshot()).toBe(false)
})

it('cancels pending updates on unmount and supports effect reactivation', () => {
  const presence = new LoadingPresence()
  const notify = vi.fn()
  const unsubscribe = presence.subscribe(notify)
  presence.update(true)
  presence.cancel()
  vi.advanceTimersByTime(1000)
  expect(notify).not.toHaveBeenCalled()
  presence.update(true)
  vi.advanceTimersByTime(200)
  expect(presence.snapshot()).toBe(true)
  presence.update(false)
  presence.cancel()
  unsubscribe()
  expect(vi.getTimerCount()).toBe(0)
})
