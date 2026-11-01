import { ArrowRight, Clock3, Layers3, Radar } from 'lucide-react'
import type { manufacturingQueue } from '../client-model/manufacturing-queue'
import { manufacturingQueueCompletion } from '../client-model/manufacturing-queue'
import { resolveCatalogArt } from '../ui/artwork'
import { label } from '../ui/format'
import { NumberValue } from '../ui/number-value'
import { VisuallyHidden } from '../ui/visually-hidden'
import { Popover } from '../ui/popover'
import { manufacturingSummary } from './manufacturing-summary-model'
import styles from './manufacturing-summary.module.css'

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

function Timer({
  title,
  value,
  total = false,
}: {
  title: string
  value: string
  total?: boolean
}) {
  return (
    <div className={total ? styles.totalTimer : styles.timer}>
      <dt>
        {total ? (
          <Layers3 size={16} aria-hidden="true" />
        ) : (
          <Clock3 size={16} aria-hidden="true" />
        )}
        {title}
      </dt>
      <dd
        className={
          value === 'Awaiting confirmation' ? styles.unconfirmed : undefined
        }
        aria-label={value === 'Awaiting confirmation' ? value : undefined}
      >
        {value === 'Awaiting confirmation' ? 'Pending' : value}
      </dd>
    </div>
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
    <div className={styles.production}>
      <ol className={styles.queue} aria-label="Manufacturing queue">
        <li className={styles.current}>
          <div className={styles.activeBuild}>
            <div className={styles.portrait}>
              <UnitArt batch={current} size={96} />
            </div>
            <div className={styles.identity}>
              <span className={styles.status}>
                <span className={styles.statusLight} />
                {waiting
                  ? 'Awaiting confirmation'
                  : producing
                    ? 'Building now'
                    : current.status === 'Queued'
                      ? 'Up next'
                      : current.status}
              </span>
              <div className={styles.unitTitle}>
                <h3>{label(current.item.id)}</h3>
                <div className={styles.count} title="Units remaining">
                  <NumberValue value={current.remaining} />
                  <VisuallyHidden> remaining</VisuallyHidden>
                </div>
              </div>
            </div>
          </div>
          <dl className={styles.timers}>
            <Timer
              title={producing ? 'Next unit' : 'Starts in'}
              value={time(current.due)}
            />
            <Timer title="This order" value={time(current.finalDue)} />
            <Timer title="Entire queue" value={time(completion)} total />
          </dl>
          {percent !== null && (
            <div
              className={styles.progress}
              role="progressbar"
              aria-label={`${label(current.item.id)} next unit estimated progress`}
              aria-valuenow={Math.round(percent)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span style={{ width: `${percent}%` }} />
            </div>
          )}
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
    </div>
  )
}
