import type { GameState } from './game-store'

/** Keep transport failures separate from data freshness and server throttling. */
export function connectionStatus(state: GameState) {
  const seconds = Math.max(0, Math.ceil((state.retryAt - state.now) / 1000))
  const cooldown = state.rateLimited && seconds > 0
  const wait = `Action limit reached. Try again in ${seconds}s. Saved actions will be checked automatically.`
  if (state.connectionInterrupted || (state.stale && !state.rateLimited))
    return {
      kind: 'connection' as const,
      label: 'Disconnected',
      signal: 'CONNECTION INTERRUPTED',
      message: `Connection interrupted — awaiting server confirmation.${cooldown ? ` ${wait}` : ''}`,
    }
  if (cooldown)
    return {
      kind: 'cooldown' as const,
      label: `Action cooldown · ${seconds}s`,
      signal: 'ACTION COOLDOWN',
      message: wait,
    }
  if (state.rateLimited && state.stale)
    return {
      kind: 'checking' as const,
      label: 'Checking saved actions',
      signal: 'CHECKING SAVED ACTIONS',
      message:
        'Cooldown ended. Checking saved actions and refreshing game data.',
    }
  return null
}
