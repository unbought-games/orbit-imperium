import { useEffect, useRef, type MouseEvent } from 'react'
import { useNavigate, useRouter } from '@tanstack/react-router'
import { useGameScreen } from './screen-context'
import { pageTitles } from './navigation-model'
import { routeTarget } from './route-target'

/** The URL owns selection. The ref remembers only where to return keyboard focus. */
export function useCatalogSelection() {
  const { universeName, route, body } = useGameScreen()
  const navigate = useNavigate()
  const router = useRouter()
  const returnTo = useRef<string | null>(null)
  useEffect(() => {
    if (route.item) return
    const frame = requestAnimationFrame(() => {
      const tile = [
        ...document.querySelectorAll<HTMLElement>('[data-catalog-item]'),
      ].find((element) => element.dataset.catalogItem === returnTo.current)
      tile?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [route.item])
  function close() {
    returnTo.current = route.item
    void navigate(routeTarget(universeName, route.page, body?.id))
  }
  return {
    selectedId: route.item,
    close,
    back: {
      href: router.buildLocation(
        routeTarget(universeName, route.page, body?.id),
      ).href,
      'aria-label': `Back to ${pageTitles[route.page]}`,
      onClick(event: MouseEvent<HTMLElement>) {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return
        event.preventDefault()
        close()
      },
    },
    link(id: string) {
      const target = routeTarget(universeName, route.page, body?.id, id)
      return {
        href: router.buildLocation(target).href,
        'data-catalog-item': id,
        onClick(event: MouseEvent<HTMLElement>) {
          if (
            event.defaultPrevented ||
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          )
            return
          event.preventDefault()
          returnTo.current = id
          void navigate(target)
        },
      }
    },
  }
}
export type CatalogSelection = ReturnType<typeof useCatalogSelection>
