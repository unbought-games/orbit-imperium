import { useEffect, useReducer, useState, useSyncExternalStore } from 'react'
import { hudReducer, hudView, initialHud } from './model'
export function useHud() {
  const [state, dispatch] = useReducer(hudReducer, undefined, () =>
    initialHud(Date.now()),
  )
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [])
  return { state, dispatch, now, ...hudView(state, now) }
}
export type Hud = ReturnType<typeof useHud>

const desktopQuery = '(min-width: 768px)'
function subscribeDesktop(callback: () => void) {
  const query = window.matchMedia(desktopQuery)
  query.addEventListener('change', callback)
  return () => query.removeEventListener('change', callback)
}
export function useDesktopPreview() {
  return useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(desktopQuery).matches,
    () => false,
  )
}
