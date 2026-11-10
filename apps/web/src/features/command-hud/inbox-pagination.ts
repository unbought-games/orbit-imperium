export const inboxBatchSize = 20
export type InboxPageContext = {
  visible: boolean
  changingVisibility: boolean
  targetCount: number
  hasMore: boolean
}
/** The sole stored values are the user's display limit and outstanding page intent. */
export function createInboxPagination(options: {
  context: () => InboxPageContext
  request: () => Promise<unknown>
}) {
  let snapshot = { limit: inboxBatchSize, pageIntent: null as number | null }
  let generation = 0
  const listeners = new Set<() => void>()
  function publish(next: typeof snapshot) {
    snapshot = next
    for (const listener of listeners) listener()
  }
  async function loadTo(nextLimit: number) {
    const context = options.context()
    if (
      !context.visible ||
      context.changingVisibility ||
      nextLimit <= snapshot.limit ||
      snapshot.pageIntent !== null
    )
      return
    if (nextLimit <= context.targetCount || !context.hasMore) {
      publish({ limit: Math.max(snapshot.limit, nextLimit), pageIntent: null })
      return
    }
    const current = ++generation
    publish({ ...snapshot, pageIntent: nextLimit })
    try {
      await options.request()
      if (current === generation)
        publish({
          limit: Math.max(snapshot.limit, nextLimit),
          pageIntent: null,
        })
    } catch {
      // The shared report request owns the error/retry message.
      if (current === generation) publish({ ...snapshot, pageIntent: null })
    }
  }
  return {
    snapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    loadMore: () => loadTo(snapshot.limit + inboxBatchSize),
    observation() {
      const nextLimit = snapshot.limit + inboxBatchSize
      let active = true
      return {
        intersect: () => (active ? loadTo(nextLimit) : Promise.resolve()),
        disconnect() {
          active = false
        },
      }
    },
    cancel() {
      generation++
      if (snapshot.pageIntent !== null)
        publish({ ...snapshot, pageIntent: null })
    },
  }
}
