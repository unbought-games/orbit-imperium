import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Link } from '../../ui/link'
import { useRowLink } from '../../ui/use-row-link'
import rowLinkStyles from '../../ui/row-link.module.css'
import { NumberValue } from '../../ui/number-value'
import { formatWholeNumber } from '../../ui/whole-number'
import { routeTarget } from '../../shell/route-target'
import { ShipComposition } from '../ship-composition'
import {
  fleetShipCount,
  ownFleetTone,
  type FleetSummaryRow,
} from './fleet-summary'
import { FleetFlightRoute as HudFleetRoute } from '../fleet-flight-route'
export { FleetFlightRoute as HudFleetRoute } from '../fleet-flight-route'
import styles from './hud.module.css'

export function HudFleetRow({
  row,
  now,
  universe,
  body,
  close,
}: {
  row: FleetSummaryRow
  now: number
  universe: string
  body?: string
  close: () => void
}) {
  const [showShips, setShowShips] = useState(false)
  const shipsId = useId()
  const { linkRef, rowProps } = useRowLink(!!row.id)
  const count = fleetShipCount(row.ships)
  return (
    <article
      {...rowProps}
      className={`${styles.fleetRow} ${rowLinkStyles.row}`}
      data-flight-tone={ownFleetTone(row.mission)}
      aria-label={`${row.mission} fleet`}
    >
      <header className={styles.fleetHeading}>
        <div>
          {row.id ? (
            <Link
              ref={linkRef}
              {...routeTarget(universe, 'fleets', row.origin, row.id)}
              onClick={close}
              className={`${styles.fleetMission} ${rowLinkStyles.link}`}
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
      <HudFleetRoute row={row} now={now} origin={body} />
    </article>
  )
}
