import { useEffect, useState } from 'react'
import { remaining, formatRemaining } from './clock'
export function useCountdown(
  sample: number,
  format: 'exact' | 'compact' = 'exact',
) {
  const [clock, setClock] = useState(() => ({
    sample,
    received: performance.now(),
    now: performance.now(),
  }))
  useEffect(() => {
    const received = performance.now()
    setClock({ sample, received, now: received })
    const timer = setInterval(
      () => setClock({ sample, received, now: performance.now() }),
      250,
    )
    return () => clearInterval(timer)
  }, [sample])
  return (deadline: number) => {
    const seconds = remaining(deadline, clock.sample, clock.received, clock.now)
    if (format === 'compact') return formatRemaining(seconds)
    return seconds === null
      ? 'Awaiting confirmation'
      : `${seconds} seconds remaining`
  }
}
