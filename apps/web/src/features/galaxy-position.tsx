import { CoordinateLink } from './coordinate-link'
import { playerLabel, type PlayerNames } from './player-label'
import type { ReactNode } from 'react'
import type { components } from '../contracts'
import type { DispatchDraft } from './missions'
import styles from './galaxy.module.css'
import { BodyIllustration } from './body-illustration'
import type { colonizationStatus } from '../client-model/colonization'
import { dispatchFailure } from '../client-model/dispatch-validation'
import { classes } from '../ui/classes'
import type { GalaxyFlight } from '../client-model/galaxy-fleets'
import { GalaxyFlightSummary } from './galaxy-flight-summary'
import { GalaxyDebris } from './galaxy-debris'
import { GalaxySpyButton } from './galaxy-spy-button'
import { GalaxyActionMenu } from './galaxy-action-menu'
import {
  galaxyMissionActions,
  protectionExplanation,
  type GalaxyMissionCapabilities,
} from './galaxy-mission-actions'
import { GalaxyPlayerStatuses, GalaxyActivity } from './galaxy-player-status'

export function GalaxyPosition({
  position,
  player,
  playerNames,
  playerIdentity,
  missions,
  colony,
  origin,
  onDraft,
  flights = [],
  now,
  espionage,
}: {
  position: components['schemas']['GalaxyPosition4']
  playerNames?: PlayerNames
  playerIdentity?: ReactNode
  player: string | undefined
  missions: GalaxyMissionCapabilities
  colony: ReturnType<typeof colonizationStatus>
  origin: string
  onDraft: (
    coordinates: components['schemas']['Coordinates'],
    mission: DispatchDraft['mission'],
  ) => void
  flights?: GalaxyFlight[]
  now?: number
  espionage?: {
    send: () => void
    busy: boolean
    reason: string | null
    error: string | null
  }
}) {
  const { body, debris, coordinates } = position
  const target = `[${coordinates.galaxy}:${coordinates.system}:${coordinates.position}]`
  const owned = body?.owner === player
  const protectedTarget = !owned && body?.attack_blocker === 'BeginnerProtected'
  const canTarget = !!body && body.id !== origin
  const actions = galaxyMissionActions({
    position,
    player,
    origin,
    missions,
    colony,
  })
  const spyReason = protectedTarget
    ? protectionExplanation
    : body?.attack_blocker
      ? dispatchFailure(body.attack_blocker)
      : !body?.espionage_eligible
        ? 'Espionage unavailable'
        : espionage?.reason
  return (
    <article
      className={classes(
        styles.positionCard,
        !body && !debris && styles.empty,
        protectedTarget && styles.protected,
      )}
    >
      <div className={styles.positionSummary}>
        {body ? (
          <BodyIllustration
            body={{ ...body, coordinates }}
            className={styles.planet}
            sizes="40px"
          />
        ) : (
          <span className={styles.emptyOrbit} aria-hidden="true">
            {coordinates.position}
          </span>
        )}
        <div className={styles.planetInfo}>
          <div className={styles.planetTitle}>
            <strong>
              {body
                ? (body.name ?? (owned ? 'Your planet' : body.kind))
                : 'Empty position'}
            </strong>
            <CoordinateLink
              compact
              at={coordinates}
              target={body?.kind === 'Moon' ? 'moon' : 'planet'}
              known={{ owner: body?.owner, empty: !body, debris: !!debris }}
              className={styles.coordinates}
            />
          </div>
          {body && (
            <div className={styles.playerStatus}>
              <span
                className={classes(
                  styles.player,
                  body.inactivity === 'Inactive7' && styles.inactive,
                  body.inactivity === 'Inactive28' && styles.longInactive,
                  body.vacation && styles.vacation,
                )}
              >
                {playerIdentity ??
                  (owned ? 'You' : playerLabel(body.owner, playerNames))}
                <GalaxyPlayerStatuses
                  body={body}
                  protectedTarget={protectedTarget}
                />
              </span>
              {owned && <span className={styles.you}>You</span>}
              <GalaxyActivity activity={body.activity} />
            </div>
          )}
          <GalaxyFlightSummary flights={flights} now={now} target={target} />
          {espionage?.error && (
            <p className={styles.inlineError} role="alert">
              {espionage.error}
            </p>
          )}
        </div>
        {debris && <GalaxyDebris debris={debris} />}
        <div className={styles.quickActions}>
          {canTarget && !owned && (
            <GalaxySpyButton
              key={`${origin}:${body.id}`}
              name={body.name ?? target}
              reason={spyReason}
              busy={espionage?.busy}
              error={espionage?.error}
              onSend={() =>
                espionage ? espionage.send() : onDraft(coordinates, 'Espionage')
              }
            />
          )}
          <GalaxyActionMenu
            target={target}
            coordinates={coordinates}
            actions={actions}
            colonyNote={colony.reason ?? colony.warning}
            onDraft={onDraft}
          />
        </div>
      </div>
    </article>
  )
}
