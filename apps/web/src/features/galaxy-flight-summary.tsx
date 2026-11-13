import { Clock3, Navigation, Undo2 } from 'lucide-react'
import type { ReactNode } from 'react'
import type { GalaxyFlight } from '../client-model/galaxy-fleets'
import { Popover } from '../ui/popover'
import { arrivalCountdown, exactTime } from './mission-presentation'
import { galaxyFlightPresentation } from './galaxy-flight-presentation'
import styles from './galaxy.module.css'

export function GalaxyFlightSummary({
  flights,
  now,
  target,
  children,
}: {
  flights: GalaxyFlight[]
  now?: number
  target: string
  children?: ReactNode
}) {
  const summary = galaxyFlightPresentation(flights, now)
  const Icon =
    summary.phase === 'returning'
      ? Undo2
      : summary.phase === 'pending'
        ? Clock3
        : Navigation
  return (
    <Popover
      label={`Your fleets to ${target}`}
      triggerDescription={summary.description}
      className={styles.flightTrigger}
      surfaceClassName={styles.flightDetails}
      placement="bottom-start"
      trigger={
        flights.length ? (
          <span className={styles.flightMarker} data-phase={summary.phase}>
            <span>
              <Icon size={16} aria-hidden="true" />
              {summary.count}
            </span>
            <span className={styles.flightArrival}>{summary.arrival}</span>
          </span>
        ) : (
          (children ?? <Navigation size={16} aria-hidden="true" />)
        )
      }
    >
      {flights.length ? (
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
      ) : (
        <p>No fleets heading to this position.</p>
      )}
    </Popover>
  )
}
