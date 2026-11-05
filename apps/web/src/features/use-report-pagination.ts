import { useEffect, useRef } from 'react'

/** One intersection consumes one cursor. Errors require an explicit retry. */
export function useReportPagination(
  enabled: boolean,
  cursor: string | null | undefined,
  more: () => boolean,
) {
  const sentinel = useRef<HTMLDivElement>(null)
  const latest = useRef(more)
  latest.current = more
  useEffect(() => {
    const element = sentinel.current
    if (!enabled || !cursor || !element) return
    let active = true
    const observer = new IntersectionObserver(
      (entries) => {
        if (active && entries.some((entry) => entry.isIntersecting)) {
          active = false
          observer.disconnect()
          latest.current()
        }
      },
      { rootMargin: '0px 0px 160px 0px' },
    )
    observer.observe(element)
    return () => {
      active = false
      observer.disconnect()
    }
  }, [enabled, cursor])
  return sentinel
}
