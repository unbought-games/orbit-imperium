import type { ReactNode } from 'react'
import { Clock3, Layers3 } from 'lucide-react'
import type { components } from '../contracts'
import { resolveCatalogArt } from '../ui/artwork'
import { label } from '../ui/format'
import styles from './active-work-card.module.css'

export function WorkCardSurface({ children }: { children: ReactNode }) {
  return <div className={styles.surface}>{children}</div>
}

/** Shared active-work presentation; callers own timing and operation semantics. */
export function ActiveWorkCard({
  item,
  status,
  title,
  badge,
  description,
  percent,
  progressLabel,
  moving = true,
  children,
}: {
  item: components['schemas']['CatalogKey3']
  status: string
  title?: ReactNode
  badge: ReactNode
  description?: ReactNode
  percent: number | null
  progressLabel: string
  moving?: boolean
  children: ReactNode
}) {
  const art = resolveCatalogArt(item)
  return (
    <div className={styles.content}>
      <div className={styles.activeBuild}>
        <div className={styles.portrait}>
          <img
            src={art.thumbnail}
            srcSet={art.srcSet}
            sizes="96px"
            width={96}
            height={96}
            alt=""
          />
        </div>
        <div className={styles.identity}>
          <span className={styles.status}>
            <span className={styles.statusLight} aria-hidden="true" />
            {status}
          </span>
          <div className={styles.unitTitle}>
            <h3>{title ?? label(item.id)}</h3>
            <div className={styles.badge}>{badge}</div>
          </div>
          {description && <p className={styles.description}>{description}</p>}
        </div>
      </div>
      {children}
      {percent !== null && (
        <div
          className={styles.progress}
          role="progressbar"
          aria-label={progressLabel}
          aria-valuenow={Math.round(percent)}
          aria-valuemin={0}
          aria-valuemax={100}
          data-moving={moving && percent < 100 && percent > 0}
        >
          <span style={{ width: `${percent}%` }} />
        </div>
      )}
    </div>
  )
}

export function WorkTimer({
  title,
  value,
  total = false,
}: {
  title: string
  value: ReactNode
  total?: boolean
}) {
  const pending = value === 'Awaiting confirmation'
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
        className={pending ? styles.unconfirmed : undefined}
        aria-label={pending ? 'Awaiting confirmation' : undefined}
      >
        {pending ? 'Pending' : value}
      </dd>
    </div>
  )
}

export function WorkTimers({ children }: { children: ReactNode }) {
  return <dl className={styles.timers}>{children}</dl>
}
