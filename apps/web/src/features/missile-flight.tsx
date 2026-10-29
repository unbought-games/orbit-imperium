import type { ReactNode } from 'react'
import { ShieldAlert } from 'lucide-react'
import type { components } from '../contracts'
import { Heading, Text } from '../ui/typography'
import { NumberValue } from '../ui/number-value'
import { CoordinateLink } from './coordinate-link'
import { PlayerName } from './player-name'
import {
  arrivalCountdown,
  exactTime,
  missionLocation,
} from './mission-presentation'
import styles from './missions.module.css'
import incomingStyles from './incoming-fleet.module.css'
type S = components['schemas']
export function MissileFlight({
  flight,
  view,
  now,
  children,
}: {
  flight: S['MissileFlightView4']
  view: S['BoundView4']
  now: number
  children?: ReactNode
}) {
  const outgoing = flight.outgoing
  const facts = (
    <>
      <div className={outgoing ? undefined : incomingStyles.details}>
        <Heading
          level={3}
          className={outgoing ? styles.missionTitle : incomingStyles.heading}
        >
          {!outgoing && <ShieldAlert size={18} aria-hidden="true" />}
          {outgoing
            ? 'Your missile attack · Outbound'
            : 'Incoming missile attack · Hostile'}
        </Heading>
        {!outgoing && (
          <Text>
            From{' '}
            <PlayerName player={flight.attacker} names={view.player_names} />
          </Text>
        )}
        <Text>
          <NumberValue value={flight.count} /> Interplanetary Missiles
        </Text>
        <Text>
          <CoordinateLink at={flight.origin} label="origin" />
          {' → '}
          <CoordinateLink
            at={flight.target}
            target={flight.target_kind === 'Moon' ? 'moon' : 'planet'}
            label="destination"
          >
            {missionLocation(view, flight.target_body, flight.target)}
          </CoordinateLink>
        </Text>
        {outgoing && <Text>Cannot be recalled.</Text>}
      </div>
      <div className={outgoing ? styles.arrival : incomingStyles.arrival}>
        <span>Impact in</span>
        <strong>{arrivalCountdown(flight.arrival_at, now)}</strong>
        <time dateTime={new Date(flight.arrival_at).toISOString()}>
          {exactTime(flight.arrival_at)}
        </time>
      </div>
    </>
  )
  return (
    <article
      aria-label={
        outgoing ? 'Outgoing missile attack' : 'Incoming missile attack'
      }
      className={
        outgoing
          ? styles.fleet
          : `${incomingStyles.row} ${incomingStyles.hostile}`
      }
    >
      {outgoing ? <div className={styles.missionFacts}>{facts}</div> : facts}
      {children && <div className={styles.actions}>{children}</div>}
    </article>
  )
}
