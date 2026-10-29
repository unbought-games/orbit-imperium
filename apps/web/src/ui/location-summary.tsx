import type { ComponentPropsWithRef, ComponentPropsWithoutRef } from 'react'
import { classes } from './classes'
import styles from './location-summary.module.css'

/** Compose identity from normal children: art, title, player, coordinates, and actions. */
export function LocationSummary({
  className,
  ...props
}: ComponentPropsWithRef<'div'>) {
  return <div {...props} className={classes(styles.summary, className)} />
}
export function LocationSummaryMedia({
  className,
  ...props
}: ComponentPropsWithoutRef<'div'>) {
  return <div {...props} className={classes(styles.media, className)} />
}
export function LocationSummaryContent({
  className,
  ...props
}: ComponentPropsWithoutRef<'div'>) {
  return <div {...props} className={classes(styles.content, className)} />
}
export function LocationSummaryLabel({
  className,
  ...props
}: ComponentPropsWithoutRef<'span'>) {
  return <span {...props} className={classes(styles.label, className)} />
}
export function LocationSummaryTitle({
  className,
  ...props
}: ComponentPropsWithoutRef<'strong'>) {
  return <strong {...props} className={classes(styles.title, className)} />
}
export function LocationSummaryDetails({
  className,
  ...props
}: ComponentPropsWithoutRef<'div'>) {
  return <div {...props} className={classes(styles.details, className)} />
}
export function LocationSummaryActions({
  className,
  ...props
}: ComponentPropsWithoutRef<'div'>) {
  return <div {...props} className={classes(styles.actions, className)} />
}

export function LocationSummaryDescription({
  className,
  ...props
}: ComponentPropsWithoutRef<'span'>) {
  return <span {...props} className={classes(styles.description, className)} />
}
export function LocationSummaryCoordinates({
  className,
  ...props
}: ComponentPropsWithoutRef<'div'>) {
  return <div {...props} className={classes(styles.coordinates, className)} />
}
