import { Navigation } from 'lucide-react'
import type { GalaxyFlight } from '../client-model/galaxy-fleets'
import { arrivalCountdown } from './mission-presentation'
import styles from './galaxy.module.css'

function nextArrival(flights: GalaxyFlight[]) {
  return flights.reduce<number | null>(
    (next, flight) =>
      flight.dueAt === null
        ? next
        : next === null
          ? flight.dueAt
          : Math.min(next, flight.dueAt),
    null,
  )
}

function FlightLine({ flight, now }: { flight: GalaxyFlight; now?: number }) {
  return (
    <>
      {flight.mission} {flight.phase}
      {flight.dueAt !== null && now !== undefined && (
        <> · {arrivalCountdown(flight.dueAt, now)}</>
      )}
    </>
  )
}

export function GalaxyFlightSummary({
  flights,
  now,
  target,
}: {
  flights: GalaxyFlight[]
  now?: number
  target: string
}) {
  if (!flights.length) return null
  if (flights.length === 1)
    return (
      <div
        role="group"
        className={styles.flightSingle}
        aria-label={`Your fleets to ${target}`}
      >
        <Navigation size={13} aria-hidden="true" />
        <FlightLine flight={flights[0]} now={now} />
      </div>
    )
  const next = nextArrival(flights)
  return (
    <details className={styles.flights} aria-label={`Your fleets to ${target}`}>
      <summary aria-label={`Show ${flights.length} fleets to ${target}`}>
        <Navigation size={13} aria-hidden="true" />
        <span>
          {flights.length} fleets
          {next !== null && now !== undefined && (
            <> · next in {arrivalCountdown(next, now)}</>
          )}
        </span>
        <span className={styles.flightExpand}>Details</span>
      </summary>
      <ul>
        {flights.map((flight) => (
          <li key={flight.id}>
            <FlightLine flight={flight} now={now} />
          </li>
        ))}
      </ul>
    </details>
  )
}
