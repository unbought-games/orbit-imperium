import { useLayoutEffect, useState } from 'react'

function readViewport() {
  const viewport = window.visualViewport
  return {
    height: viewport?.height ?? window.innerHeight,
    width: viewport?.width ?? window.innerWidth,
    top: viewport?.offsetTop ?? 0,
    left: viewport?.offsetLeft ?? 0,
  }
}

/** Visual viewport follows the software keyboard and Safari's moving browser chrome. */
export function useVisualViewport() {
  const [viewport, setViewport] = useState(readViewport)
  useLayoutEffect(() => {
    const update = () =>
      setViewport((previous) => {
        const next = readViewport()
        return Object.keys(next).every(
          (key) =>
            next[key as keyof typeof next] ===
            previous[key as keyof typeof next],
        )
          ? previous
          : next
      })
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    update()
    return () => {
      window.visualViewport?.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])
  return viewport
}
