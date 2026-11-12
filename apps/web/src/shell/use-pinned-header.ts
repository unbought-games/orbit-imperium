import { useLayoutEffect, useRef } from 'react'

/** Reserve the fixed header's responsive size, including body search. */
export function usePinnedHeader() {
  const shell = useRef<HTMLDivElement>(null)
  const columns = useRef<HTMLDivElement>(null)
  const header = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const root = shell.current
    const content = columns.current
    const desktop = header.current
    const mobile = desktop?.querySelector<HTMLElement>(
      '[data-sticky-navigation]',
    )
    if (!root || !content || !desktop || !mobile) return
    const measure = () => {
      root.style.setProperty(
        '--shell-content-width',
        `${content.getBoundingClientRect().width}px`,
      )
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
    observer.observe(content)
    measure()
    return () => observer.disconnect()
  }, [])
  return { shell, columns, header }
}
