import { useSyncExternalStore } from 'react'

/** A shared source clock, sampled lazily when a new subscription period begins. */
export function createTimestampClock() {
  let sample: number | undefined
  let timer: ReturnType<typeof setInterval> | undefined
  const listeners = new Set<() => void>()
  const snapshot = () => (sample ??= Date.now())
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
        // The next render reads before React subscribes. Never hand that render
        // the final sample from an earlier, potentially much older mount.
        sample = undefined
      }
    }
  }
  return { snapshot, subscribe }
}

// One wall-clock subscription for all timestamps, released with the last reader.
// Countdown completion is presentation only; it never changes game state.
const clock = createTimestampClock()
const serverSnapshot = () => 0
const noSubscription = () => () => {}

/** A supplied `now` is authoritative; callers can use their server-adjusted clock. */
export function useTimestampClock(now?: number) {
  // Controlled instances must not seed the idle shared clock's snapshot.
  const read = now === undefined ? clock.snapshot : () => now
  return useSyncExternalStore(
    now === undefined ? clock.subscribe : noSubscription,
    read,
    now === undefined ? serverSnapshot : read,
  )
}
