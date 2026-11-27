import { useEffect, useState } from 'react'
import { useReducedMotion } from '../../ui/use-reduced-motion'
import { startOrbGlitches, type OrbGlitch } from './orb-glitch'

export function useOrbGlitch() {
  const reducedMotion = useReducedMotion()
  const [effect, setEffect] = useState<OrbGlitch | null>(null)
  useEffect(() => {
    if (reducedMotion) return
    let stop: (() => void) | undefined
    function syncVisibility() {
      stop?.()
      setEffect(null)
      stop = document.hidden ? undefined : startOrbGlitches(setEffect)
    }
    syncVisibility()
    document.addEventListener('visibilitychange', syncVisibility)
    return () => {
      stop?.()
      document.removeEventListener('visibilitychange', syncVisibility)
    }
  }, [reducedMotion])
  return reducedMotion ? null : effect
}
