import { ErrorBannerMessage } from '../ui/error-banner'
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
import { usePlayerDisplay } from '../shell/player-profiles-context'
import { sameAlliance } from './player-alliance'
import { Users } from 'lucide-react'
import { InfoTooltip } from '../ui/info-tooltip'

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
  missileAction,
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
    opener?: HTMLElement | null,
  ) => void
  flights?: GalaxyFlight[]
  now?: number
  missileAction?: ReactNode
  espionage?: {
    send: () => void
    busy: boolean
    reason: string | null
    error: string | null
    notice?: string | null
  }
}) {
  const { body, debris, coordinates } = position
  const viewerProfile = usePlayerDisplay(player ?? '')
  const ownerProfile = usePlayerDisplay(body?.owner ?? '')
  const viewerAlliance = viewerProfile?.alliance
  const target = `[${coordinates.galaxy}:${coordinates.system}:${coordinates.position}]`
  const owned = body?.owner === player
  const allied = !owned && sameAlliance(viewerAlliance, ownerProfile?.alliance)
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
        allied && styles.allied,
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
              onHarvest={(opener) => onDraft(coordinates, 'Harvest', opener)}
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
              {allied && viewerAlliance && (
                <InfoTooltip
                  label="Your alliance"
                  description={`This player is a member of ${viewerAlliance.name} [${viewerAlliance.tag}], like you.`}
                  className={styles.allianceBadge}
                >
                  <Users size={13} aria-hidden="true" />
                  <span>Your alliance</span>
                </InfoTooltip>
              )}
              <GalaxyActivity activity={body.activity} />
            </div>
          )}
          <GalaxyFlightSummary flights={flights} now={now} target={target} />
          {espionage?.notice && (
            <ErrorBannerMessage>
              <p role="alert">
                Espionage at{' '}
                <CoordinateLink at={position.coordinates} origin={origin} /> ·{' '}
                {espionage.notice}
              </p>
            </ErrorBannerMessage>
          )}
        </div>
        {debris && (
          <GalaxyDebris
            debris={debris}
            target={target}
            onHarvest={
              actions.some(
                (action) => action.mission === 'Harvest' && !action.reason,
              )
                ? (opener) => onDraft(coordinates, 'Harvest', opener)
                : undefined
            }
          />
        )}
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
          {missileAction}
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
