import type { ComponentPropsWithRef } from 'react'
import { classes } from './classes'
import styles from './visually-hidden.module.css'
export function VisuallyHidden({
  className,
  ...props
}: ComponentPropsWithRef<'div'>) {
  return <div className={classes(styles.hidden, className)} {...props} />
}
