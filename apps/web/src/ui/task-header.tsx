import type { ReactNode } from 'react'
import styles from './task-header.module.css'

/** A single compact title and the controls needed for the current task. */
export function TaskHeader({
  title,
  children,
}: {
  title: string
  children?: ReactNode
}) {
  return (
    <header className={styles.header}>
      <h2>{title}</h2>
      {children}
    </header>
  )
}
