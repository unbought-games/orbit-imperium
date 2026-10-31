import { ArrowRight, Recycle, Rocket, Orbit } from 'lucide-react'
import { BodyIllustration } from './body-illustration'
import {
  fleetFlight,
  type FleetEndpoint,
  type FleetSummaryRow,
} from './command-hud/fleet-summary'
import styles from './fleet-flight-route.module.css'

function FleetWorld({
  endpoint,
}: {
  endpoint: Pick<FleetEndpoint, 'kind' | 'art'>
}) {
  return endpoint.art ? (
    <BodyIllustration
      body={endpoint.art}
      className={styles.fleetWorld}
      sizes="28px"
    />
  ) : endpoint.kind === 'Debris' ? (
    <Recycle className={styles.fleetWorld} aria-hidden="true" />
  ) : (
    <Orbit className={styles.fleetWorld} aria-hidden="true" />
  )
}

export function FleetFlightRoute({
  row,
  now,
}: {
  row: FleetSummaryRow
  now: number
}) {
  const flight = fleetFlight(row, now)
  return (
    <>
      <FleetRouteTrack
        home={row.home}
        target={row.target}
        flight={flight}
        label={`${row.leg === 'Incoming' ? 'Incoming direction (position unknown)' : row.leg}: ${row.home.name} ${row.home.address} ${row.leg === 'Returning' || row.leg === 'Incoming' ? '←' : '→'} ${row.target.name} ${row.target.address}`}
      />
      <div className={styles.fleetEndpoints}>
        <span>
          <strong title={row.home.name}>{row.home.name}</strong>
          <span>{row.home.address}</span>
        </span>
        <p className={styles.fleetCountdown} role="timer" aria-live="off">
          {flight.label && (
            <>
              <span>{flight.label}</span>{' '}
            </>
          )}
          <strong>{flight.time}</strong>
        </p>
        <span>
          <strong title={row.target.name}>{row.target.name}</strong>
          <span>{row.target.address}</span>
        </span>
      </div>
    </>
  )
}

/** The same route artwork for a planned departure and an active flight. */
export function FleetRouteTrack({
  home,
  target,
  label,
  flight,
}: {
  home: Pick<FleetEndpoint, 'kind' | 'art'>
  target: Pick<FleetEndpoint, 'kind' | 'art'>
  label: string
  flight?: Pick<ReturnType<typeof fleetFlight>, 'position' | 'angle'>
}) {
  return (
    <div className={styles.fleetFlight} role="img" aria-label={label}>
      <svg
        viewBox="0 0 100 28"
        preserveAspectRatio="none"
        fill="none"
        aria-hidden="true"
      >
        <path className={styles.fleetTrackGlow} d="M0 14H100" />
        <path
          className={styles.fleetTrack}
          d="M0 14H100"
          vectorEffect="non-scaling-stroke"
        />
        {flight && flight.position !== null && (
          <path
            className={styles.fleetTrackActive}
            d="M0 14H100"
            pathLength="1"
            strokeDasharray={`${flight.position} 1`}
          />
        )}
      </svg>
      <span
        className={styles.fleetShip}
        style={{
          left: `calc(14px + (100% - 28px) * ${flight?.position ?? 0.5})`,
        }}
        aria-hidden="true"
      >
        {flight ? (
          <Rocket
            size={14}
            style={{ transform: `rotate(${flight.angle}deg)` }}
          />
        ) : (
          <ArrowRight size={14} />
        )}
      </span>
      <span className={styles.fleetHomeWorld}>
        <FleetWorld endpoint={home} />
      </span>
      <span className={styles.fleetTargetWorld}>
        <FleetWorld endpoint={target} />
      </span>
    </div>
  )
}
