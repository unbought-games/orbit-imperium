import { useId, useState } from 'react'
import { ChevronRight, ExternalLink, Rocket } from 'lucide-react'
import type { GameState } from '../../client-model/game-store'
import {
  currentServerTime,
  occupiedFleetSlots,
} from '../../client-model/game-projection'
import { routeTarget } from '../../shell/route-target'
import { Link } from '../../ui/link'
import { NumberValue } from '../../ui/number-value'
import { fleetSummaryRows } from './fleet-summary'
import { HudFleetRow } from './hud-fleet-row'
import styles from './hud.module.css'

export function HudFleets({
  state,
  universe,
  body,
  close,
}: {
  state: GameState
  universe: string
  body?: string
  close: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const panelId = useId()
  const rows = fleetSummaryRows(state)
  const now = currentServerTime(state)
  const view = state.view
  return (
    <section className={styles.fleetAccordion} aria-label="Empire fleets">
      <div className={styles.fleetControl}>
        <button
          type="button"
          className={styles.fleetToggle}
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => setExpanded(!expanded)}
        >
          <ChevronRight
            className={styles.fleetChevron}
            size={14}
            aria-hidden="true"
          />
          <Rocket size={15} aria-hidden="true" />
          <span>Fleets</span>
          <span className={styles.fleetSlotCount}>
            <NumberValue value={occupiedFleetSlots(state)} /> /{' '}
            {view?.protocol === 4 ? (
              <NumberValue value={view.missions.fleet_slots} />
            ) : (
              '—'
            )}{' '}
            <small>slots</small>
          </span>
        </button>
        <Link
          {...routeTarget(universe, 'fleets', body ?? view?.bodies[0]?.id)}
          className={styles.fleetViewAll}
          aria-label="All fleets"
          title="All fleets"
          onClick={close}
        >
          <ExternalLink size={13} aria-hidden="true" />
        </Link>
      </div>
      <div id={panelId} hidden={!expanded}>
        {rows.length ? (
          <ul className={styles.fleetList} aria-label="Empire fleets">
            {rows.map((row) => (
              <li key={row.key}>
                <HudFleetRow
                  row={row}
                  now={now}
                  universe={universe}
                  close={close}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.fleetEmpty}>
            No active fleets. All fleet slots are available.
          </p>
        )}
      </div>
    </section>
  )
}
