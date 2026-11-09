import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { classes } from './classes'
import { LoadingPresence } from './loading-presence'
import styles from './loading-region.module.css'

/** Keep mounted across loading/ready states so short requests stay quiet. */
export function LoadingRegion({
  loading,
  label = 'Loading…',
  children,
  className,
  contentClassName,
}: {
  loading: boolean
  label?: string
  children?: ReactNode
  className?: string
  contentClassName?: string
}) {
  const [presence] = useState(() => new LoadingPresence())
  const visible = useSyncExternalStore(
    presence.subscribe,
    presence.snapshot,
    () => false,
  )
  useEffect(() => {
    presence.update(loading)
    return () => presence.cancel()
  }, [loading, presence])

  return (
    <div className={classes(styles.region, className)}>
      <div
        className={classes(styles.content, contentClassName)}
        data-loading={visible || undefined}
        aria-busy={loading || visible}
        inert={visible || undefined}
      >
        {children}
      </div>
      {visible && (
        <div className={styles.indicator} role="status">
          <svg className={styles.orbit} viewBox="0 0 80 80" aria-hidden="true">
            <circle className={styles.track} cx="40" cy="40" r="30" />
            <circle className={styles.track} cx="40" cy="40" r="19" />
            <g className={styles.outer}>
              <circle
                className={styles.arc}
                cx="40"
                cy="40"
                r="30"
                strokeDasharray="42 147"
              />
              <circle className={styles.satellite} cx="40" cy="10" r="3" />
            </g>
            <g className={styles.inner}>
              <circle className={styles.satellite} cx="40" cy="59" r="2" />
            </g>
            <path className={styles.core} d="M40 33 47 40 40 47 33 40Z" />
          </svg>
          <span>{label}</span>
        </div>
      )}
    </div>
  )
}
