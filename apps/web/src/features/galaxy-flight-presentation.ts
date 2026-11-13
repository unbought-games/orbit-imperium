import type { GalaxyFlight } from '../client-model/galaxy-fleets'

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
  return {
    phase,
    arrival,
    count: flights.length > 99 ? '99+' : String(flights.length),
  }
}
