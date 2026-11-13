import type { GalaxyFlight } from '../client-model/galaxy-fleets'
import { arrivalCountdown } from './mission-presentation'

/** Short enough for the planet-marker column; full times live in the disclosure. */
export function galaxyFlightPresentation(
  flights: GalaxyFlight[],
  now?: number,
) {
  const next = flights.reduce<number | null>(
    (next, flight) =>
      flight.dueAt === null
        ? next
        : next === null
          ? flight.dueAt
          : Math.min(next, flight.dueAt),
    null,
  )
  const phase = flights.every((flight) => flight.phase === 'returning')
    ? 'returning'
    : flights.every((flight) => flight.phase === 'departure pending')
      ? 'pending'
      : 'en route'
  let arrival = '…'
  if (next !== null && now !== undefined) {
    const seconds = Math.ceil((next - now) / 1000)
    arrival =
      seconds <= 0
        ? 'Due'
        : seconds < 60
          ? `${seconds}s`
          : seconds < 3600
            ? `${Math.ceil(seconds / 60)}m`
            : seconds < 86400
              ? `${Math.ceil(seconds / 3600)}h`
              : `${Math.ceil(seconds / 86400)}d`
  }
  const phases: GalaxyFlight['phase'][] = [
    'en route',
    'returning',
    'departure pending',
  ]
  const description = flights.length
    ? phases
        .flatMap((phase) => {
          const count = flights.filter(
            (flight) => flight.phase === phase,
          ).length
          return count
            ? [`${count} ${count === 1 ? 'fleet' : 'fleets'} ${phase}.`]
            : []
        })
        .join(' ') +
      (next !== null && now !== undefined
        ? ` Next arrival: ${arrivalCountdown(next, now)}.`
        : '')
    : 'No fleets heading to this position.'
  return {
    description,
    phase,
    arrival,
    count: flights.length > 99 ? '99+' : String(flights.length),
  }
}
