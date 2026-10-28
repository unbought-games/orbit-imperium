import { useSyncExternalStore } from 'react'

const query = '(prefers-reduced-motion: reduce)'
function subscribe(onChange: () => void) {
  const preference = window.matchMedia(query)
  preference.addEventListener('change', onChange)
  return () => preference.removeEventListener('change', onChange)
}

/** Also responds when the OS preference changes during an active animation. */
export function useReducedMotion() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => true,
  )
}
