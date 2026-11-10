/** Runtime editorial data. IDs remain stable across copy corrections. */
export type Announcement = {
  id: string
  title: string
  date: string
  until?: string
  href?: string
  image?: { src: string; alt: string }
  body: string
}

export const announcementDays = 30

export const announcementEnd = (entry: Announcement) =>
  entry.until
    ? Date.parse(entry.until)
    : Date.parse(entry.date) + announcementDays * 86_400_000

/**
 * The newest announcement inside its window that this account hasn't
 * acknowledged. News from before the empire joined is not news to it.
 */
export function currentAnnouncement(
  announcements: readonly Announcement[],
  now: number,
  seen: (id: string) => boolean,
  joinedAt?: number,
): Announcement | null {
  return (
    announcements
      .filter(
        (entry) =>
          Date.parse(entry.date) <= now &&
          (joinedAt === undefined || Date.parse(entry.date) >= joinedAt) &&
          now < announcementEnd(entry) &&
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
