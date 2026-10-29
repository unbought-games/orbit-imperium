import { expect, it } from 'vitest'
import { bootstrapFixture } from '../../test-support/bootstrap'
import { createGameStore } from '../../client-model/game-store'
import { createReturnRefresh, returnRefreshDelayMs } from './return-refresh'

function fixture() {
  let now = 0
  const tracker = createReturnRefresh(() => now)
  const { result } = bootstrapFixture(4)
  if (result.status !== 'authenticated' || result.game.status !== 'ready')
    throw Error('Fixture not ready')
  const state = {
    ...createGameStore().getState(),
    ready: true,
    view: result.game.snapshot.view,
    binding: result.game.snapshot.view.binding,
  }
  return {
    tracker,
    state,
    advance: (ms: number) => {
      now += ms
    },
  }
}
it('requires five minutes away and a successful foreground snapshot, even at the same revision', () => {
  const { tracker, state, advance } = fixture()
  expect(tracker.observe(state)).toEqual([])
  tracker.visibility(true, state)
  advance(returnRefreshDelayMs - 1)
  tracker.visibility(false, state)
  expect(tracker.observe({ ...state, view: { ...state.view! } })).toEqual([])
  tracker.visibility(true, state)
  advance(returnRefreshDelayMs)
  const background = { ...state, view: { ...state.view! } }
  expect(tracker.observe(background)).toEqual([])
  tracker.visibility(false, background)
  tracker.visibility(false, background) // Duplicate focus/visibility events.
  expect(tracker.observe({ ...background, now: 999 })).toEqual([])
  const fresh = { ...background, view: { ...background.view! } }
  expect(tracker.observe(fresh)).toEqual([
    { id: 'return-refresh:1', kind: 'updated' },
  ])
  expect(tracker.observe({ ...fresh, view: { ...fresh.view! } })).toEqual([])
})
it('waits through failure and the snapshot/stale recovery updates', () => {
  const { tracker, state, advance } = fixture()
  tracker.visibility(true, state)
  advance(returnRefreshDelayMs)
  tracker.visibility(false, state)
  expect(tracker.observe({ ...state, stale: true })).toEqual([])
  const fresh = { ...state, view: { ...state.view! } }
  expect(tracker.observe({ ...fresh, stale: true })).toEqual([])
  expect(tracker.observe(fresh)).toHaveLength(1)
})
it('uses wall time across sleep, keeps the first hidden timestamp, and cancels on another hide or session loss', () => {
  const { tracker, state, advance } = fixture()
  tracker.visibility(true, state)
  advance(returnRefreshDelayMs)
  tracker.visibility(true, state)
  tracker.visibility(false, state)
  expect(tracker.observe({ ...state, view: { ...state.view! } })).toHaveLength(
    1,
  )
  tracker.visibility(true, state)
  advance(returnRefreshDelayMs)
  tracker.visibility(false, state)
  tracker.visibility(true, state)
  tracker.visibility(false, state)
  expect(tracker.observe({ ...state, view: { ...state.view! } })).toEqual([])
  tracker.visibility(true, state)
  advance(returnRefreshDelayMs)
  tracker.visibility(false, state)
  expect(tracker.observe({ ...state, accessLost: true })).toEqual([])
  expect(tracker.observe({ ...state, view: { ...state.view! } })).toEqual([])
})
