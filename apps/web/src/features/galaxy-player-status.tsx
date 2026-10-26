import { Moon, MoonStar, Palmtree, Shield } from 'lucide-react'
import type { components } from '../contracts'
import { InfoTooltip } from '../ui/info-tooltip'
import { classes } from '../ui/classes'
import styles from './galaxy.module.css'
import { protectionExplanation } from './galaxy-mission-actions'

type Body = NonNullable<components['schemas']['GalaxyPosition4']['body']>

/** Each independent status remains visible; vacation does not hide inactivity. */
export function GalaxyPlayerStatuses({
  body,
  protectedTarget,
}: {
  body: Body
  protectedTarget: boolean
}) {
  return (
    <span className={styles.statusIcons}>
      {body.inactivity !== 'Active' && (
        <InfoTooltip
          label={
            body.inactivity === 'Inactive28'
              ? 'Inactive for 28 days or more'
              : 'Inactive for 7 days or more'
          }
          description="This player has not been active during this period. Visiting fleets can still cause activity on their planets."
          className={
            body.inactivity === 'Inactive28'
              ? styles.longInactive
              : styles.inactive
          }
        >
          {body.inactivity === 'Inactive28' ? (
            <MoonStar size={14} aria-hidden="true" />
          ) : (
            <Moon size={14} aria-hidden="true" />
          )}
        </InfoTooltip>
      )}
      {body.vacation && (
        <InfoTooltip
          label="Vacation mode"
          description="This player is away. Attacks and espionage against them are unavailable."
          className={styles.vacation}
        >
          <Palmtree size={14} aria-hidden="true" />
        </InfoTooltip>
      )}
      {protectedTarget && (
        <InfoTooltip
          label="Beginner protection"
          description={protectionExplanation}
          className={styles.protectionBadge}
        >
          <Shield size={14} aria-hidden="true" />
        </InfoTooltip>
      )}
    </span>
  )
}

export function GalaxyActivity({ activity }: { activity: Body['activity'] }) {
  if (activity.type === 'None') return null
  const recent = activity.type === 'Recent'
  return (
    <InfoTooltip
      label={
        recent
          ? 'Activity within the last 15 minutes'
          : `${activity.minutes} minutes since activity`
      }
      description="Activity on this planet, including player actions or visiting fleets. This does not necessarily mean the player is online."
      className={classes(styles.activity, recent && styles.recent)}
    >
      <span aria-hidden="true">{recent ? '●' : `${activity.minutes}m`}</span>
    </InfoTooltip>
  )
}
