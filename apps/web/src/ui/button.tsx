import { createLink } from '@tanstack/react-router'
import type { ComponentPropsWithRef } from 'react'
import { classes } from './classes'
import styles from './button.module.css'

export type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'ghost'
export type ButtonSize = 'default' | 'small' | 'large' | 'icon' | 'icon-small'
export type ButtonAppearance = {
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
}

/** Shared appearance for native actions and links; semantics stay with the caller. */
export function buttonClasses({
  variant = 'primary',
  size = 'default',
  className,
}: ButtonAppearance = {}) {
  return classes(
    styles.button,
    styles[variant],
    size !== 'default' && styles[size],
    className,
  )
}

export function Button({
  variant,
  size,
  className,
  ...props
}: ComponentPropsWithRef<'button'> & ButtonAppearance) {
  return (
    <button
      className={buttonClasses({ variant, size, className })}
      {...props}
    />
  )
}

export function ButtonLinkAnchor({
  variant,
  size,
  className,
  ...props
}: ComponentPropsWithRef<'a'> & ButtonAppearance) {
  return (
    <a className={buttonClasses({ variant, size, className })} {...props} />
  )
}

export const ButtonLink = createLink(ButtonLinkAnchor)
