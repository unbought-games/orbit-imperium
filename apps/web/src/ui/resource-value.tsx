import type { ReactNode } from 'react'
import { ResourceMark } from './resource-mark'
import styles from './resource-value.module.css'

export type ResourceKind = 'metal' | 'crystal' | 'deuterium' | 'energy'

/** Inline resource identity, with canonical color and a full accessible name. */
export function ResourceValue({
  resource,
  children,
}: {
  resource: ResourceKind
  children: ReactNode
}) {
  const title = resource[0].toUpperCase() + resource.slice(1)
  return (
    <span className={styles.value} title={title}>
      <ResourceMark
        resource={resource}
        width={18}
        height={18}
        role="img"
        aria-label={title}
        aria-hidden={false}
      />
      <span>{children}</span>
    </span>
  )
}
