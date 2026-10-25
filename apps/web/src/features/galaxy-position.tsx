import { CoordinateLink } from './coordinate-link'
import { playerLabel, type PlayerNames } from './player-label'
import { NumberValue } from '../ui/number-value'
import { ResourceValue } from '../ui/resource-value'
import {
  Truck,
  Crosshair,
  Eye,
  Recycle,
  ChevronDown,
  Shield,
  Navigation,
} from 'lucide-react'
import type { ReactNode } from 'react'
import type { components } from '../contracts'
import type { DispatchDraft } from './missions'
import { Button } from '../ui/button'
import styles from './galaxy.module.css'
import { BodyIllustration } from './body-illustration'
import type { colonizationStatus } from '../client-model/colonization'
import { dispatchFailure } from '../client-model/dispatch-validation'
import { classes } from '../ui/classes'
import { arrivalCountdown } from './mission-presentation'
import type { GalaxyFlight } from '../client-model/galaxy-fleets'

const protectionExplanation =
  'Beginner protection blocks attacks and espionage between you and this player because of the difference in empire strength.'

export function GalaxyPosition({
  position,
  player,
  playerNames,
  playerIdentity,
  canAttack,
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
  canAttack: boolean
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
  const attackReason = protectedTarget
    ? protectionExplanation
    : body?.attack_blocker
      ? dispatchFailure(body.attack_blocker)
      : !canAttack
        ? 'Attack unavailable in this universe'
        : undefined
  const canTarget = !!body && body.id !== origin
  const actionable = canTarget || !!debris || !body
  const content = (
    <>
      <span className={styles.planetCell}>
        {body && (
          <BodyIllustration
            body={{ ...body, coordinates }}
            className={styles.planet}
            sizes="(max-width: 599px) 36px, 48px"
          />
        )}
        <span className={styles.planetInfo}>
          <span className={styles.planetTitle}>
            <CoordinateLink
              at={coordinates}
              target={body?.kind === 'Moon' ? 'moon' : 'planet'}
              known={{ owner: body?.owner, empty: !body, debris: !!debris }}
              className={styles.coordinates}
            />{' '}
            <strong title={!body ? 'Empty position' : undefined}>
              {body
                ? (body.name ?? (owned ? 'Your planet' : body.kind))
                : 'Empty position'}
            </strong>
          </span>
          {body && (
            <span className={styles.playerStatus}>
              <span
                className={owned ? styles.yourPlayer : styles.player}
                title={owned ? 'You' : playerLabel(body.owner, playerNames)}
              >
                {playerIdentity ??
                  (owned ? 'You' : playerLabel(body.owner, playerNames))}
              </span>
              <small>
                {body.inactivity === 'Active'
                  ? 'Active'
                  : body.inactivity === 'Inactive7'
                    ? 'Inactive · 7 days'
                    : 'Inactive · 28 days'}
                {body.vacation ? ' · Vacation' : ''}
              </small>
              {body.activity.type !== 'None' && (
                <small
                  title={
                    body.activity.type === 'Recent'
                      ? 'Activity within the last 15 minutes'
                      : `${body.activity.minutes} minutes since activity`
                  }
                  className={
                    body.activity.type === 'Recent' ? styles.recent : undefined
                  }
                >
                  {body.activity.type === 'Minutes'
                    ? `${body.activity.minutes}m`
                    : body.activity.type === 'Recent'
                      ? '● <15m'
                      : ''}
                </small>
              )}
            </span>
          )}
          {protectedTarget && (
            <span className={styles.protectionBadge}>
              <Shield size={14} aria-hidden="true" />
              Beginner protection
            </span>
          )}
          {flights.length > 0 && (
            <span
              className={styles.flights}
              role="status"
              aria-label={`Your fleets to ${target}`}
            >
              {flights.map((flight) => (
                <span key={flight.id}>
                  <Navigation size={13} aria-hidden="true" />
                  {flight.mission} {flight.phase}
                  {flight.dueAt !== null && now !== undefined && (
                    <> · {arrivalCountdown(flight.dueAt, now)}</>
                  )}
                </span>
              ))}
            </span>
          )}
        </span>
      </span>
      <span className={styles.debris}>
        {debris ? (
          <>
            <strong>Debris field</strong>
            {/* Galaxy debris is already in whole units, unlike report Resources. */}
            <span>
              <ResourceValue resource="metal">
                <NumberValue value={debris.metal} />
              </ResourceValue>
            </span>
            <span>
              <ResourceValue resource="crystal">
                <NumberValue value={debris.crystal} />
              </ResourceValue>
            </span>
          </>
        ) : body ? (
          <small>No debris</small>
        ) : null}
        {actionable && (
          <ChevronDown className={styles.expand} size={16} aria-hidden="true" />
        )}
      </span>
      {protectedTarget && (
        <small className={styles.protectionNote}>{protectionExplanation}</small>
      )}
    </>
  )
  if (!actionable)
    return (
      <div
        className={classes(
          styles.positionCard,
          owned && styles.owned,
          !body && !debris && styles.empty,
        )}
      >
        <div className={styles.positionSummary}>{content}</div>
      </div>
    )
  return (
    <details
      className={classes(
        styles.positionCard,
        owned && styles.owned,
        !body && !debris && styles.empty,
        protectedTarget && styles.protected,
      )}
      name="galaxy-position"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && event.currentTarget.open) {
          event.preventDefault()
          event.currentTarget.open = false
          event.currentTarget.querySelector('summary')?.focus()
        }
      }}
    >
      <summary
        className={styles.positionSummary}
        aria-label={`Actions for ${body ? body.kind.toLowerCase() : 'position'} ${target}`}
      >
        {content}
      </summary>
      <div
        className={styles.actions}
        role="group"
        aria-label={`Missions to ${target}`}
      >
        {canTarget && (
          <>
            <Button onClick={() => onDraft(coordinates, 'Transport')}>
              <Truck size={16} aria-hidden="true" />
              Transport
            </Button>
            {owned && colony.enabled && (
              <Button onClick={() => onDraft(coordinates, 'Deploy')}>
                Deploy
              </Button>
            )}
            {!owned && (
              <>
                <Button
                  disabled={!!attackReason}
                  title={attackReason}
                  onClick={() => onDraft(coordinates, 'Attack')}
                >
                  <Crosshair size={16} aria-hidden="true" />
                  Attack
                </Button>
                <Button
                  disabled={
                    protectedTarget ||
                    !body.espionage_eligible ||
                    !!espionage?.reason ||
                    espionage?.busy
                  }
                  title={
                    protectedTarget
                      ? protectionExplanation
                      : body.espionage_eligible
                        ? (espionage?.reason ?? 'Send one espionage probe')
                        : 'Espionage unavailable'
                  }
                  onClick={() =>
                    espionage
                      ? espionage.send()
                      : onDraft(coordinates, 'Espionage')
                  }
                >
                  <Eye size={16} aria-hidden="true" />
                  {espionage?.busy ? 'Sending probe…' : 'Espionage'}
                </Button>
              </>
            )}
          </>
        )}
        {espionage?.error && <p role="alert">{espionage.error}</p>}
        {!owned &&
          body?.espionage_eligible &&
          espionage?.reason &&
          !espionage.busy &&
          !espionage.error && <p role="status">{espionage.reason}</p>}
        {!body && (
          <>
            <Button onClick={() => onDraft(coordinates, 'Colonize')}>
              Colonize
            </Button>
            <p>
              {colony.reason ?? colony.warning} Requires at least one Colony
              Ship.
            </p>
          </>
        )}
        {debris && (
          <Button onClick={() => onDraft(coordinates, 'Harvest')}>
            <Recycle size={16} aria-hidden="true" />
            Harvest
          </Button>
        )}
      </div>
    </details>
  )
}
