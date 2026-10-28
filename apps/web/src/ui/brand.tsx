import { createLink } from '@tanstack/react-router'
import type { ComponentPropsWithRef } from 'react'
import { classes } from './classes'
import styles from './brand.module.css'

export function BrandLogo({
  className,
  ...props
}: Omit<ComponentPropsWithRef<'img'>, 'src'>) {
  return (
    <img
      src="/brand-mark.svg"
      width={32}
      height={32}
      alt="Orbit Imperium"
      className={classes(styles.logo, className)}
      {...props}
    />
  )
}

export function BrandWordmark({
  className,
  ...props
}: Omit<ComponentPropsWithRef<'span'>, 'children'>) {
  return (
    <span className={classes(styles.wordmark, className)} {...props}>
      <span>ORBIT</span> <strong>IMPERIUM</strong>
    </span>
  )
}

function BrandAnchor({
  className,
  variant = 'both',
  ...props
}: Omit<ComponentPropsWithRef<'a'>, 'children'> & {
  variant?: 'logo' | 'wordmark' | 'both'
}) {
  return (
    <a
      data-touch-control=""
      className={classes(styles.brand, className)}
      {...props}
    >
      {variant !== 'wordmark' && (
        <BrandLogo alt={variant === 'logo' ? 'Orbit Imperium' : ''} />
      )}
      {variant !== 'logo' && <BrandWordmark />}
    </a>
  )
}

export const Brand = createLink(BrandAnchor)
