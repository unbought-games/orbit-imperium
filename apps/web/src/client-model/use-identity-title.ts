import { useEffect, useState } from 'react'
import { effectiveTitle, type TitleDisplay } from './empire-identity'
export function useIdentityTitle(title?: TitleDisplay) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!title?.expires_at) return
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.max(0, title.expires_at * 1000 - Date.now()),
    )
    return () => clearTimeout(timer)
  }, [title?.expires_at])
  return effectiveTitle(title, Math.max(now, Date.now()))
}
