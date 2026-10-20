import styles from './state-panel.module.css'
import { Panel } from './panel'
import { Heading } from './typography'
import type { ReactNode } from 'react'
export function StatePanel({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <Panel as="section" className={styles.panel}>
      <Heading level={2}>{title}</Heading>
      {children}
    </Panel>
  )
}
