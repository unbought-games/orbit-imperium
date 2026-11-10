import { parseAnnouncementFeed } from '../features/announcements/feed'

export async function loadAnnouncements(signal: AbortSignal) {
  const response = await fetch('/api/announcements', {
    signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
    cache: 'no-cache',
    credentials: 'same-origin',
  })
  if (!response.ok) throw Error('Announcements unavailable')
  const text = await response.text()
  if (text.length > 1_048_576) throw Error('Announcement feed too large')
  return parseAnnouncementFeed(JSON.parse(text))
}
