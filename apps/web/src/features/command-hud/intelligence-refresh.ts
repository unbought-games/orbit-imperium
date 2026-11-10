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
