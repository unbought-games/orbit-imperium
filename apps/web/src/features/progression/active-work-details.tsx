import { useLayoutEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { Clock3 } from 'lucide-react'
import type { components } from '../../contracts'
import { formatDuration } from '../../client-model/duration'
import { ResourceNumber } from '../../ui/number-value'
import { Popover } from '../../ui/popover'
import { DetailRow } from './detail-layout'
import { DetailResourceValue } from './detail-metrics'
import styles from './detail-layout.module.css'

export function RefundAmounts({
  paid,
}: {
  paid: components['schemas']['Resources']
}) {
  const resources = (['metal', 'crystal', 'deuterium'] as const).filter(
    (resource) => BigInt(paid[resource]) > 0n,
  )
  return (
    <span
      className={styles.refundAmounts}
      role="group"
      aria-label="Cancellation refund"
    >
      {resources.length
        ? resources.map((resource) => (
            <DetailResourceValue key={resource} resource={resource}>
              <ResourceNumber value={paid[resource]} />
            </DetailResourceValue>
          ))
        : 'None'}
    </span>
  )
}

/** Construction and research share the same active-work reading order. */
export function ActiveWorkDetails({
  label,
  title,
  accessibleTitle,
  secondsRemaining,
  dueAt,
  status,
  paid,
  children,
}: {
  label: string
  title: ReactNode
  accessibleTitle: string
  secondsRemaining: number | null
  dueAt: number
  status: string
  paid: components['schemas']['Resources']
  children: ReactNode
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  useLayoutEffect(() => {
    heading.current?.focus({ preventScroll: true })
  }, [])
  const pending = status === 'Confirming' || status === 'Awaiting confirmation'
  return (
    <section className={styles.activeWork} aria-label={label}>
      <h3 ref={heading} tabIndex={-1} aria-label={accessibleTitle}>
        {title}
      </h3>
      <dl className={styles.compare}>
        {status !== 'In progress' && (
          <DetailRow label="Status">
            {status === 'Cancelling'
              ? 'Cancelling…'
              : pending
                ? 'Confirming start…'
                : status}
          </DetailRow>
        )}
        <DetailRow label={pending ? 'Estimated remaining' : 'Time remaining'}>
          <Popover
            label="Completion time"
            className={styles.metricTrigger}
            trigger={
              <span className={styles.resourceValue}>
                <Clock3 size={16} aria-hidden="true" />
                <strong>
                  {secondsRemaining === null
                    ? pending
                      ? 'Checking start…'
                      : 'Checking completion…'
                    : formatDuration(secondsRemaining * 1000)}
                </strong>
              </span>
            }
          >
            <p>
              Scheduled finish:{' '}
              <time dateTime={new Date(dueAt).toISOString()}>
                {new Date(dueAt).toLocaleString(undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </time>
              .
            </p>
            <p>
              {pending
                ? 'The start request has not been confirmed yet. This time is an estimate.'
                : secondsRemaining === null
                  ? 'The timer has ended. Waiting for the game to report completion; the level updates when that result arrives.'
                  : 'Time remaining until the scheduled finish. The level updates once the game reports completion.'}
            </p>
          </Popover>
        </DetailRow>
        <DetailRow label="Refund on cancel">
          <Popover
            label="Cancellation refund"
            className={styles.metricTrigger}
            trigger={<RefundAmounts paid={paid} />}
          >
            <p>
              All paid resources are returned if cancellation succeeds before
              completion. Progress on this level is lost.
            </p>
          </Popover>
        </DetailRow>
      </dl>
      {children}
    </section>
  )
}
