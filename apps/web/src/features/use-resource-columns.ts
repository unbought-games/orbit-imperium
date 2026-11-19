import { useLayoutEffect, useRef } from 'react'

/** Let the browser size all three columns with their actual labels, numbers and icons. */
export function useResourceColumns<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useLayoutEffect(() => {
    const panel = ref.current
    if (!panel) return

    const fit = () => {
      panel.removeAttribute('data-rows')
      const last = panel.lastElementChild
      if (
        last &&
        last.getBoundingClientRect().right > panel.getBoundingClientRect().right
      ) {
        panel.setAttribute('data-rows', '')
      }
    }

    fit()
    const size = new ResizeObserver(fit)
    size.observe(panel)
    // Balances and breakdowns can change while the panel stays the same size.
    const content = new MutationObserver(fit)
    content.observe(panel, {
      childList: true,
      characterData: true,
      subtree: true,
    })
    document.fonts.addEventListener('loadingdone', fit)
    return () => {
      size.disconnect()
      content.disconnect()
      document.fonts.removeEventListener('loadingdone', fit)
    }
  }, [])
  return ref
}
