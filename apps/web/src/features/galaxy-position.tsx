import { ErrorBannerMessage } from '../ui/error-banner'
import { CoordinateLink } from './coordinate-link'
import { playerLabel, type PlayerNames } from './player-label'
import type { ComponentProps, ReactNode } from 'react'
import type { components } from '../contracts'
import type { DispatchDraft } from './missions'
import styles from './galaxy.module.css'
import { BodyIllustration } from './body-illustration'
import type { colonizationStatus } from '../client-model/colonization'
import { dispatchFailure } from '../client-model/dispatch-validation'
import { classes } from '../ui/classes'
import type { GalaxyFlight } from '../client-model/galaxy-fleets'
import { GalaxyFlightSummary } from './galaxy-flight-summary'
import { GalaxyMoon } from './galaxy-moon'
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
import { Button } from '../ui/button'

export function GalaxyPosition({
  position,
  readOnly = false,
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
  moonEspionage,
  missileAction,
  scanAction,
}: {
  scanAction?: ReactNode
  readOnly?: boolean
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
    targetKind?: DispatchDraft['targetKind'],
  ) => void
  flights?: GalaxyFlight[]
  now?: number
  missileAction?: ComponentProps<typeof GalaxyActionMenu>['missileAction']
  espionage?: {
    count?: string
    send: () => void
    busy: boolean
    paused?: boolean
    reason: string | null
    error: string | null
    notice?: string | null
  }
  moonEspionage?: {
    count?: string
    send: () => void
    busy: boolean
    paused?: boolean
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
        !body && !position.abandoned_until && !debris && styles.empty,
        protectedTarget && styles.protected,
        allied && styles.allied,
      )}
    >
      <div className={styles.positionSummary}>
        <div className={styles.planetTarget}>
          {!readOnly && (
            <GalaxyActionMenu
              triggerElement={
                <Button variant="ghost" className={styles.planetMenuTrigger}>
                  <span className={styles.srOnly}>Actions for {target}</span>
                </Button>
              }
              missileIdentity={`${origin}:${body?.id}:${body?.owner}`}
              target={target}
              coordinates={coordinates}
              actions={actions}
              details={body?.name}
              missileAction={missileAction}
              quickSpy={
                canTarget && !owned
                  ? {
                      send: () =>
                        espionage
                          ? espionage.send()
                          : onDraft(coordinates, 'Espionage'),
                      disabled:
                        !!spyReason || espionage?.busy || espionage?.paused,
                      reason: spyReason,
                      count: espionage?.count,
                    }
                  : undefined
              }
              colonyNote={colony.reason ?? colony.warning}
              onDraft={onDraft}
            />
          )}
          {body ? (
            <BodyIllustration
              body={{ ...body, coordinates }}
              className={styles.planet}
              sizes="40px"
            />
          ) : position.abandoned_until ? (
            <BodyIllustration
              body={{ kind: 'AbandonedPlanet' }}
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
              <strong title={body?.name ?? undefined}>
                {body
                  ? (body.name ?? (owned ? 'Your planet' : body.kind))
                  : position.abandoned_until
                    ? 'Abandoned planet'
                    : 'Empty position'}
              </strong>
              {body && <GalaxyActivity activity={body.activity} />}
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
                  <span className={styles.playerName}>
                    {playerIdentity ??
                      (owned ? 'You' : playerLabel(body.owner, playerNames))}
                  </span>
                  <GalaxyPlayerStatuses
                    body={body}
                    protectedTarget={protectedTarget}
                  />
                </span>
                {allied && viewerAlliance && (
                  <InfoTooltip
                    inline
                    label="Your alliance"
                    description={`This player is a member of ${viewerAlliance.name} [${viewerAlliance.tag}], like you.`}
                    className={styles.allianceBadge}
                  >
                    <Users size={13} aria-hidden="true" />
                    <span>Your alliance</span>
                  </InfoTooltip>
                )}
              </div>
            )}
            <CoordinateLink
              at={coordinates}
              target={body?.kind === 'Moon' ? 'moon' : 'planet'}
              known={{
                owner: body?.owner,
                empty: !body && !position.abandoned_until,
                abandoned: !!position.abandoned_until,
                debris: !!debris,
              }}
              onHarvest={(opener) => onDraft(coordinates, 'Harvest', opener)}
              className={styles.coordinates}
            />
            {moonEspionage?.error && (
              <ErrorBannerMessage>
                <p role="alert">
                  Espionage at moon{' '}
                  <CoordinateLink
                    at={position.coordinates}
                    origin={origin}
                    target="moon"
                  />{' '}
                  · {moonEspionage.error}
                </p>
              </ErrorBannerMessage>
            )}
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
        </div>
        {position.moon && (
          <GalaxyMoon
            position={position}
            player={player}
            origin={origin}
            missions={missions}
            colony={colony}
            readOnly={readOnly}
            onDraft={onDraft}
            espionage={moonEspionage}
          />
        )}
        {debris && (
          <GalaxyDebris
            debris={debris}
            target={target}
            coordinates={coordinates}
            onHarvest={
              actions.some(
                (action) => action.mission === 'Harvest' && !action.reason,
              ) && !readOnly
                ? (opener) => onDraft(coordinates, 'Harvest', opener)
                : undefined
            }
          />
        )}
        <GalaxyFlightSummary flights={flights} now={now} target={target} />
        {!readOnly && (
          <div className={styles.quickActions}>
            {canTarget && !owned && (
              <GalaxySpyButton
                count={espionage?.count}
                key={`${origin}:${body.id}`}
                name={body.name ?? target}
                reason={spyReason}
                busy={espionage?.busy}
                paused={espionage?.paused}
                error={espionage?.error}
                onSend={() =>
                  espionage
                    ? espionage.send()
                    : onDraft(coordinates, 'Espionage')
                }
              />
            )}
            {scanAction && (
              <span className={styles.scanAction}>{scanAction}</span>
            )}
          </div>
        )}
      </div>
    </article>
  )
}
