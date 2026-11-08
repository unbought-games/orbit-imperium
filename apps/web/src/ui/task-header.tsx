import type { ReactNode } from 'react'
import { classes } from './classes'
import styles from './task-header.module.css'

/** Task controls, with a title when navigation does not already name the page. */
export function TaskHeader({
  title,
  children,
  leading,
  centered = false,
}: {
  title?: string
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
      {title && <h2>{title}</h2>}
      {children}
    </header>
  )
}
