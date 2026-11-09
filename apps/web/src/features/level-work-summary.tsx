import type { ReactNode } from 'react'
import type { components } from '../contracts'
import type { buildingProgress } from '../client-model/building-progress'
import type { researchProgress } from '../client-model/research-progress'
import type { routeTarget } from '../shell/route-target'
import { label } from '../ui/format'
import { Link } from '../ui/link'
import { RefundAmounts } from './progression/active-work-details'
import {
  ActiveWorkCard,
  WorkCardFooter,
  WorkCardSurface,
  WorkTimer,
  WorkTimers,
} from './active-work-card'
import styles from './level-work-summary.module.css'

export function LevelWorkSummary({
  item,
  work,
  target,
  host,
  percent,
  cancel,
}: {
  item: components['schemas']['CatalogKey3']
  work: NonNullable<
    ReturnType<typeof buildingProgress> | ReturnType<typeof researchProgress>
  >
  target: ReturnType<typeof routeTarget>
  host: string | null
  percent: number | null
  cancel?: ReactNode
}) {
  const active = work.status === 'In progress'
  const verb =
    item.kind === 'Research'
      ? 'Researching now'
      : 'direction' in work && work.direction === 'down'
        ? 'Tearing down'
        : 'Upgrading now'
  const status = active
    ? work.secondsRemaining === null
      ? 'Awaiting confirmation'
      : verb
    : work.status
  return (
    <WorkCardSurface>
      <ActiveWorkCard
        item={item}
        status={status}
        title={
          <Link
            {...target}
            data-touch-control=""
            aria-label={`${label(item.id)} · Level ${work.targetLevel}`}
            aria-description={host ?? undefined}
          >
            {label(item.id)}
          </Link>
        }
        badge={`Level ${work.targetLevel}`}
        description={host}
        percent={percent}
        progressLabel={`${label(item.id)} estimated progress`}
        moving={active && work.secondsRemaining !== null}
      >
        <WorkTimers>
          <WorkTimer
            title={active ? 'Time remaining' : 'Estimated remaining'}
            value={work.countdown}
          />
          <WorkTimer
            title="Scheduled finish"
            value={
              <time dateTime={new Date(work.dueAt).toISOString()}>
                {new Date(work.dueAt).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
            }
          />
        </WorkTimers>
      </ActiveWorkCard>
      {cancel && (
        <WorkCardFooter>
          <span className={styles.refund}>
            Refund on cancel
            <RefundAmounts paid={work.paid} />
          </span>
          <span className={styles.action}>{cancel}</span>
        </WorkCardFooter>
      )}
    </WorkCardSurface>
  )
}
