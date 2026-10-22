import { createLink } from '@tanstack/react-router'
import type { ComponentPropsWithRef } from 'react'
import { classes } from './classes'
import styles from './button.module.css'

type Variant = 'primary' | 'quiet'
export function Button({
  variant = 'primary',
  className,
  ...props
}: ComponentPropsWithRef<'button'> & { variant?: Variant }) {
  return (
    <button
      className={classes(styles.button, styles[variant], className)}
      {...props}
    />
  )
}
export function ButtonLinkAnchor({
  className,
  ...props
}: ComponentPropsWithRef<'a'>) {
  return (
    <a
      className={classes(styles.button, styles.primary, className)}
      {...props}
    />
  )
}

export const ButtonLink = createLink(ButtonLinkAnchor)
