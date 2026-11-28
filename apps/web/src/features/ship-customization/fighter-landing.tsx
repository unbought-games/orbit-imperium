import type { ReactNode } from 'react'
import styles from './fighter-landing.module.css'

/** Mounts share the approved 1536 × 1024 hull's projection. Draw the hull last
 * so its underside hides the folded links throughout deployment. */
export function FighterLanding({
  ready,
  children,
}: {
  ready: boolean
  children: ReactNode
}) {
  return (
    <div className={styles.bay} data-ready={ready}>
      <div className={styles.projection}>
        <div className={styles.shadow} aria-hidden="true" />
        <div className={styles.airframe}>
          <div className={styles.gear} aria-hidden="true">
            <i className={styles.farMain} />
            <i className={styles.nearMain} />
            <i className={styles.nose} />
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
