import type { ReactNode } from 'react'
import { classes } from '../ui/classes'
import styles from './context-navigation.module.css'

/** The same focused navigation can fill a desktop sidebar or a mobile menu page. */
export function ContextNavigation({
  title,
  back,
  children,
  appearance = 'sidebar',
}: {
  appearance?: 'sidebar' | 'page'
  title: string
  back: ReactNode
  children: ReactNode
}) {
  return (
    <nav
      className={classes(
        styles.navigation,
        appearance === 'page' && styles.page,
      )}
      aria-label={`${title} navigation`}
    >
      <div className={styles.back}>{back}</div>
      <h2 className={styles.title}>{title}</h2>
      {children}
    </nav>
  )
}

export function ContextNavigationGroup({
  label,
  children,
}: {
  label?: string
  children: ReactNode
}) {
  return (
    <div className={styles.group}>
      {label && <h3>{label}</h3>}
      {children}
    </div>
  )
}
