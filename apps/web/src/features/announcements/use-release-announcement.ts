import { useEffect, useState } from 'react'
import { loadAnnouncements } from '../../adapters/announcements'
import {
  announcementHistory,
  currentAnnouncement,
  type Announcement,
} from './model'

/** Fetch editorial content independently of game state and readiness. */
export function useReleaseAnnouncement(account: string, joinedAt?: number) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [, setAcknowledged] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    let pending = false
    const refresh = async () => {
      if (pending || document.visibilityState === 'hidden') return
      pending = true
      try {
        const feed = await loadAnnouncements(controller.signal)
        if (!controller.signal.aborted) setAnnouncements(feed)
      } catch {
        // A missing, invalid or unavailable feed never interrupts gameplay.
        if (!controller.signal.aborted) setAnnouncements([])
      } finally {
        pending = false
      }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 60_000)
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      controller.abort()
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [])
  const announcement = currentAnnouncement(
    announcements,
    Date.now(),
    (id) => announcementHistory.seen(account, id),
    joinedAt,
  )
  return {
    announcement,
    acknowledge() {
      if (!announcement) return
      announcementHistory.remember(account, announcement.id)
      setAcknowledged((count) => count + 1)
    },
  }
}
