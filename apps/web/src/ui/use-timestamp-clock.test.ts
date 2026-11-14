import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTimestampClock } from './use-timestamp-clock'

afterEach(() => {
  vi.useRealTimers()
})

describe('shared timestamp clock', () => {
  it('samples on the first render and again after an idle period, before subscribing', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-13T20:00:00Z'))
    const clock = createTimestampClock()
    vi.setSystemTime(new Date('2026-11-13T21:00:00Z'))
    expect(clock.snapshot()).toBe(Date.parse('2026-11-13T21:00:00Z'))
    const stop = clock.subscribe(() => {})
    stop()
    vi.setSystemTime(new Date('2026-11-14T08:00:00Z'))
    expect(clock.snapshot()).toBe(Date.parse('2026-11-14T08:00:00Z'))
    // Repeated reads are stable until a source update, as React requires.
    vi.setSystemTime(new Date('2026-11-14T08:00:00.123Z'))
    expect(clock.snapshot()).toBe(Date.parse('2026-11-14T08:00:00Z'))
    const stopAgain = clock.subscribe(() => {})
    stopAgain()
    // System clock corrections must also be respected on remount.
    vi.setSystemTime(new Date('2026-11-13T19:00:00Z'))
    expect(clock.snapshot()).toBe(Date.parse('2026-11-13T19:00:00Z'))
  })

  it('shares one timer and keeps remaining subscribers live until the last leaves', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-13T20:00:00Z'))
    const clock = createTimestampClock()
    const first = vi.fn()
    const second = vi.fn()
    const stopFirst = clock.subscribe(first)
    const stopSecond = clock.subscribe(second)
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(1000)
    expect(clock.snapshot()).toBe(Date.parse('2026-11-13T20:00:01Z'))
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
    stopFirst()
    vi.advanceTimersByTime(1000)
    expect(clock.snapshot()).toBe(Date.parse('2026-11-13T20:00:02Z'))
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(2)
    stopSecond()
    expect(vi.getTimerCount()).toBe(0)
  })
})
