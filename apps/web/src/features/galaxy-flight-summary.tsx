import { ArrowUpRight, ArrowDownLeft } from 'lucide-react'
import type { GalaxyFlight } from '../client-model/galaxy-fleets'
import { Popover } from '../ui/popover'
import { arrivalCountdown, exactTime } from './mission-presentation'
import { galaxyFlightPresentation } from './galaxy-flight-presentation'
import styles from './galaxy.module.css'

export function GalaxyFlightSummary({
  flights,
  now,
  target,
}: {
  flights: GalaxyFlight[]
  now?: number
  target: string
}) {
  const summary = galaxyFlightPresentation(flights, now)
  if (!flights.length) return null
  return (
    <Popover
      label={`Your fleets to ${target}`}
      triggerDescription={summary.description}
      className={styles.flightTrigger}
      surfaceClassName={styles.flightDetails}
      placement="bottom-start"
      trigger={
        <span className={styles.flightMarker}>
          <span className={styles.flightDirections}>
            <span>
              <ArrowUpRight size={16} aria-hidden="true" />
              {summary.outbound === '0' ? '–' : summary.outbound}
            </span>
            <span className={styles.flightReturning}>
              <ArrowDownLeft size={16} aria-hidden="true" />
              {summary.returning === '0' ? '–' : summary.returning}
            </span>
          </span>
          <span className={styles.flightArrival}>{summary.arrival}</span>
        </span>
      }
    >
      <>
        <p>
          {flights.length} {flights.length === 1 ? 'fleet' : 'fleets'}
        </p>
        <ul tabIndex={0} aria-label="Fleet details">
          {flights.map((flight) => (
            <li key={flight.id}>
              <strong>
                {flight.mission} {flight.phase}
              </strong>
              {flight.dueAt !== null && (
                <>
                  {now !== undefined && (
                    <span>{arrivalCountdown(flight.dueAt, now)}</span>
                  )}
                  <time dateTime={new Date(flight.dueAt).toISOString()}>
                    {exactTime(flight.dueAt)}
                  </time>
                </>
              )}
            </li>
          ))}
        </ul>
      </>
    </Popover>
  )
}
