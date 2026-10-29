import type { GameState } from './game-store'

/** Keep transport failures separate from data freshness and server throttling. */
export function connectionStatus(state: GameState) {
  const seconds = Math.max(0, Math.ceil((state.retryAt - state.now) / 1000))
  const cooldown = state.rateLimited && seconds > 0
  const paused =
    'Orders are coming in too fast. Wait for the countdown, then try again.'
  const interrupted = 'Connection lost. Reconnecting…'
  const checking = 'Cooldown over. Refreshing your empire…'
  const wait = `Orders are coming in too fast. Try again in ${seconds} ${seconds === 1 ? 'second' : 'seconds'}.`
  if (state.connectionInterrupted || (state.stale && !state.rateLimited))
    return {
      kind: 'connection' as const,
      label: 'Disconnected',
      signal: 'CONNECTION LOST',
      message: `${interrupted}${cooldown ? ` ${wait}` : ''}`,
      announcement: `${interrupted}${cooldown ? ` ${paused}` : ''}`,
    }
  if (cooldown)
    return {
      kind: 'cooldown' as const,
      label: `Try again in ${seconds}s`,
      signal: 'TOO MANY ORDERS',
      message: wait,
      announcement: paused,
    }
  if (state.rateLimited && state.stale)
    return {
      kind: 'checking' as const,
      label: 'Refreshing your empire',
      signal: 'REFRESHING YOUR EMPIRE',
      message: checking,
      announcement: checking,
    }
  return null
}
