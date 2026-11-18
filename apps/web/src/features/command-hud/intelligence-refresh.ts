import type { StoreApi } from 'zustand/vanilla'
import type { GameState } from '../../client-model/game-store'
import { reportRequestScope } from '../../client-model/report-engine'

export function watchIntelligenceScope(
  store: StoreApi<GameState>,
  refresh: () => void,
) {
  let scope = reportRequestScope(store.getState())
  return store.subscribe((next, previous) => {
    // Resume can publish the new revision before clearing the stale flag.
    if (!next.ready || next.stale) return
    const nextScope = reportRequestScope(next)
    if (previous.ready && !previous.stale && scope === nextScope) return
    scope = nextScope
    refresh()
  })
}

/** Coalesces wake/retry events; stale or disposed responses cannot update the HUD. */
export function createIntelligenceRefresh(options: {
  available: () => boolean
  reports: () => Promise<unknown>
  mailbox: () => Promise<unknown>
  onMailboxError: (message: string) => void
}) {
  let active = true
  let busy = false
  let again = false
  async function refresh(): Promise<void> {
    if (!active || !options.available()) return
    if (busy) {
      again = true
      return
    }
    busy = true
    const results = await Promise.allSettled([
      options.reports(),
      options.mailbox(),
    ])
    if (active)
      options.onMailboxError(
        results[1].status === 'rejected'
          ? 'Some intelligence is unavailable. Try again.'
          : '',
      )
    busy = false
    if (again && active) {
      again = false
      await refresh()
    }
  }
  return {
    refresh,
    dispose() {
      active = false
      again = false
    },
  }
}
