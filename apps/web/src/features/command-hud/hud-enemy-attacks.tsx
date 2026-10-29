import { useId, useState } from 'react'
import { ChevronDown, ChevronRight, ShieldAlert } from 'lucide-react'
import type { GameState } from '../../client-model/game-store'
import { currentServerTime } from '../../client-model/game-projection'
import { NumberValue } from '../../ui/number-value'
import { formatWholeNumber } from '../../ui/whole-number'
import { incomingManifest } from '../mission-presentation'
import { ShipComposition } from '../ship-composition'
import { PlayerName } from '../player-name'
import { enemyAttackRows } from './fleet-summary'
import { HudFleetRoute } from './hud-fleet-row'
import type { HudTarget } from './model'
import styles from './hud.module.css'

type Entry = ReturnType<typeof enemyAttackRows>[number]
function EnemyAttackRow({
  entry,
  state,
  onSelect,
}: {
  entry: Entry
  state: GameState
  onSelect: (target: HudTarget) => void
}) {
  const [showShips, setShowShips] = useState(false)
  const shipsId = useId()
  const { fleet, row } = entry
  const summary =
    fleet.ships.visibility !== 'Unknown' ? (
      <>
        <NumberValue value={fleet.ships.total} />{' '}
        {fleet.ships.total === '1' ? 'ship' : 'ships'}
      </>
    ) : (
      'Ships unknown'
    )
  return (
    <article
      className={styles.fleetRow}
      data-flight-tone="enemy"
      aria-label="Incoming attack fleet"
    >
      <header className={styles.fleetHeading}>
        <div>
          <button
            type="button"
            className={`${styles.fleetMission} ${styles.fleetInspect}`}
            onClick={() => onSelect({ kind: 'incoming', id: row.key })}
          >
            Attack
          </button>
          <span className={styles.fleetLeg}>
            <PlayerName
              player={fleet.sender}
              names={
                state.view?.protocol === 4 ? state.view.player_names : undefined
              }
            />
          </span>
        </div>
        {fleet.ships.visibility === 'Exact' ? (
          <button
            type="button"
            className={styles.fleetManifestToggle}
            aria-label={`Enemy ship composition: ${formatWholeNumber(fleet.ships.total)} ${fleet.ships.total === '1' ? 'ship' : 'ships'}`}
            aria-expanded={showShips}
            aria-controls={shipsId}
            onClick={() => setShowShips(!showShips)}
          >
            {summary}
            <ChevronDown size={12} aria-hidden="true" />
          </button>
        ) : (
          <span
            className={styles.enemyShipSummary}
            title={incomingManifest(fleet.ships)}
          >
            {summary}
          </span>
        )}
      </header>
      <div id={shipsId} hidden={!showShips} className={styles.fleetManifest}>
        <ShipComposition ships={row.ships} />
      </div>
      <HudFleetRoute row={row} now={currentServerTime(state)} />
    </article>
  )
}

export function HudEnemyAttacks({
  state,
  onSelect,
}: {
  state: GameState
  onSelect: (target: HudTarget) => void
}) {
  const [expansion, setExpansion] = useState<boolean | null>(null)
  const panelId = useId()
  const attacks = enemyAttackRows(state)
  const expanded = expansion ?? attacks.length > 0
  return (
    <section
      className={`${styles.fleetAccordion} ${styles.enemyAccordion}`}
      data-active={attacks.length > 0}
      data-tone={attacks.length ? 'red' : undefined}
      aria-label="Enemy attacks"
    >
      <div className={styles.fleetControl}>
        <button
          type="button"
          className={styles.fleetToggle}
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => setExpansion(!expanded)}
        >
          <ChevronRight
            className={styles.fleetChevron}
            size={14}
            aria-hidden="true"
          />
          <ShieldAlert size={15} aria-hidden="true" />
          <span>Enemy attacks</span>
          <span className={styles.fleetSlotCount}>
            <NumberValue value={attacks.length} />
          </span>
        </button>
      </div>
      <div id={panelId} hidden={!expanded}>
        {attacks.length ? (
          <ul className={styles.fleetList} aria-label="Enemy attacks">
            {attacks.map((entry) => (
              <li key={entry.row.key}>
                <EnemyAttackRow
                  entry={entry}
                  state={state}
                  onSelect={onSelect}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.fleetEmpty}>No enemy attacks inbound.</p>
        )}
      </div>
    </section>
  )
}
