import { expect, it } from 'vitest'
import { createGameStore } from './game-store'
import { connectionStatus } from './connection-status'

it('does not infer service loss from stale usable data, hidden tabs, or snapshot catch-up', () => {
  const state = createGameStore().getState()
  expect(connectionStatus({ ...state, stale: true })).toBeNull()
  expect(
    connectionStatus({
      ...state,
      foreground: false,
      online: false,
      connectionInterrupted: true,
    }),
  ).toBeNull()
  expect(
    connectionStatus({ ...state, stale: true, incompatibleSchema: 'GameView' })
      ?.kind,
  ).toBe('incompatible')
  expect(
    connectionStatus({
      ...state,
      stale: true,
      rateLimited: true,
      retryAt: 5000,
    })?.kind,
  ).toBe('cooldown')
  expect(
    connectionStatus({
      ...state,
      stale: true,
      rateLimited: true,
      retryAt: 5000,
      now: 5000,
    })?.kind,
  ).toBe('checking')
  expect(connectionStatus({ ...state, online: false })?.message).toContain(
    'You’re offline.',
  )
  expect(
    connectionStatus({ ...state, connectionInterrupted: true })?.message,
  ).toContain('last confirmed state')
})
