import type { BoundReports } from './commands'
import type { ReportPage } from './report-state'

/** Membership from one server revision; cached details are not inbox members. */
export type ReportInbox = ReportPage & { revision: string }
type Read = (cursor: string | null) => Promise<BoundReports | null>

export function appendInboxPage(
  inbox: ReportInbox | null,
  response: BoundReports,
): ReportInbox {
  const page = response.data
  return {
    ...page,
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
  const unread = new Set<string>()
  const cursors = new Set<string>()
  let cursor: string | null = null
  while (true) {
    const response = await read(cursor)
    if (!response) throw new Error('Unable to confirm your reports. Try again.')
    if (inbox && inbox.revision !== response.viewer_revision) {
      // A cursor fixes archive ordering, not recipient preferences. Restart if
      // read/deletion state changed between pages rather than mixing revisions.
      inbox = null
      unread.clear()
      cursors.clear()
      cursor = null
      continue
    }
    inbox = appendInboxPage(inbox, response)
    for (const header of response.data.items) {
      if (header.hidden || header.read) unread.delete(header.id)
      else unread.add(header.id)
    }
    if (
      !inbox.has_more ||
      (unread.size >= 99 && inbox.items.length >= minimumItems)
    )
      return inbox
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
