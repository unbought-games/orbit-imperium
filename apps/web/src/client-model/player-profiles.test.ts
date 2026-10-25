import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PlayerProfilesController, currentPlayer } from './player-profiles'
import type { PlayerProfiles } from '../adapters/player-profiles'
const binding = { account: 'a', player: 'self', universe: 'u', epoch: 'e' }
const result = (tier?: 1 | 2 | 3, at = 100): PlayerProfiles => ({
  binding,
  request_id: 'request',
  players: [
    {
      player: 'other',
      username: 'Commander',
      observed_at: at,
      expires_at: at + 60,
      ...(tier ? { supporter_tier: tier } : {}),
    },
  ],
})
let cleanup: (() => void)[] = []
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(100_000)
  vi.stubGlobal(
    'document',
    Object.assign(new EventTarget(), { visibilityState: 'visible' }),
  )
  vi.stubGlobal('window', new EventTarget())
})
afterEach(() => {
  cleanup.reverse().forEach((fn) => fn())
  cleanup = []
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
function start(api: ConstructorParameters<typeof PlayerProfilesController>[0]) {
  const c = new PlayerProfilesController(api)
  cleanup.push(c.start(), c.watch({ type: 'Incoming' }))
  return c
}
it('shares a source request, refreshes changed tiers and clears removed support', async () => {
  const api = vi
    .fn()
    .mockResolvedValueOnce(result(1))
    .mockResolvedValueOnce(result(3, 160))
    .mockResolvedValueOnce(result(undefined, 220))
  const c = start(api)
  cleanup.push(c.watch({ type: 'Incoming' }))
  await vi.advanceTimersByTimeAsync(0)
  expect(api).toHaveBeenCalledTimes(1)
  expect(currentPlayer(c.store.getState(), 'other')?.supporter_tier).toBe(1)
  await vi.advanceTimersByTimeAsync(60_000)
  expect(currentPlayer(c.store.getState(), 'other')?.supporter_tier).toBe(3)
  await vi.advanceTimersByTimeAsync(60_000)
  expect(
    currentPlayer(c.store.getState(), 'other')?.supporter_tier,
  ).toBeUndefined()
  expect(currentPlayer(c.store.getState(), 'other')?.username).toBe('Commander')
})
it('expires at the exact deadline even during an outage', async () => {
  const response = result(2)
  response.players[0].expires_at = 115
  const c = start(
    vi.fn().mockResolvedValueOnce(response).mockRejectedValue(Error('offline')),
  )
  await vi.advanceTimersByTimeAsync(14_999)
  expect(currentPlayer(c.store.getState(), 'other')?.supporter_tier).toBe(2)
  await vi.advanceTimersByTimeAsync(1)
  expect(currentPlayer(c.store.getState(), 'other')).toBeUndefined()
})
it('does not overwrite a fresh public profile with an older or fallback observation', async () => {
  const c = start(async () => result(3))
  await vi.advanceTimersByTimeAsync(0)
  const old = result(undefined, 0)
  old.players[0].expires_at = 160
  const api = vi.fn().mockResolvedValueOnce(result(3)).mockResolvedValue(old)
  const other = start(api)
  await vi.advanceTimersByTimeAsync(0)
  cleanup.push(other.watch({ type: 'Galaxy', galaxy: 1, system: 1 }))
  await vi.advanceTimersByTimeAsync(0)
  expect(currentPlayer(other.store.getState(), 'other')?.supporter_tier).toBe(3)
  expect(currentPlayer(c.store.getState(), 'other')?.supporter_tier).toBe(3)
})
it('fences old responses on navigation and session disposal', async () => {
  let finish!: (response: PlayerProfiles) => void
  const c = new PlayerProfilesController(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const stop = c.start()
  const release = c.watch({ type: 'Report', report: 'report' })
  release()
  stop()
  finish(result(3))
  await vi.advanceTimersByTimeAsync(0)
  expect(c.store.getState().players).toEqual({})
})
it('refreshes on page restoration and releases timers on stop', async () => {
  const api = vi.fn().mockResolvedValue(result(2))
  const c = start(api)
  await vi.advanceTimersByTimeAsync(0)
  window.dispatchEvent(new Event('pageshow'))
  await vi.advanceTimersByTimeAsync(0)
  expect(api).toHaveBeenCalledTimes(2)
  cleanup.reverse().forEach((fn) => fn())
  cleanup = []
  await vi.advanceTimersByTimeAsync(120_000)
  expect(api).toHaveBeenCalledTimes(2)
  expect(c.store.getState().players).toEqual({})
})

it('refreshes affiliation after social changes and fences older in-flight responses', async () => {
  const old = result(1)
  old.players[0].alliance = {
    id: 'old',
    universe: 'u',
    tag: 'OLD',
    name: 'Old alliance',
  }
  let finishOld!: (value: PlayerProfiles) => void
  const signals: AbortSignal[] = []
  let calls = 0
  const c = start((_source, signal) => {
    signals.push(signal)
    calls++
    if (calls === 1) return Promise.resolve(old)
    if (calls === 2)
      return new Promise((resolve) => {
        finishOld = resolve
      })
    return Promise.resolve(result(1))
  })
  await vi.advanceTimersByTimeAsync(0)
  expect(currentPlayer(c.store.getState(), 'other')?.alliance?.tag).toBe('OLD')
  cleanup.push(c.watch({ type: 'Rankings', players: ['other'] }))
  c.refreshAll()
  expect(signals[1].aborted).toBe(true)
  expect(currentPlayer(c.store.getState(), 'other')).toBeUndefined()
  await vi.advanceTimersByTimeAsync(0)
  expect(currentPlayer(c.store.getState(), 'other')?.username).toBe('Commander')
  expect(currentPlayer(c.store.getState(), 'other')?.alliance).toBeUndefined()
  finishOld(old)
  await vi.advanceTimersByTimeAsync(0)
  expect(currentPlayer(c.store.getState(), 'other')?.alliance).toBeUndefined()
})
