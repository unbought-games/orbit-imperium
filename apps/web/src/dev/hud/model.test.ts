import { describe, expect, it } from 'vitest'
import { countdown, fleetUsed, hudReducer, hudView, initialHud } from './model'
describe('prototype HUD event lifecycle', () => {
  it('keeps sign-in unread after toasts expire and clears only opened messages', () => {
    const state = initialHud(100000)
    expect(hudView(state, 200000).unread).toHaveLength(3)
    const opened = hudReducer(state, { type: 'open', id: 1 })
    expect(hudView(opened, 200000).unread).toHaveLength(2)
    expect(
      hudView(hudReducer(opened, { type: 'open', id: 'inbox' }), 200000).tone,
    ).toBe('ice')
  })
  it('prioritizes threats over success and unread until explicitly acknowledged', () => {
    let state = initialHud(100000)
    state = hudReducer(state, { type: 'trigger', kind: 'attack', now: 100000 })
    state = hudReducer(state, {
      type: 'trigger',
      kind: 'building',
      now: 100001,
    })
    expect(hudView(state, 100002).tone).toBe('red')
    expect(hudView(state, 200000).tone).toBe('red')
    state = hudReducer(state, { type: 'acknowledge' })
    expect(hudView(state, 100002).tone).toBe('green')
    expect(hudView(state, 200000).tone).toBe('champagne')
  })
  it('stacks the latest three events and expires transient feedback', () => {
    let state = initialHud(0, false)
    for (let i = 0; i < 5; i++)
      state = hudReducer(state, { type: 'trigger', kind: 'research', now: i })
    expect(hudView(state, 5).toasts.map((event) => event.id)).toEqual([5, 4, 3])
    expect(hudView(state, 7004).toasts).toEqual([])
    expect(hudView(state, 7004).tone).toBe('ice')
  })
  it('derives slots from active flights, prevents overbooking, and releases returned probes', () => {
    let state = initialHud(0, false)
    for (let i = 0; i < 10; i++)
      state = hudReducer(state, { type: 'trigger', kind: 'spy', now: 0 })
    expect(fleetUsed(state, 1)).toBe(8)
    expect(state.events).toHaveLength(6)
    expect(fleetUsed(state, 84000)).toBe(2)
    expect(countdown(42000, 1000)).toBe('00:41')
    expect(countdown(0, 1000)).toBe('00:00')
  })
})

it('dismisses only the toast, preserving unread intelligence, threats, and occupied slots', () => {
  let state = initialHud(0, false)
  for (const kind of ['spy', 'report', 'attack'] as const)
    state = hudReducer(state, { type: 'trigger', kind, now: 0 })
  for (const id of [1, 2, 3])
    state = hudReducer(state, { type: 'dismiss-toast', id })
  const view = hudView(state, 1)
  expect(view.toasts).toHaveLength(0)
  expect(view.unread).toHaveLength(1)
  expect(view.threats).toHaveLength(1)
  expect(view.tone).toBe('red')
  expect(view.used).toBe(3)
  expect(state.selectedId).toBeNull()
})

it('does not bring older hidden toasts back when one is dismissed', () => {
  let state = initialHud(0, false)
  for (let i = 0; i < 4; i++)
    state = hudReducer(state, { type: 'trigger', kind: 'report', now: i })
  state = hudReducer(state, { type: 'dismiss-toast', id: 4 })
  expect(hudView(state, 5).toasts.map((event) => event.id)).toEqual([3, 2])
})
