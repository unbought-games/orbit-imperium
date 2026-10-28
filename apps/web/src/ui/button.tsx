import { createLink } from '@tanstack/react-router'
import type { ComponentPropsWithRef } from 'react'
import { classes } from './classes'
import styles from './button.module.css'

export type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'ghost'
export type ButtonSize = 'default' | 'small' | 'large' | 'icon' | 'icon-small'
export type ButtonPadding = 'default' | 'compact' | 'none'
export type ButtonAppearance = {
  variant?: ButtonVariant
  size?: ButtonSize
  padding?: ButtonPadding
  className?: string
}

/** Shared appearance for native actions and links; semantics stay with the caller. */
export function buttonClasses({
  variant = 'primary',
  size = 'default',
  padding = 'default',
  className,
}: ButtonAppearance = {}) {
  return classes(
    styles.button,
    styles[variant],
    size !== 'default' && styles[size],
    padding !== 'default' && styles[`padding-${padding}`],
    className,
  )
}

export function Button({
  variant,
  size,
  padding,
  className,
  ...props
}: ComponentPropsWithRef<'button'> & ButtonAppearance) {
  return (
    <button
      data-button-variant={variant ?? 'primary'}
      className={buttonClasses({ variant, size, padding, className })}
      {...props}
    />
  )
}

export function ButtonLinkAnchor({
  variant,
  size,
  padding,
  className,
  ...props
}: ComponentPropsWithRef<'a'> & ButtonAppearance) {
  return (
    <a
      data-touch-control=""
      data-button-variant={variant ?? 'primary'}
      className={buttonClasses({ variant, size, padding, className })}
      {...props}
    />
  )
}

export const ButtonLink = createLink(ButtonLinkAnchor)
