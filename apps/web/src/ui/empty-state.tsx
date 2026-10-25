import { useId, type ComponentPropsWithRef, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { classes } from './classes'
import { Heading, Text } from './typography'
import styles from './empty-state.module.css'

/** Empty collections share a visual language at page and dashboard scales. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  eyebrow,
  actions,
  variant = 'page',
  headingLevel = 2,
  className,
  ...props
}: Omit<ComponentPropsWithRef<'section'>, 'title' | 'children'> & {
  icon: LucideIcon
  title: string
  description?: string
  eyebrow?: string
  actions?: ReactNode
  variant?: 'page' | 'compact'
  headingLevel?: 2 | 3
}) {
  const titleId = useId()
  return (
    <section
      aria-labelledby={titleId}
      className={classes(styles.state, styles[variant], className)}
      {...props}
    >
      <div className={styles.emblem} aria-hidden="true">
        <Icon strokeWidth={1.25} />
      </div>
      <div className={styles.content}>
        {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
        <Heading level={headingLevel} id={titleId} className={styles.title}>
          {title}
        </Heading>
        {description && (
          <Text className={styles.description}>{description}</Text>
        )}
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    </section>
  )
}
