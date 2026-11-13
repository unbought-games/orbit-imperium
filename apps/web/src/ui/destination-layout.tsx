import type { ComponentPropsWithRef } from 'react'
import { classes } from './classes'
import styles from './destination-layout.module.css'

/** Shared reading width and starting position for destinations in a focused area. */
export function DestinationLayout({
  className,
  ...props
}: ComponentPropsWithRef<'div'>) {
  return <div className={classes(styles.layout, className)} {...props} />
}

/** Visible destination title, beneath the shell's accessible route heading. */
export function DestinationHeading({
  className,
  ...props
}: ComponentPropsWithRef<'h2'>) {
  return <h2 className={classes(styles.title, className)} {...props} />
}
