import { useLayoutEffect, useRef } from 'react'

/** Keep sticky page controls below the responsive shell, including body search. */
export function usePinnedHeader() {
  const shell = useRef<HTMLDivElement>(null)
  const header = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const root = shell.current
    const desktop = header.current
    const mobile = desktop?.querySelector<HTMLElement>(
      '[data-sticky-navigation]',
    )
    if (!root || !desktop || !mobile) return
    const measure = () => {
      const pinned =
        getComputedStyle(desktop).display === 'contents' ? mobile : desktop
      root.style.setProperty(
        '--shell-header-height',
        `${pinned.getBoundingClientRect().height}px`,
      )
    }
    const observer = new ResizeObserver(measure)
    observer.observe(desktop)
    observer.observe(mobile)
    measure()
    return () => observer.disconnect()
  }, [])
  return { shell, header }
}
