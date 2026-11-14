import type { ReactNode } from 'react'
import { classes } from './classes'
import styles from './task-header.module.css'

/** Task controls, with a title when navigation does not already name the page. */
export function TaskHeader({
  title,
  titleControls,
  children,
  leading,
  centered = false,
}: {
  title?: string
  titleControls?: ReactNode
  children?: ReactNode
  leading?: ReactNode
  centered?: boolean
}) {
  return (
    <header
      className={classes(
        styles.header,
        !!leading && styles.withLeading,
        centered && styles.centered,
      )}
    >
      {leading && <div className={styles.leading}>{leading}</div>}
      {titleControls ? (
        <div className={styles.titleGroup}>
          {title && <h2>{title}</h2>}
          {titleControls}
        </div>
      ) : title ? (
        <h2>{title}</h2>
      ) : null}
      {children}
    </header>
  )
}
