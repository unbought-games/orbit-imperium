import { useLayoutEffect, useRef } from 'react'

function columnsOverflow(panel: HTMLElement) {
  const last = panel.lastElementChild
  return (
    !!last &&
    last.getBoundingClientRect().right > panel.getBoundingClientRect().right
  )
}

function fitColumns(panel: HTMLElement) {
  if (!panel.hasAttribute('data-rows')) {
    panel.toggleAttribute('data-rows', columnsOverflow(panel))
    return
  }

  // Trying columns in the live grid briefly collapses its rows. Even a
  // synchronous layout read lets the browser adjust the player's scroll anchor.
  const probe = panel.cloneNode(true) as HTMLElement
  probe.removeAttribute('data-rows')
  probe.setAttribute('data-measure-columns', '')
  probe.inert = true
  probe.style.width = `${panel.getBoundingClientRect().width}px`
  panel.after(probe)
  try {
    panel.toggleAttribute('data-rows', columnsOverflow(probe))
  } finally {
    probe.remove()
  }
}

// The panels use tabular digits. A balance tick only needs a new measurement
// when the number's width can change (or when labels or structure change).
function affectsWidth(record: MutationRecord) {
  return (
    record.type !== 'characterData' ||
    record.oldValue?.replace(/\d/g, '0') !==
      record.target.nodeValue?.replace(/\d/g, '0')
  )
}

export function useResourceColumns<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useLayoutEffect(() => {
    const panel = ref.current
    if (!panel) return
    const fit = () => fitColumns(panel)

    fit()
    const size = new ResizeObserver(fit)
    size.observe(panel)
    const content = new MutationObserver((records) => {
      if (records.some(affectsWidth)) fit()
    })
    content.observe(panel, {
      childList: true,
      characterDataOldValue: true,
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
