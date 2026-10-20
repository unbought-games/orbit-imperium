import type { ComponentPropsWithRef } from 'react'
import { classes } from './classes'
import styles from './section.module.css'
export function Section({
  className,
  ...props
}: ComponentPropsWithRef<'section'>) {
  return <section className={classes(styles.section, className)} {...props} />
}
