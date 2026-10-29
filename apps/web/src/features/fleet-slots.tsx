import { Rocket } from 'lucide-react'
import { NumberValue } from '../ui/number-value'
import { InfoTooltip } from '../ui/info-tooltip'
import { classes } from '../ui/classes'
import styles from './fleet-slots.module.css'

/** Empire-wide usage, including returning fleets and pending departures. */
export function FleetSlots({
  used,
  total,
  compact = false,
  className,
}: {
  used: number
  total: string
  compact?: boolean
  className?: string
}) {
  return (
    <InfoTooltip
      label={`Fleet slots: ${used} used / ${total} total`}
      description="Used slots out of total fleet capacity. Outbound and returning fleets, including pending departures, occupy slots."
      className={classes(styles.slots, compact && styles.compact, className)}
    >
      {!compact && <span className={styles.label}>Fleet slots</span>}
      <span className={styles.usage}>
        <Rocket size={14} aria-hidden="true" />
        <strong>
          <NumberValue value={used} />
          <span className={styles.total}>
            {' '}
            / <NumberValue value={total} />
          </span>
        </strong>
      </span>
    </InfoTooltip>
  )
}
