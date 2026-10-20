import type { ComponentPropsWithRef, ReactNode } from 'react'
import styles from './disclosure.module.css'
export function Disclosure({
  summary,
  children,
  ...props
}: ComponentPropsWithRef<'details'> & { summary: ReactNode }) {
  return (
    <details {...props}>
      <summary className={styles.summary}>{summary}</summary>
      {children}
    </details>
  )
}
