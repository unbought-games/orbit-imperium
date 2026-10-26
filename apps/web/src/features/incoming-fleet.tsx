import { ArrowDownLeft, ShieldAlert } from 'lucide-react'
import type { components } from '../contracts'
import { isHostileMission } from '../client-model/hostile-fleets'
import { Heading, Text } from '../ui/typography'
import { CoordinateLink } from './coordinate-link'
import { PlayerName } from './player-name'
import {
  arrivalCountdown,
  exactTime,
  incomingManifest,
  missionLocation,
} from './mission-presentation'
import { ShipComposition } from './ship-composition'
import styles from './incoming-fleet.module.css'

type S = components['schemas']

/** Render only coordinates and ship intelligence supplied by the viewer's snapshot. */
export function IncomingFleet({
  fleet,
  view,
  now,
}: {
  fleet: S['IncomingMission4']
  view: S['BoundView4']
  now: number
}) {
  const hostile = isHostileMission(fleet.mission)
  const target = [...view.bodies, ...view.destinations].find(
    (body) => body.id === fleet.target,
  )
  const Icon = hostile ? ShieldAlert : ArrowDownLeft
  return (
    <article
      className={`${styles.row} ${hostile ? styles.hostile : ''}`}
      aria-label={`Incoming ${fleet.mission.toLowerCase()} fleet`}
    >
      <div className={styles.details}>
        <Heading level={3} className={styles.heading}>
          <Icon size={18} aria-hidden="true" />
          Incoming {fleet.mission.toLowerCase()}
          {hostile ? ' · Hostile' : ''}
        </Heading>
        <Text>
          From <PlayerName player={fleet.sender} names={view.player_names} />
        </Text>
        <Text>
          <CoordinateLink at={fleet.origin} label="origin" />
          {' → '}
          {target ? (
            <CoordinateLink at={target.coordinates} label="destination">
              {missionLocation(view, target.id, target.coordinates)}
            </CoordinateLink>
          ) : (
            'Unrevealed location'
          )}
        </Text>
        {fleet.ships.visibility === 'Exact' ? (
          <ShipComposition ships={fleet.ships.ships} />
        ) : (
          <Text>{incomingManifest(fleet.ships)}</Text>
        )}
      </div>
      <div className={styles.arrival}>
        <span>Arrival in</span>
        <strong>{arrivalCountdown(fleet.arrival_at, now)}</strong>
        <time dateTime={new Date(fleet.arrival_at).toISOString()}>
          {exactTime(fleet.arrival_at)}
        </time>
      </div>
    </article>
  )
}
