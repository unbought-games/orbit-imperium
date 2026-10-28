import type { components } from '../../contracts'
type Page = components['schemas']['ReportsPage4']

/** Hydrate enough canonical headers to count unread intelligence up to the badge cap. */
export async function readHudReports(
  read: (cursor: string | null) => Promise<Page | null>,
) {
  const unread = new Set<string>()
  const cursors = new Set<string>()
  let cursor: string | null = null
  do {
    const page = await read(cursor)
    if (!page) throw new Error('Unable to confirm your reports. Try again.')
    for (const header of page.items) {
      if (header.hidden || header.read) unread.delete(header.id)
      else unread.add(header.id)
    }
    if (!page.has_more || unread.size >= 99) return
    cursor = page.next_cursor
    if (!cursor || cursors.has(cursor))
      throw new Error('Report pagination changed. Try again.')
    cursors.add(cursor)
  } while (cursor)
}
