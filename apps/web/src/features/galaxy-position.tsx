import { playerLabel, type PlayerNames } from './player-label'
import { ResourceNumber } from '../ui/number-value'
import {
  Truck,
  Crosshair,
  Eye,
  Recycle,
  ChevronDown,
  Shield,
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
}) {
  const { body, debris, coordinates } = position
  const owned = body?.owner === player
  const protectedTarget = !owned && body?.attack_blocker === 'BeginnerProtected'
  const attackReason = protectedTarget
    ? protectionExplanation
    : body?.attack_blocker
      ? dispatchFailure(body.attack_blocker)
      : !canAttack
        ? 'Attack unavailable in this universe'
        : undefined
  const target = `[${coordinates.galaxy}:${coordinates.system}:${coordinates.position}]`
  const canTarget = !!body && body.id !== origin
  const actionable = canTarget || !!debris || (!body && colony.enabled)
  const content = (
    <>
      <span className={styles.planetCell}>
        {body && (
          <BodyIllustration
            body={{ ...body, coordinates }}
            className={styles.planet}
            sizes="(max-width: 599px) 64px, 96px"
          />
        )}
        <span className={styles.planetInfo}>
          <strong>
            {body
              ? (body.name ?? (owned ? 'Your planet' : body.kind))
              : 'Empty position'}
          </strong>
          <span className={styles.coordinates}>{target}</span>
          {body && (
            <>
              <span className={owned ? styles.yourPlayer : styles.player}>
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
              {protectedTarget && (
                <span className={styles.protectionBadge}>
                  <Shield size={14} aria-hidden="true" />
                  Beginner protection
                </span>
              )}
              {body.activity.type !== 'None' && (
                <small
                  className={
                    body.activity.type === 'Recent' ? styles.recent : undefined
                  }
                >
                  {body.activity.type === 'Minutes'
                    ? `${body.activity.minutes}m activity`
                    : body.activity.type === 'Recent'
                      ? '● Recent activity'
                      : ''}
                </small>
              )}
            </>
          )}
        </span>
      </span>
      <span className={styles.debris}>
        {debris ? (
          <>
            <strong>Debris field</strong>
            <span>
              <ResourceNumber value={debris.metal} /> <small>metal</small>
            </span>
            <span>
              <ResourceNumber value={debris.crystal} /> <small>crystal</small>
            </span>
          </>
        ) : (
          <small>No debris</small>
        )}
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
      <div className={`${styles.positionCard} ${owned ? styles.owned : ''}`}>
        <div className={styles.positionSummary}>{content}</div>
      </div>
    )
  return (
    <details
      className={classes(
        styles.positionCard,
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
                  disabled={protectedTarget || !body.espionage_eligible}
                  title={
                    protectedTarget
                      ? protectionExplanation
                      : body.espionage_eligible
                        ? undefined
                        : 'Espionage unavailable'
                  }
                  onClick={() => onDraft(coordinates, 'Espionage')}
                >
                  <Eye size={16} aria-hidden="true" />
                  Espionage
                </Button>
              </>
            )}
          </>
        )}
        {!body && colony.enabled && (
          <>
            <Button
              disabled={!!colony.reason}
              onClick={() => onDraft(coordinates, 'Colonize')}
            >
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
