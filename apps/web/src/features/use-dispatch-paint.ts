import { useLayoutEffect, type RefObject } from 'react'

// The second animation frame follows a browser paint opportunity. For launch
// feedback, also require the actual text to be on screen and unobscured.
export function useDispatchPaint(
  ref: RefObject<HTMLElement | null>,
  observe: (() => void) | undefined,
  visible: boolean,
) {
  useLayoutEffect(() => {
    const element = ref.current
    if (!observe || !element) return
    let frame = 0
    let observer: IntersectionObserver | undefined
    const check = () => {
      if (document.visibilityState !== 'visible' || !element.isConnected) return
      if (visible) {
        const box = element.getBoundingClientRect()
        const hit = document.elementFromPoint(
          box.x + box.width / 2,
          box.y + box.height / 2,
        )
        if (
          !hit ||
          !element.contains(hit) ||
          (element.checkVisibility &&
            !element.checkVisibility({
              opacityProperty: true,
              visibilityProperty: true,
            }))
        )
          return
      }
      observe()
      observer?.disconnect()
    }
    const afterPaint = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(check)
      })
    }
    if (visible) {
      observer = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) afterPaint()
      })
      observer.observe(element)
    }
    afterPaint()
    // Closing a native modal exposes a toast without changing its intersection
    // with the viewport. Sample again once the blocking surface has closed.
    if (visible) document.addEventListener('close', afterPaint, true)
    document.addEventListener('visibilitychange', afterPaint)
    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
      if (visible) document.removeEventListener('close', afterPaint, true)
      document.removeEventListener('visibilitychange', afterPaint)
    }
  }, [ref, observe, visible])
}
