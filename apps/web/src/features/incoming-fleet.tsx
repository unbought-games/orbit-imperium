import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { components } from '../contracts'
import { isHostileMission } from '../client-model/hostile-fleets'
import { Button } from '../ui/button'
import { Heading } from '../ui/typography'
import { NumberValue } from '../ui/number-value'
import { formatWholeNumber } from '../ui/whole-number'
import { CoordinateLink } from './coordinate-link'
import { PlayerName } from './player-name'
import {
  exactTime,
  incomingManifest,
  missionLocation,
} from './mission-presentation'
import { ShipComposition } from './ship-composition'
import { FleetFlightRoute } from './fleet-flight-route'
import { incomingFleetSummary } from './command-hud/fleet-summary'
import styles from './mission-fleets.module.css'

type S = components['schemas']

/** Render only coordinates and ship intelligence supplied by the viewer's snapshot. */
export function IncomingFleet({
  fleet,
  view,
  now,
  as: Container = 'article',
}: {
  fleet: S['IncomingMission4']
  view: S['BoundView4']
  now: number
  as?: 'article' | 'li'
}) {
  const [showShips, setShowShips] = useState(false)
  const shipsId = useId()
  const hostile = isHostileMission(fleet.mission)
  const target = [...view.bodies, ...view.destinations].find(
    (body) => body.id === fleet.target,
  )
  const count =
    fleet.ships.visibility === 'Unknown' ? null : BigInt(fleet.ships.total)
  return (
    <Container
      className={styles.card}
      data-flight-tone={hostile ? 'enemy' : 'peaceful'}
      aria-label={`Incoming ${fleet.mission.toLowerCase()} fleet`}
    >
      <header className={styles.heading}>
        <Heading
          level={3}
          className={styles.title}
          aria-label={`Incoming ${fleet.mission.toLowerCase()}${hostile ? ' · Hostile' : ''}`}
        >
          {fleet.mission} <span>Incoming{hostile ? ' · Hostile' : ''}</span>
        </Heading>
        <Button
          variant="ghost"
          padding="compact"
          className={styles.manifestToggle}
          aria-expanded={showShips}
          aria-controls={shipsId}
          aria-label={`Incoming ${fleet.mission} ship composition: ${count === null ? 'unknown' : `${formatWholeNumber(count)} ${count === 1n ? 'ship' : 'ships'}`}`}
          onClick={() => setShowShips(!showShips)}
        >
          {count === null ? (
            'Ship composition unknown'
          ) : (
            <>
              <NumberValue value={count} /> {count === 1n ? 'ship' : 'ships'}
            </>
          )}
          <ChevronDown size={12} aria-hidden="true" />
        </Button>
      </header>
      <div className={styles.flight} title={exactTime(fleet.arrival_at)}>
        <FleetFlightRoute row={incomingFleetSummary(view, fleet)} now={now} />
      </div>
      <p className={styles.sender}>
        From <PlayerName player={fleet.sender} names={view.player_names} />
      </p>
      <div id={shipsId} hidden={!showShips} className={styles.manifest}>
        {fleet.ships.visibility === 'Exact' ? (
          <ShipComposition ships={fleet.ships.ships} />
        ) : (
          <p>{incomingManifest(fleet.ships)}</p>
        )}
        <p className={styles.exactArrival}>
          Arrival:{' '}
          <time dateTime={new Date(fleet.arrival_at).toISOString()}>
            {exactTime(fleet.arrival_at)}
          </time>
        </p>
        <div className={styles.coordinateActions}>
          <CoordinateLink at={fleet.origin} label="origin" />
          <span
            className={styles.direction}
            role="img"
            aria-label="Travelling to destination"
          >
            →
          </span>
          {target ? (
            <CoordinateLink
              at={target.coordinates}
              target={target.kind === 'Moon' ? 'moon' : 'planet'}
              label="destination"
            >
              {missionLocation(view, target.id, target.coordinates)}
            </CoordinateLink>
          ) : (
            'Unrevealed location'
          )}
        </div>
      </div>
    </Container>
  )
}
