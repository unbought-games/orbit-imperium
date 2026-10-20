import type { ReactNode } from 'react'
import { ResourceMark } from './resource-mark'
import { Popover } from './popover'
import { formatResource, formatExactResource } from './format'
import { classes } from './classes'
import styles from './resource-amount.module.css'

/** Shared resource image, amount, and accessible contextual details. */
export function ResourceAmount({
  resource,
  amount,
  variant = 'cost',
  rate,
  capacity,
  warning = false,
  children,
}: {
  resource: 'metal' | 'crystal' | 'deuterium' | 'energy'
  amount: string
  variant?: 'cost' | 'stock'
  capacity?: string
  rate?: string | null
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
            {variant === 'stock' && (
              <span className={styles.stockName}>{title}</span>
            )}
            <strong>
              {resource === 'energy' && variant === 'stock'
                ? formatExactResource(amount)
                : formatResource(amount)}
            </strong>
            {capacity !== undefined && (
              <span className={styles.capacity}>
                / {formatResource(capacity)}
              </span>
            )}
            {variant === 'stock' && warning && (
              <span className={styles.status}>
                {resource === 'energy'
                  ? 'Shortfall'
                  : BigInt(amount) > BigInt(capacity ?? amount)
                    ? 'Above capacity'
                    : 'Storage full'}
              </span>
            )}
            {rate !== undefined &&
              (rate === null ? variant !== 'stock' : BigInt(rate) !== 0n) && (
                <span className={styles.rate}>
                  {rate === null
                    ? '(—/h)'
                    : `(${BigInt(rate) > 0n ? '+' : ''}${formatResource(rate)}/h)`}
                </span>
              )}
          </span>
        </>
      }
    >
      {children}
    </Popover>
  )
}
