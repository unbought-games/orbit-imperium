import { ResourceNumber } from './number-value'
import type { ReactNode } from 'react'
import { ResourceMark } from './resource-mark'
import { Popover } from './popover'
import { classes } from './classes'
import { formatCompactResource } from './compact-resource'
import styles from './resource-amount.module.css'

/** Shared resource image, amount, and accessible contextual details. */
export function ResourceAmount({
  resource,
  amount,
  variant = 'cost',
  warning = false,
  children,
}: {
  resource: 'metal' | 'crystal' | 'deuterium' | 'energy'
  amount: string
  variant?: 'cost' | 'stock'
  warning?: boolean
  children: ReactNode
}) {
  const title = resource[0].toUpperCase() + resource.slice(1)
  return (
    <Popover
      label={title}
      className={classes(
        styles.resource,
        styles[variant],
        styles[resource],
        warning && styles.warning,
      )}
      trigger={
        <>
          {variant === 'stock' ? (
            <ResourceMark
              resource={resource}
              className={styles.symbol}
              width={36}
              height={36}
              strokeWidth={1.3}
              aria-hidden="true"
            />
          ) : (
            <span className={styles.art} aria-hidden="true" />
          )}
          <span className={styles.amount}>
            {variant === 'cost' && (
              <ResourceMark resource={resource} width={18} height={18} />
            )}
            <strong>
              {variant === 'stock' ? (
                <span className={styles.compactAmount}>
                  {formatCompactResource(amount)}
                </span>
              ) : (
                <ResourceNumber value={amount} />
              )}
            </strong>
          </span>
        </>
      }
    >
      {children}
    </Popover>
  )
}
