import { useEffect, useState } from 'react'
import { atDeadline } from './deadline-timer'
import { effectiveTitle, type TitleDisplay } from './empire-identity'
export function useIdentityTitle(title?: TitleDisplay) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!title?.expires_at) return
    return atDeadline(title.expires_at * 1000, () => setNow(Date.now()))
  }, [title?.expires_at])
  return effectiveTitle(title, Math.max(now, Date.now()))
}
