import { useState } from 'react'
import { announcements } from './catalog'
import { announcementHistory, currentAnnouncement } from './model'

/** Stores only acknowledgement choices; never game state. */
export function useReleaseAnnouncement(account: string) {
  const [, setAcknowledged] = useState(0)
  const announcement = currentAnnouncement(announcements, Date.now(), (id) =>
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
