import { useSyncExternalStore } from 'react'

// One wall-clock subscription for all timestamps, released with the last reader.
// Countdown completion is presentation only; it never changes game state.
let sample = Date.now()
let timer: ReturnType<typeof setInterval> | undefined
const listeners = new Set<() => void>()
const snapshot = () => sample
const serverSnapshot = () => 0
const noSubscription = () => () => {}
function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!timer) {
    sample = Date.now()
    timer = setInterval(() => {
      sample = Date.now()
      listeners.forEach((notify) => notify())
    }, 1000)
  }
  return () => {
    listeners.delete(listener)
    if (!listeners.size) {
      clearInterval(timer)
      timer = undefined
    }
  }
}

/** A supplied `now` is authoritative; callers can use their server-adjusted clock. */
export function useTimestampClock(now?: number) {
  const clock = useSyncExternalStore(
    now === undefined ? subscribe : noSubscription,
    snapshot,
    serverSnapshot,
  )
  return now ?? clock
}
