import { useSyncExternalStore } from 'react'

const query = '(max-width: 767px)'
function subscribe(notify: () => void) {
  const media = window.matchMedia(query)
  media.addEventListener('change', notify)
  return () => media.removeEventListener('change', notify)
}
/** Shares the game shell's breakpoint; crossing it preserves the caller's UI state. */
export function useMobileLayout() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  )
}
