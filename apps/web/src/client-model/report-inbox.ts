import type { BoundReports } from './commands'
import type { ReportPage } from './report-state'

/** Query membership from one server revision. */
export type ReportInbox = ReportPage & {
  revision: string
  firstPage?: {
    resumedAt: number | null
    requestedAt: number
    receivedAt: number
    sampledAt: number
  }
}
/** Suppress reports only when they demonstrably predate the return. The HTTP
 * server sampled its clock between request and receipt. If the intervals
 * overlap, both samples constrain the earliest possible return. If the
 * monotonic clock stopped during sleep, use the new sample alone. */
export function reportResumeCutoff(
  previous: ReportInbox,
  current: ReportInbox,
) {
  const before = previous.firstPage
  const after = current.firstPage
  if (
    !before ||
    !after ||
    after.resumedAt === null ||
    before.resumedAt === after.resumedAt
  )
    return null
  const priorLower = before.sampledAt - before.receivedAt
  const priorUpper = before.sampledAt - before.requestedAt
  const lower = after.sampledAt - after.receivedAt
  const upper = after.sampledAt - after.requestedAt
  const compatible = priorLower <= upper && lower <= priorUpper
  return after.resumedAt + (compatible ? Math.max(priorLower, lower) : lower)
}

type Read = (cursor: string | null) => Promise<BoundReports | null>

export function appendInboxPage(
  inbox: ReportInbox | null,
  response: BoundReports,
): ReportInbox {
  const page = response.data
  return {
    ...page,
    // A continuation describes the original cut, even when fetched much later.
    as_of_ms: inbox?.as_of_ms ?? page.as_of_ms,
    arrivals: page.arrivals && {
      through: page.arrivals.through,
      created: { ...inbox?.arrivals?.created, ...page.arrivals.created },
    },
    revision: response.viewer_revision,
    player_names: { ...inbox?.player_names, ...page.player_names },
    items: [
      ...new Set([...(inbox?.items ?? []), ...page.items.map((h) => h.id)]),
    ],
  }
}

/** Replace membership atomically, retaining the amount of history already loaded.
 * Never infer membership from header caches, or publish an incomplete refresh.
 */
export async function readReportInbox(read: Read, minimumItems = 0) {
  let inbox: ReportInbox | null = null
  const cursors = new Set<string>()
  let cursor: string | null = null
  while (true) {
    const response = await read(cursor)
    if (!response) throw new Error('Unable to confirm your reports. Try again.')
    if (inbox && inbox.revision !== response.viewer_revision) {
      // A cursor fixes archive ordering, not recipient preferences. Restart if
      // read/deletion state changed between pages rather than mixing revisions.
      inbox = null
      cursors.clear()
      cursor = null
      continue
    }
    inbox = appendInboxPage(inbox, response)
    if (inbox.has_more && !inbox.next_cursor)
      throw new Error('Report pagination changed. Try again.')
    if (!inbox.has_more || inbox.items.length >= minimumItems) return inbox
    cursor = inbox.next_cursor
    if (!cursor || cursors.has(cursor))
      throw new Error('Report pagination changed. Try again.')
    cursors.add(cursor)
  }
}

export async function extendReportInbox(read: Read, inbox: ReportInbox) {
  if (!inbox.has_more) return inbox
  if (!inbox.next_cursor)
    throw new Error('Report pagination changed. Try again.')
  const response = await read(inbox.next_cursor)
  if (!response) throw new Error('Unable to confirm your reports. Try again.')
  if (response.viewer_revision !== inbox.revision)
    return readReportInbox(read, inbox.items.length + 1)
  if (
    response.data.has_more &&
    (!response.data.next_cursor ||
      response.data.next_cursor === inbox.next_cursor)
  )
    throw new Error('Report pagination changed. Try again.')
  return appendInboxPage(inbox, response)
}
