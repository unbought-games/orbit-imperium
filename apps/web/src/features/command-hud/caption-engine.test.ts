import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  captionPolicy,
  captionRules,
  captionTiming,
  createCaptionEngine,
  type CaptionEventKind,
} from './caption-engine'
beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())
const engine = (random = () => 0) =>
  createCaptionEngine({ now: () => Date.now(), random })
const advance = (ms: number) => vi.advanceTimersByTime(ms)
it('all explanations expire; first-time education is not repeated', () => {
  const e = engine()
  e.handle([{ id: 'boot', kind: 'ready' }])
  expect(e.snapshot()?.text).toBe('Systems Online')
  advance(captionTiming('Systems Online').lifetimeMs)
  expect(e.snapshot()).toBeNull()
  e.handle([{ id: 'mail', kind: 'unread' }])
  expect(e.snapshot()?.category).toBe('explanation')
  advance(6000)
  e.handle([{ id: 'mail-again', kind: 'unread' }])
  expect(e.snapshot()).toBeNull()
  e.handle([{ id: 'lost', kind: 'disconnected' }])
  expect(e.snapshot()?.text).toBe('Connection lost.')
  advance(6000)
  expect(e.snapshot()).toBeNull()
})
it('silence is the default for ordinary reports and unlucky humor rolls', () => {
  const e = engine(() => 0.9)
  e.handle([{ id: 'report', kind: 'report.received' }])
  e.handle([{ id: 'order', kind: 'building.started' }])
  advance(20_000)
  expect(e.snapshot()).toBeNull()
})
it('jokes wait for quiet, have a global cooldown, and never repeat the last line in a pool', () => {
  const e = engine()
  e.handle([{ id: 'one', kind: 'probe.destroyed' }])
  expect(e.snapshot()).toBeNull()
  advance(captionPolicy.quietDelayMs)
  expect(e.snapshot()?.text).toBe('Whoops.')
  advance(6000)
  e.handle([{ id: 'two', kind: 'shipyard.queued' }])
  advance(8000)
  expect(e.snapshot()).toBeNull()
  advance(90_000)
  e.handle([{ id: 'three', kind: 'probe.destroyed' }])
  advance(captionPolicy.quietDelayMs)
  expect(e.snapshot()?.text).toBe('Good thing we sent the bad one.')
})
it('regular events interrupt jokes without waiting for cooldown; duplicates do not replay', () => {
  const e = engine()
  e.handle([{ id: 'one', kind: 'probe.destroyed' }])
  advance(captionPolicy.quietDelayMs)
  e.handle([{ id: 'lost', kind: 'disconnected' }])
  expect(e.snapshot()?.text).toBe('Connection lost.')
  e.handle([{ id: 'restored', kind: 'reconnected' }])
  expect(e.snapshot()?.text).toBe('Connection restored.')
  advance(6000)
  e.handle([{ id: 'one', kind: 'probe.destroyed' }])
  advance(100_000)
  expect(e.snapshot()).toBeNull()
})
it('new activity discards pending punchlines and urgent events suppress humor in the same batch', () => {
  const e = engine()
  e.handle([{ id: 'one', kind: 'probe.destroyed' }])
  advance(1000)
  e.handle([{ id: 'new-report', kind: 'report.received' }])
  advance(10_000)
  expect(e.snapshot()).toBeNull()
  e.handle([
    { id: 'two', kind: 'probe.destroyed' },
    { id: 'attack', kind: 'attack.incoming' },
  ])
  advance(10_000)
  expect(e.snapshot()).toBeNull()
  // The canceled jokes did not spend the cooldown.
  e.handle([{ id: 'three', kind: 'probe.destroyed' }])
  advance(captionPolicy.quietDelayMs)
  expect(e.snapshot()?.text).toBe('Whoops.')
  e.handle([{ id: 'plain', kind: 'report.received' }])
  expect(e.snapshot()).toBeNull()
})
it('suspension cancels timers but retains cooldown and event history', () => {
  const e = engine()
  e.handle([{ id: 'one', kind: 'probe.destroyed' }])
  advance(captionPolicy.quietDelayMs)
  e.suspend()
  e.handle([{ id: 'two', kind: 'probe.destroyed' }])
  advance(10_000)
  expect(e.snapshot()).toBeNull()
})
it('copy fits a narrow mobile caption and every event uses bounded shared timing', () => {
  for (const kind of Object.keys(captionRules) as CaptionEventKind[]) {
    const rule = captionRules[kind] as {
      explanation?: string
      personality?: readonly string[]
      confirmations?: readonly string[]
    }
    for (const text of [
      rule.explanation,
      ...(rule.personality ?? []),
      ...(rule.confirmations ?? []),
    ].filter((line): line is string => !!line)) {
      expect(text.length).toBeLessThanOrEqual(36)
      expect(captionTiming(text).lifetimeMs).toBeLessThanOrEqual(4750)
      expect(captionTiming(text).typingMs).toBeGreaterThanOrEqual(500)
    }
  }
})

it('existing threats can suppress new humor without suppressing explanations', () => {
  const e = engine()
  e.handle([{ id: 'order', kind: 'building.started' }], false)
  advance(10_000)
  expect(e.snapshot()).toBeNull()
  e.handle([{ id: 'offline', kind: 'disconnected' }], false)
  expect(e.snapshot()?.text).toBe('Connection lost.')
})

it('confirms refresh immediately, without a humor roll, and rotates through all 15 lines', () => {
  const e = engine(() => 0.99)
  e.handle([{ id: 'refresh-1', kind: 'updated' }])
  const first = e.snapshot()!
  expect(first.category).toBe('updated')
  expect(captionRules.updated.confirmations).toHaveLength(15)
  expect(
    captionRules.updated.confirmations.map((_, index) => {
      const selection = engine(() => index / 15)
      selection.handle([{ id: 'refresh', kind: 'updated' }])
      return selection.snapshot()?.text
    }),
  ).toEqual(captionRules.updated.confirmations)
  e.handle([{ id: 'refresh-1', kind: 'updated' }])
  expect(e.snapshot()).toBe(first)
  e.handle([{ id: 'refresh-2', kind: 'updated' }])
  expect(e.snapshot()?.text).not.toBe(first.text)
  advance(6000)
  expect(e.snapshot()).toBeNull()
})
it('keeps the refresh confirmation visible through follow-up inbox hydration', () => {
  const e = engine()
  e.handle([{ id: 'refresh', kind: 'updated' }])
  const caption = e.snapshot()
  e.handle([
    { id: 'unread', kind: 'unread' },
    { id: 'mail', kind: 'message.received' },
  ])
  expect(e.snapshot()).toBe(caption)
})
it('uses a factual update around existing threats and lets new threats interrupt confirmation', () => {
  const e = engine(() => 0.9)
  e.handle([{ id: 'refresh-1', kind: 'updated' }], false)
  expect(e.snapshot()?.text).toBe('Updated')
  e.handle([
    { id: 'refresh-2', kind: 'updated' },
    { id: 'attack', kind: 'attack.incoming' },
  ])
  expect(e.snapshot()).toBeNull()
  e.handle([{ id: 'refresh-3', kind: 'updated' }])
  e.handle([{ id: 'lost', kind: 'disconnected' }])
  expect(e.snapshot()?.text).toBe('Connection lost.')
})
