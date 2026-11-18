import type { ComponentPropsWithRef } from 'react'
import { ArrowUp } from 'lucide-react'
import { Button } from './button'
import { classes } from './classes'
import styles from './input-with-action.module.css'

/** Compose an input (or labeled field) with a trailing action. */
export function InputWithAction({
  className,
  ...props
}: ComponentPropsWithRef<'div'>) {
  return <div className={classes(styles.field, className)} {...props} />
}

/** Fill/max action; the caller owns the quantity and its availability rules. */
export function FillButton({
  className,
  title,
  ...props
}: Omit<
  ComponentPropsWithRef<typeof Button>,
  'children' | 'type' | 'variant' | 'size'
> & { 'aria-label': string }) {
  return (
    <Button
      {...props}
      type="button"
      variant="ghost"
      size="icon-small"
      className={classes(styles.action, className)}
      title={title ?? props['aria-label']}
    >
      <ArrowUp size={18} aria-hidden="true" />
    </Button>
  )
}
