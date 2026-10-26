import { Orbit, Radar } from 'lucide-react'
import type { components } from '../contracts'
import type { LocationKind } from '../shell/location-address'
import { BodyIllustration } from './body-illustration'
import { CoordinateLink } from './coordinate-link'
import { playerLabel, type PlayerNames } from './player-label'
import type { destinationBody } from './dispatch-destination'
import styles from './missions.module.css'

export function DispatchDestinationPreview({
  coordinates,
  kind,
  target,
  lookup,
  player,
  playerNames,
  partial,
}: {
  coordinates: components['schemas']['Coordinates'] | null
  kind: LocationKind
  target: ReturnType<typeof destinationBody>
  lookup: 'loading' | 'ready' | 'unavailable'
  player: string
  playerNames: PlayerNames
  partial: boolean
}) {
  const title = !coordinates
    ? partial
      ? 'Complete your destination'
      : 'Where are we heading?'
    : kind === 'debris'
      ? 'Debris field'
      : target
        ? target.name || target.kind
        : lookup === 'loading'
          ? 'Looking up destination…'
          : lookup === 'unavailable'
            ? 'Destination unavailable'
            : kind === 'moon'
              ? 'Moon not observed'
              : 'Empty position'
  const detail = !coordinates
    ? 'Enter valid coordinates or choose one of your planets.'
    : target
      ? `${target.kind} · ${target.owner === player ? 'Your colony' : playerLabel(target.owner, playerNames)}`
      : kind === 'debris'
        ? 'Review verifies salvage at these coordinates.'
        : lookup === 'loading'
          ? 'Checking the current system observation.'
          : lookup === 'unavailable'
            ? 'System lookup failed. Review will check the destination again.'
            : kind === 'moon'
              ? 'Review verifies whether a moon is available here.'
              : 'No planet in the current system observation.'
  return (
    <div
      className={styles.destinationPreview}
      aria-label="Destination preview"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className={styles.destinationArt} aria-hidden="true">
        {target && coordinates ? (
          <BodyIllustration
            body={{ ...target, coordinates }}
            className={styles.destinationWorld}
            sizes="112px"
          />
        ) : kind === 'debris' && coordinates ? (
          <Orbit />
        ) : (
          <Radar />
        )}
      </div>
      <div className={styles.destinationIdentity}>
        <span className={styles.destinationEyebrow}>Destination</span>
        <strong className={styles.destinationName}>{title}</strong>
        {coordinates && (
          <CoordinateLink
            at={coordinates}
            target={kind}
            compact
            known={{ owner: target?.owner }}
          />
        )}
        <span className={styles.destinationDetail}>{detail}</span>
      </div>
    </div>
  )
}
