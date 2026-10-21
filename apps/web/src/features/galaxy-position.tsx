import { ResourceNumber } from '../ui/number-value'
import { Truck, Crosshair, Eye, Recycle, ChevronDown } from 'lucide-react'
import type { components } from '../contracts'
import type { DispatchDraft } from './missions'
import { Button } from '../ui/button'
import styles from './galaxy.module.css'
import { BodyIllustration } from './body-illustration'

export function GalaxyPosition({
  position,
  player,
  canAttack,
  onDraft,
}: {
  position: components['schemas']['GalaxyPosition4']
  player: string | undefined
  canAttack: boolean
  onDraft: (
    coordinates: components['schemas']['Coordinates'],
    mission: DispatchDraft['mission'],
  ) => void
}) {
  const { body, debris, coordinates } = position
  const owned = body?.owner === player
  const target = `[${coordinates.galaxy}:${coordinates.system}:${coordinates.position}]`
  const canTarget = !!body && !owned
  const actionable = canTarget || !!debris
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
            {body ? (owned ? 'Your planet' : body.kind) : 'Empty position'}
          </strong>
          <span className={styles.coordinates}>{target}</span>
          {body && (
            <>
              <span className={owned ? styles.yourPlayer : styles.player}>
                {owned ? 'You' : `Player ${body.owner.slice(0, 8)}`}
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
      className={styles.positionCard}
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
            <Button
              disabled={!canAttack}
              title={
                canAttack ? undefined : 'Attack unavailable in this universe'
              }
              onClick={() => onDraft(coordinates, 'Attack')}
            >
              <Crosshair size={16} aria-hidden="true" />
              Attack
            </Button>
            <Button
              disabled={!body.espionage_eligible}
              title={
                body.espionage_eligible ? undefined : 'Espionage unavailable'
              }
              onClick={() => onDraft(coordinates, 'Espionage')}
            >
              <Eye size={16} aria-hidden="true" />
              Espionage
            </Button>
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
