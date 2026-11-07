import { useEffect, useState } from 'react'
import {
  announcementHistory,
  currentAnnouncement,
  loadAnnouncements,
  type Announcement,
} from './model'

/** Stores only the loaded build feed and acknowledgement choices; never game state. */
export function useReleaseAnnouncement(account: string) {
  const [feed, setFeed] = useState<Announcement[]>([])
  const [, setAcknowledged] = useState(0)
  useEffect(() => {
    let active = true
    void loadAnnouncements().then((entries) => {
      if (active) setFeed(entries)
    })
    return () => {
      active = false
    }
  }, [])
  const announcement = currentAnnouncement(feed, Date.now(), (id) =>
    announcementHistory.seen(account, id),
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
