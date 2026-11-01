import { ArrowRight, Radar } from 'lucide-react'
import type { manufacturingQueue } from '../client-model/manufacturing-queue'
import { manufacturingQueueCompletion } from '../client-model/manufacturing-queue'
import { resolveCatalogArt } from '../ui/artwork'
import { label } from '../ui/format'
import { NumberValue } from '../ui/number-value'
import { VisuallyHidden } from '../ui/visually-hidden'
import { Popover } from '../ui/popover'
import { manufacturingSummary } from './manufacturing-summary-model'
import styles from './manufacturing-summary.module.css'
import {
  ActiveWorkCard,
  WorkCardSurface,
  WorkTimer as Timer,
  WorkTimers,
} from './active-work-card'

type Batch = ReturnType<typeof manufacturingQueue>[number]

function UnitArt({ batch, size }: { batch: Batch; size: number }) {
  const art = resolveCatalogArt(batch.item)
  return (
    <img
      src={art.thumbnail}
      srcSet={art.srcSet}
      sizes={`${size}px`}
      width={size}
      height={size}
      alt=""
    />
  )
}

export function ManufacturingSummary({
  queue,
  now,
  countdown,
}: {
  queue: ReturnType<typeof manufacturingQueue>
  now: number
  countdown: (deadline: number) => string
}) {
  const { current, upcoming, percent } = manufacturingSummary(queue, now)
  const completion = manufacturingQueueCompletion(queue)
  const time = (due: number | undefined) =>
    due === undefined
      ? 'Awaiting confirmation'
      : countdown(due).replace(' remaining', '')
  if (!current) return null
  const producing = current.status === 'Producing'
  const waiting = producing && time(current.due) === 'Awaiting confirmation'
  return (
    <WorkCardSurface>
      <ol className={styles.queue} aria-label="Manufacturing queue">
        <li>
          <ActiveWorkCard
            item={current.item}
            status={
              waiting
                ? 'Awaiting confirmation'
                : producing
                  ? 'Building now'
                  : current.status === 'Queued'
                    ? 'Up next'
                    : current.status
            }
            badge={
              <span title="Units remaining">
                <NumberValue value={current.remaining} />
                <VisuallyHidden> remaining</VisuallyHidden>
              </span>
            }
            percent={percent}
            progressLabel={`${label(current.item.id)} next unit estimated progress`}
            moving={producing && !waiting}
          >
            <WorkTimers>
              <Timer
                title={producing ? 'Next unit' : 'Starts in'}
                value={time(current.due)}
              />
              <Timer title="This order" value={time(current.finalDue)} />
              <Timer title="Entire queue" value={time(completion)} total />
            </WorkTimers>
          </ActiveWorkCard>
        </li>
        {upcoming.length > 0 && (
          <li className={styles.upcoming}>
            <div className={styles.queueHeading}>
              <span>
                <ArrowRight size={16} aria-hidden="true" />
                Up next
              </span>
              <span>
                {upcoming.length} {upcoming.length === 1 ? 'order' : 'orders'}
              </span>
            </div>
            <ol className={styles.orders} aria-label="Upcoming orders">
              {upcoming.map((batch, index) => (
                <li key={batch.id}>
                  <Popover
                    label={`${label(batch.item.id)} · ${batch.remaining} remaining`}
                    className={`${styles.order} ${batch.due === undefined ? styles.pending : ''}`}
                    trigger={
                      <>
                        <UnitArt batch={batch} size={48} />
                        <span className={styles.quantity}>
                          ×<NumberValue value={batch.remaining} />
                        </span>
                        {index === 0 && (
                          <span
                            className={styles.nextMark}
                            aria-hidden="true"
                          />
                        )}
                      </>
                    }
                  >
                    <div className={styles.orderDetails}>
                      <span>{batch.status}</span>
                      <dl>
                        <Timer title="Starts in" value={time(batch.due)} />
                        <Timer
                          title="Order complete"
                          value={time(batch.finalDue)}
                        />
                      </dl>
                    </div>
                  </Popover>
                </li>
              ))}
            </ol>
          </li>
        )}
      </ol>
      {upcoming.length === 0 && (
        <p className={styles.queueEmpty}>
          <Radar size={16} aria-hidden="true" />
          No further orders queued
        </p>
      )}
    </WorkCardSurface>
  )
}
