import type { GameState } from '../../client-model/game-store'
import type { CaptionEvent } from './caption-engine'

export const returnRefreshDelayMs = 5 * 60_000

/** Presentation history only: confirm a new accepted snapshot after a long absence. */
export function createReturnRefresh(now = () => Date.now()) {
  let hiddenAt: number | null = null
  let pending: {
    view: GameState['view']
    binding: GameState['binding']
  } | null = null
  let serial = 0
  return {
    visibility(hidden: boolean, state: GameState) {
      if (hidden) {
        hiddenAt ??= now()
        pending = null
      } else if (hiddenAt !== null) {
        if (now() - hiddenAt >= returnRefreshDelayMs && state.ready)
          pending = { view: state.view, binding: state.binding }
        hiddenAt = null
      }
    },
    observe(state: GameState): CaptionEvent[] {
      if (!pending || hiddenAt !== null) return []
      if (
        state.binding !== pending.binding ||
        !state.ready ||
        state.accessLost
      ) {
        pending = null
        return []
      }
      // The revision may be unchanged: fetching the same snapshot still confirms
      // freshness. Ticks, mailbox loads, and unsuccessful refreshes do not.
      if (!state.view || state.view === pending.view || state.stale) return []
      pending = null
      return [{ id: `return-refresh:${++serial}`, kind: 'updated' }]
    },
  }
}
