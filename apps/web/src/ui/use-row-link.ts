import {
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent,
} from 'react'

const controls =
  'a, button, input, select, textarea, summary, [role="button"], [role="link"], [role="menuitem"], [contenteditable="true"], [tabindex], [data-coordinate]'

/** Keep a real link for keyboard/browser navigation; delegate only inert row space. */
export function useRowLink(enabled: boolean) {
  const linkRef = useRef<HTMLAnchorElement>(null)
  const [pressed, setPressed] = useState(false)
  const pointerAllowed = useRef<boolean | null>(null)
  const isRowSpace = (
    event: ReactMouseEvent<HTMLElement> | PointerEvent<HTMLElement>,
  ) => {
    if (
      !enabled ||
      !(event.target instanceof Element) ||
      !event.currentTarget.contains(event.target)
    )
      return false
    const control = event.target.closest(controls)
    return !control || !event.currentTarget.contains(control)
  }

  const activate = (event: ReactMouseEvent<HTMLElement>) => {
    if (!isRowSpace(event)) return
    const allowed = pointerAllowed.current
    pointerAllowed.current = null
    if (
      allowed === false ||
      event.defaultPrevented ||
      event.button !== 0 ||
      window.getSelection()?.type === 'Range'
    )
      return
    // Forward the user's modifiers through the real link, preserving router and
    // native new-tab behavior without nesting other controls inside an anchor.
    linkRef.current?.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
      }),
    )
  }

  return {
    linkRef,
    rowProps: {
      'data-clickable': enabled || undefined,
      'data-pressed': (enabled && pressed) || undefined,
      onClick: activate,
      onPointerDownCapture: (event: PointerEvent<HTMLElement>) => {
        pointerAllowed.current = event.button === 0 && isRowSpace(event)
        setPressed(pointerAllowed.current)
      },
      onPointerUpCapture: (event: PointerEvent<HTMLElement>) => {
        if (!isRowSpace(event)) pointerAllowed.current = false
        setPressed(false)
      },
      onPointerCancelCapture: () => {
        pointerAllowed.current = false
        setPressed(false)
      },
      onPointerLeave: (event: PointerEvent<HTMLElement>) => {
        // Touch emits pointerleave after pointerup, before its click. Only a
        // drag out while still held cancels that activation.
        if (event.buttons !== 0) pointerAllowed.current = false
        setPressed(false)
      },
    },
  }
}
