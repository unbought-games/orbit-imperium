import { useEffect, useRef } from 'react'

/** Activate the existing archive control so keyboard and pointer rules agree. */
export function useReportArchiveShortcut(enabled: boolean) {
  const button = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!enabled) return
    function archive(event: KeyboardEvent) {
      if (
        event.key.toLowerCase() !== 'e' ||
        event.defaultPrevented ||
        event.repeat ||
        event.isComposing ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        !button.current ||
        button.current.disabled
      )
        return
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest(
            'input:not([type="checkbox"]):not([type="radio"]), textarea, select, [role="textbox"], [role="combobox"]',
          ))
      )
        return
      // Portalled menus and dialogs own keyboard input while open.
      if (
        [
          ...document.querySelectorAll(
            'dialog[open], [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]',
          ),
        ].some((overlay) => overlay.getClientRects().length > 0)
      )
        return
      event.preventDefault()
      button.current.click()
    }
    window.addEventListener('keydown', archive)
    return () => window.removeEventListener('keydown', archive)
  }, [enabled])
  return button
}
