import type { ComponentPropsWithRef } from 'react'
import { Panel } from './panel'
import { Button } from './button'
import { classes } from './classes'
import styles from './quote-panel.module.css'
export function QuotePanel({
  className,
  ...props
}: ComponentPropsWithRef<typeof Panel>) {
  return (
    <Panel
      tone="accent"
      className={classes(styles.panel, className)}
      {...props}
    />
  )
}
export function QuoteAction({
  className,
  ...props
}: ComponentPropsWithRef<typeof Button>) {
  return <Button className={classes(styles.action, className)} {...props} />
}
