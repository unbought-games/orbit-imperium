import type { Announcement } from './model'

export function announcementUrl(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > 2048 ||
    /[\s\\]/u.test(value) ||
    Array.from(value).some(
      (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
    )
  )
    return false
  if (value.startsWith('/') && !value.startsWith('//')) return true
  try {
    const url = new URL(value)
    return (
      value.startsWith('https://') &&
      url.protocol === 'https:' &&
      !url.username &&
      !url.password
    )
  } catch {
    return false
  }
}
function validEntry(value: unknown): value is Announcement {
  if (!value || typeof value !== 'object') return false
  const entry = value as Partial<Announcement>
  const start = typeof entry.date === 'string' ? Date.parse(entry.date) : NaN
  return (
    typeof entry.id === 'string' &&
    entry.id.length <= 100 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id) &&
    typeof entry.title === 'string' &&
    !!entry.title.trim() &&
    entry.title.length <= 200 &&
    Number.isFinite(start) &&
    start >= 0 &&
    (entry.until === undefined ||
      (typeof entry.until === 'string' && Date.parse(entry.until) > start)) &&
    typeof entry.body === 'string' &&
    !!entry.body.trim() &&
    entry.body.length <= 16384 &&
    (entry.href === undefined || announcementUrl(entry.href)) &&
    (entry.image === undefined ||
      (!!entry.image &&
        announcementUrl(entry.image.src) &&
        typeof entry.image.alt === 'string' &&
        entry.image.alt.length <= 500))
  )
}
export function parseAnnouncementFeed(value: unknown): Announcement[] {
  if (!value || typeof value !== 'object')
    throw Error('Invalid announcement feed')
  const feed = value as { schema?: unknown; announcements?: unknown }
  if (
    feed.schema !== 1 ||
    !Array.isArray(feed.announcements) ||
    feed.announcements.length > 64 ||
    !feed.announcements.every(validEntry)
  )
    throw Error('Invalid announcement feed')
  if (
    new Set(feed.announcements.map((entry) => entry.id)).size !==
    feed.announcements.length
  )
    throw Error('Duplicate announcement ID')
  return feed.announcements
}
