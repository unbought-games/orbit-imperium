import type { ReactNode } from 'react'
import styles from './task-header.module.css'

/** Task controls, with a title when navigation does not already name the page. */
export function TaskHeader({
  title,
  children,
}: {
  title?: string
  children?: ReactNode
}) {
  return (
    <header className={styles.header}>
      {title && <h2>{title}</h2>}
      {children}
    </header>
  )
}
