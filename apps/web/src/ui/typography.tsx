import type { ComponentPropsWithRef } from 'react'
import { classes } from './classes'
import styles from './typography.module.css'
export function Heading({
  level,
  className,
  ...props
}: ComponentPropsWithRef<'h1'> & { level: 1 | 2 | 3 }) {
  const Tag = `h${level}` as 'h1' | 'h2' | 'h3'
  return <Tag className={classes(styles[`h${level}`], className)} {...props} />
}
export function Text({
  tone = 'muted',
  className,
  ...props
}: ComponentPropsWithRef<'p'> & { tone?: 'muted' | 'danger' }) {
  return (
    <p className={classes(styles.text, styles[tone], className)} {...props} />
  )
}
export function Caption({
  tone = 'muted',
  className,
  ...props
}: ComponentPropsWithRef<'small'> & { tone?: 'muted' | 'danger' }) {
  return (
    <small
      className={classes(styles.caption, styles[tone], className)}
      {...props}
    />
  )
}
export function Eyebrow({ className, ...props }: ComponentPropsWithRef<'p'>) {
  return <p className={classes(styles.eyebrow, className)} {...props} />
}
