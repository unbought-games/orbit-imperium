import { useCallback, useLayoutEffect, type RefObject } from 'react'

/** Return focus before a closing/unmounted surface releases its focused control. */
export function usePopupFocusReturn(
  open: boolean,
  popup: RefObject<HTMLDivElement | null>,
  anchor: RefObject<HTMLElement | null>,
) {
  useLayoutEffect(() => {
    if (!open && popup.current?.contains(document.activeElement)) {
      anchor.current?.focus({ preventScroll: true })
    }
  }, [open, popup, anchor])
  return useCallback(
    (element: HTMLDivElement | null) => {
      popup.current = element
      if (!element) return
      // The trigger may stop owning the bubble in the same commit (withdrawal or
      // suspension). Capture its DOM node while both parts are still connected.
      const target = anchor.current
      return () => {
        if (element.contains(document.activeElement))
          target?.focus({ preventScroll: true })
        popup.current = null
      }
    },
    [popup, anchor],
  )
}
