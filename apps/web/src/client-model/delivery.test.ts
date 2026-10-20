import { afterEach, expect, it, vi } from 'vitest'
import { startGameDelivery } from './delivery'
import { readyFixture } from '../test-support/bootstrap'
import type { GameUpdatesPort } from './commands'

afterEach(() => vi.useRealTimers())
const binding = readyFixture(4).snapshot.candidate.binding
const platform = {
  newId: () => crypto.randomUUID(),
  monotonicNowMs: () => Date.now(),
  isOnline: () => true,
  random: () => 0,
  scheduleOnce: (callback: () => void, delay: number) => {
    const timer = setTimeout(callback, delay)
    return () => clearTimeout(timer)
  },
}
it('healthy streams use local ticks and a 30–60 second idle reconciliation, then cancel on disposal', async () => {
  vi.useFakeTimers()
  let options!: Parameters<GameUpdatesPort['subscribe']>[2]
  const updates: GameUpdatesPort = {
    async subscribe(_, __, o) {
      options = o
      await new Promise<void>((resolve) =>
        o.signal.addEventListener('abort', () => resolve(), { once: true }),
      )
    },
  }
  const reconcile = vi.fn(async () => {}),
    onUpdate = vi.fn(async () => {})
  const delivery = startGameDelivery({
    binding,
    platform,
    updates,
    reconcile,
    onUpdate,
    hasPending: () => true,
    isCurrent: () => true,
  })
  await options.onUpdate({ binding, cursor: 'one', event: { type: 'Reset' } })
  delivery.pending()
  await vi.advanceTimersByTimeAsync(2000)
  expect(reconcile).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(28000)
  expect(reconcile).toHaveBeenCalledTimes(1)
  delivery.wake()
  await vi.advanceTimersByTimeAsync(0)
  expect(reconcile).toHaveBeenCalledTimes(2)
  delivery.stop()
  expect(options.signal.aborted).toBe(true)
  await vi.advanceTimersByTimeAsync(60000)
  expect(reconcile).toHaveBeenCalledTimes(2)
})
it('reconnects from the applied cursor and quietly reconciles while an old endpoint is unavailable', async () => {
  vi.useFakeTimers()
  const cursors: (string | null)[] = []
  const updates: GameUpdatesPort = {
    async subscribe(_, after, options) {
      cursors.push(after)
      if (cursors.length === 1) {
        await options.onUpdate({
          binding,
          cursor: 'applied',
          event: { type: 'Reset' },
        })
        options.onDisconnect()
        throw { status: 404 }
      }
      await new Promise<void>((resolve) =>
        options.signal.addEventListener('abort', () => resolve(), {
          once: true,
        }),
      )
    },
  }
  let pending = true
  const reconcile = vi.fn(async () => {
    pending = false
  })
  const delivery = startGameDelivery({
    binding,
    platform,
    updates,
    reconcile,
    onUpdate: async () => {},
    hasPending: () => pending,
    isCurrent: () => true,
  })
  await vi.advanceTimersByTimeAsync(2000)
  expect(reconcile).toHaveBeenCalledTimes(1)
  expect(cursors).toEqual([null])
  await vi.advanceTimersByTimeAsync(60000)
  expect(cursors).toEqual([null, 'applied'])
  delivery.stop()
})

it('does not lose a foreground refresh requested during an existing reconciliation', async () => {
  vi.useFakeTimers()
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const reconcile = vi.fn(async () => {
    if (reconcile.mock.calls.length === 1) await gate
  })
  const delivery = startGameDelivery({
    binding,
    platform,
    reconcile,
    onUpdate: async () => {},
    hasPending: () => false,
    isCurrent: () => true,
  })
  await vi.advanceTimersByTimeAsync(0)
  delivery.wake()
  release()
  await vi.advanceTimersByTimeAsync(1)
  expect(reconcile).toHaveBeenCalledTimes(2)
  delivery.stop()
})

it('retries an unmet snapshot revision promptly even with a healthy stream', async () => {
  vi.useFakeTimers()
  let options!: Parameters<GameUpdatesPort['subscribe']>[2]
  let needsSnapshot = true
  const reconcile = vi.fn(async () => {
    needsSnapshot = false
  })
  const delivery = startGameDelivery({
    binding,
    platform,
    reconcile,
    onUpdate: async () => {},
    hasPending: () => false,
    needsSnapshot: () => needsSnapshot,
    isCurrent: () => true,
    updates: {
      async subscribe(_, __, o) {
        options = o
        await new Promise<void>((resolve) =>
          o.signal.addEventListener('abort', () => resolve(), { once: true }),
        )
      },
    },
  })
  await options.onUpdate({
    binding,
    cursor: 'one',
    event: { type: 'Invalidate', minimum_viewer_revision: '5' },
  })
  await vi.advanceTimersByTimeAsync(1000)
  expect(reconcile).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(2000)
  expect(reconcile).toHaveBeenCalledTimes(1)
  delivery.stop()
})
