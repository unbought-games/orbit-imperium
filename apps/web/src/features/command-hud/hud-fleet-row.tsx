import { useId, useState } from 'react'
import { ChevronDown, Recycle, Rocket, Orbit } from 'lucide-react'
import { Link } from '../../ui/link'
import { NumberValue } from '../../ui/number-value'
import { formatWholeNumber } from '../../ui/whole-number'
import { routeTarget } from '../../shell/route-target'
import { BodyIllustration } from '../body-illustration'
import { ShipComposition } from '../ship-composition'
import {
  fleetFlight,
  fleetShipCount,
  ownFleetTone,
  type FleetEndpoint,
  type FleetSummaryRow,
} from './fleet-summary'
import styles from './hud.module.css'

function FleetWorld({ endpoint }: { endpoint: FleetEndpoint }) {
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

export function HudFleetRoute({
  row,
  now,
}: {
  row: FleetSummaryRow
  now: number
}) {
  const flight = fleetFlight(row, now)
  return (
    <>
      <div
        className={styles.fleetFlight}
        role="img"
        aria-label={`${row.leg === 'Incoming' ? 'Incoming direction (position unknown)' : row.leg}: ${row.home.name} ${row.home.address} ${row.leg === 'Returning' || row.leg === 'Incoming' ? '←' : '→'} ${row.target.name} ${row.target.address}`}
      >
        <svg
          viewBox="0 0 320 28"
          preserveAspectRatio="none"
          fill="none"
          aria-hidden="true"
        >
          <path className={styles.fleetTrackGlow} d="M16 14H304" />
          <path className={styles.fleetTrack} d="M16 14H304" />
          {flight.position !== null && (
            <path
              className={styles.fleetTrackActive}
              d="M16 14H304"
              pathLength="1"
              strokeDasharray={`${flight.position} 1`}
            />
          )}
          <g
            className={styles.fleetShip}
            transform={`translate(${flight.x} ${flight.y}) rotate(${flight.angle})`}
          >
            <circle
              r="11"
              fill="#0a1b27"
              stroke="currentColor"
              strokeOpacity=".25"
            />
            <Rocket x="-7" y="-7" width="14" height="14" />
          </g>
        </svg>
        <span className={styles.fleetHomeWorld}>
          <FleetWorld endpoint={row.home} />
        </span>
        <span className={styles.fleetTargetWorld}>
          <FleetWorld endpoint={row.target} />
        </span>
      </div>
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

export function HudFleetRow({
  row,
  now,
  universe,
  close,
}: {
  row: FleetSummaryRow
  now: number
  universe: string
  close: () => void
}) {
  const [showShips, setShowShips] = useState(false)
  const shipsId = useId()
  const count = fleetShipCount(row.ships)
  return (
    <article
      className={styles.fleetRow}
      data-flight-tone={ownFleetTone(row.mission)}
      aria-label={`${row.mission} fleet`}
    >
      <header className={styles.fleetHeading}>
        <div>
          {row.id ? (
            <Link
              {...routeTarget(universe, 'fleets', row.origin, row.id)}
              onClick={close}
              className={styles.fleetMission}
              aria-label={`${row.mission} fleet details`}
            >
              {row.mission}
            </Link>
          ) : (
            <strong className={styles.fleetMission}>{row.mission}</strong>
          )}
          <span className={styles.fleetLeg}>{row.leg}</span>
        </div>
        <button
          type="button"
          className={styles.fleetManifestToggle}
          aria-expanded={showShips}
          aria-controls={shipsId}
          aria-label={`${row.mission} ship composition: ${formatWholeNumber(count)} ${count === 1n ? 'ship' : 'ships'}`}
          onClick={() => setShowShips(!showShips)}
        >
          <span>
            <NumberValue value={count} /> {count === 1n ? 'ship' : 'ships'}
          </span>
          <ChevronDown size={12} aria-hidden="true" />
        </button>
      </header>
      <div id={shipsId} hidden={!showShips} className={styles.fleetManifest}>
        <ShipComposition ships={row.ships} />
      </div>
      <HudFleetRoute row={row} now={now} />
    </article>
  )
}
