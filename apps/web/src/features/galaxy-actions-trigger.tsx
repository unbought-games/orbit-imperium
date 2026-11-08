import { Ellipsis } from 'lucide-react'
import type { ComponentPropsWithRef } from 'react'
import { Button } from '../ui/button'
import styles from './galaxy.module.css'

/** The same Actions control for every Galaxy location. */
export function GalaxyActionsTrigger({
  target,
  className,
  ...props
}: ComponentPropsWithRef<typeof Button> & { target: string }) {
  return (
    <Button
      variant="ghost"
      className={[styles.actionTrigger, className].filter(Boolean).join(' ')}
      aria-label={`Actions for ${target}`}
      {...props}
    >
      <span className={styles.actionText}>Actions</span>
      <Ellipsis className={styles.actionIcon} size={18} aria-hidden="true" />
    </Button>
  )
}
