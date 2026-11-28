import type { DispatchObservation } from '../client-model/dispatch-observations'

// Batch milestones after the gameplay request has left. Idle clients own no timers.
export function dispatchObservationPort(csrf: string) {
  const pending = new Map<string, DispatchObservation[]>()
  let timer: ReturnType<typeof setTimeout> | undefined
  const flush = () => {
    clearTimeout(timer)
    timer = undefined
    window.removeEventListener('pagehide', flush)
    for (const [universe, observations] of pending) {
      pending.delete(universe)
      for (let i = 0; i < observations.length; i += 24) {
        void fetch(
          `/api/v1/universes/${encodeURIComponent(universe)}/dispatch-observations`,
          {
            method: 'POST',
            credentials: 'same-origin',
            keepalive: true,
            headers: {
              'Content-Type': 'application/json',
              'X-CSRF-Token': csrf,
            },
            body: JSON.stringify({
              observations: observations.slice(i, i + 24),
            }),
          },
        ).catch(() => {})
      }
    }
  }
  return (universe: string, sample: DispatchObservation) => {
    const batch = pending.get(universe) ?? []
    batch.push(sample)
    pending.set(universe, batch)
    if (timer === undefined) {
      timer = setTimeout(flush, 250)
      window.addEventListener('pagehide', flush, { once: true })
    }
  }
}
