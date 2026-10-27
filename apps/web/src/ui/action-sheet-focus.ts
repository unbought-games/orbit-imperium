import type { KeyboardEvent } from 'react'

/** Keep Tab in the modal rather than letting native dialog traversal enter browser chrome. */
export function containSheetFocus(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== 'Tab') return
  const candidates = [
    ...event.currentTarget.querySelectorAll<HTMLElement>(
      'a[href], button, input, select, textarea, [tabindex], [contenteditable="true"]',
    ),
  ].filter(
    (element) =>
      element.tabIndex >= 0 &&
      !element.matches(':disabled') &&
      element.checkVisibility({ visibilityProperty: true }),
  )
  const first = candidates[0],
    last = candidates[candidates.length - 1]
  if (!first || !last) return
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus({ preventScroll: true })
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus({ preventScroll: true })
  }
}
