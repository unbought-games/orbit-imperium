import { parseAnnouncementFeed } from '../features/announcements/feed'

export async function loadAnnouncements(signal: AbortSignal) {
  const response = await fetch('/api/announcements', {
    signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
    cache: 'no-cache',
    credentials: 'same-origin',
  })
  if (!response.ok) throw Error('Announcements unavailable')
  const text = await response.text()
  // Storage caps the serialized feed at 1 MiB. HTTP adds a fixed-size revision
  // envelope (a SHA-256 string or null), which needs its own bounded allowance.
  if (new TextEncoder().encode(text).byteLength > 1_048_576 + 128)
    throw Error('Announcement feed too large')
  return parseAnnouncementFeed(JSON.parse(text))
}
