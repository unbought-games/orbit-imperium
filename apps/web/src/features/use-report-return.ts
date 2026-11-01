import { useEffect, useRef } from 'react'
import { useRouter, useRouterState } from '@tanstack/react-router'
import { routeTarget } from '../shell/route-target'

/** Only return through history when this detail was opened from our list. */
export function useReportReturn(universe: string, origin: string) {
  const router = useRouter()
  const location = useRouterState({ select: (state) => state.location })
  const list = useRef<{
    location: typeof location
    x: number
    y: number
  } | null>(null)
  useEffect(
    () =>
      router.subscribe('onRendered', ({ toLocation }) => {
        const saved = list.current
        if (
          saved &&
          toLocation.state.__TSR_key === saved.location.state.__TSR_key
        )
          window.scrollTo(saved.x, saved.y)
      }),
    [router],
  )
  return {
    rememberList: () => {
      list.current = { location, x: window.scrollX, y: window.scrollY }
    },
    onCommitted: (hidden: boolean) => {
      if (
        !hidden ||
        router.state.location.state.__TSR_key !== location.state.__TSR_key
      )
        return
      if (
        list.current &&
        location.state.__TSR_index ===
          list.current.location.state.__TSR_index + 1
      ) {
        router.history.back()
      } else {
        void router.navigate(routeTarget(universe, 'reports', origin))
      }
    },
  }
}
