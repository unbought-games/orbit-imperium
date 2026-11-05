import type { GameState } from './game-store'
import { incompatibleResponseMessage } from './contract-error'

/** Keep transport failures separate from data freshness and server throttling. */
export function connectionStatus(state: GameState) {
  if (!state.foreground) return null
  if (state.incompatibleSchema)
    return {
      kind: 'incompatible' as const,
      message: incompatibleResponseMessage,
      announcement: incompatibleResponseMessage,
    }
  const seconds = Math.max(0, Math.ceil((state.retryAt - state.now) / 1000))
  const cooldown = state.rateLimited && seconds > 0
  const paused =
    'Orders are coming in too fast. Wait for the countdown, then try again.'
  const interrupted = state.online
    ? 'Unable to refresh your empire. Showing the last confirmed state. Reconnecting…'
    : 'You’re offline. Showing the last confirmed state. Reconnecting when your network returns.'
  const checking = 'Cooldown over. Refreshing your empire…'
  const wait = `Orders are coming in too fast. Try again in ${seconds} ${seconds === 1 ? 'second' : 'seconds'}.`
  if (!state.online || state.connectionInterrupted)
    return {
      kind: 'connection' as const,
      message: `${interrupted}${cooldown ? ` ${wait}` : ''}`,
      announcement: `${interrupted}${cooldown ? ` ${paused}` : ''}`,
    }
  if (cooldown)
    return {
      kind: 'cooldown' as const,
      message: wait,
      announcement: paused,
    }
  if (state.rateLimited && state.stale)
    return {
      kind: 'checking' as const,
      message: checking,
      announcement: checking,
    }
  return null
}
