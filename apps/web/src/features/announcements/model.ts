/** One curated release note, as built by `scripts/news.mjs` into `/updates/announcements.json`. */
export type Announcement = {
  id: string
  title: string
  summary: string
  date: string
  until: string
  href: string
}

export const announcementsUrl = '/updates/announcements.json'

const text = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0
const instant = (value: unknown): value is string =>
  text(value) && Number.isFinite(Date.parse(value))

/** Untrusted build output: keep only well-formed same-site entries. */
export function parseAnnouncements(payload: unknown): Announcement[] {
  if (!payload || typeof payload !== 'object') return []
  const { version, announcements } = payload as {
    version?: unknown
    announcements?: unknown
  }
  if (version !== 1 || !Array.isArray(announcements)) return []
  return announcements.flatMap((entry: unknown) => {
    if (!entry || typeof entry !== 'object') return []
    const { id, title, summary, date, until, href } = entry as Record<
      string,
      unknown
    >
    if (
      !text(id) ||
      !text(title) ||
      !text(summary) ||
      !instant(date) ||
      !instant(until) ||
      !text(href) ||
      !href.startsWith('/updates/')
    )
      return []
    return [{ id, title, summary, date, until, href }]
  })
}

/** The newest announcement inside its window that this account hasn't acknowledged. */
export function currentAnnouncement(
  announcements: readonly Announcement[],
  now: number,
  seen: (id: string) => boolean,
): Announcement | null {
  return (
    announcements
      .filter(
        (entry) =>
          Date.parse(entry.date) <= now &&
          now < Date.parse(entry.until) &&
          !seen(entry.id),
      )
      .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))[0] ?? null
  )
}

/** Presentation history only: acknowledged announcement IDs per account. */
export function createAnnouncementHistory(
  storage: () => Pick<Storage, 'getItem' | 'setItem'>,
) {
  const fallback = new Set<string>()
  const key = (account: string, id: string) =>
    `orbit.announcement.v1:${account}:${id}`
  return {
    seen(account: string, id: string) {
      const entry = key(account, id)
      if (fallback.has(entry)) return true
      try {
        return storage().getItem(entry) === 'seen'
      } catch {
        return false
      }
    },
    remember(account: string, id: string) {
      const entry = key(account, id)
      fallback.add(entry)
      try {
        storage().setItem(entry, 'seen')
      } catch {
        // Restricted storage still hides the announcement for this session.
      }
    },
  }
}

export const announcementHistory = createAnnouncementHistory(() => localStorage)

let pending: Promise<Announcement[]> | null = null
/** One request per page load; a failed request quietly shows nothing. */
export function loadAnnouncements(
  request: typeof fetch = (input, init) => fetch(input, init),
) {
  pending ??= request(announcementsUrl, { cache: 'no-cache' })
    .then((response) => (response.ok ? response.json() : null))
    .then(parseAnnouncements, () => [])
  return pending
}
export function resetAnnouncementsForTest() {
  pending = null
}
