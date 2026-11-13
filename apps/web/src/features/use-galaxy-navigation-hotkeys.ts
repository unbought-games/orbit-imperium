import { useHotkeys } from 'react-hotkeys-hook'

function ignoreEventWhen(event: KeyboardEvent) {
  // Inputs and editable content are excluded by the library. Leave composite
  // controls and focused dialogs in charge of their own arrow-key behavior too.
  return (
    event.defaultPrevented ||
    event.isComposing ||
    (event.target instanceof Element &&
      !!event.target.closest(
        'dialog, [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [role="tablist"], [role="tree"], [role="grid"], [role="combobox"]',
      ))
  )
}

export function useGalaxyNavigationHotkeys(
  previous: (() => void) | undefined,
  next: (() => void) | undefined,
) {
  useHotkeys('ArrowLeft', () => previous?.(), {
    enabled: !!previous,
    preventDefault: true,
    ignoreEventWhen,
  })
  useHotkeys('ArrowRight', () => next?.(), {
    enabled: !!next,
    preventDefault: true,
    ignoreEventWhen,
  })
}
