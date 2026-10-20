import type { ComponentPropsWithRef } from 'react'
import { Panel } from './panel'
import { classes } from './classes'
import styles from './catalog-layout.module.css'
export function CatalogGrid({
  className,
  ...props
}: ComponentPropsWithRef<'div'>) {
  return <div className={classes(styles.grid, className)} {...props} />
}
export function CatalogCard({
  className,
  ...props
}: ComponentPropsWithRef<typeof Panel>) {
  return <Panel className={classes(styles.card, className)} {...props} />
}
export function CatalogActions({
  className,
  ...props
}: ComponentPropsWithRef<'div'>) {
  return <div className={classes(styles.actions, className)} {...props} />
}
