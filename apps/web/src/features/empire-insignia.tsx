import type { CSSProperties } from 'react'
import type { InsigniaAppearance } from '../adapters/insignias'
import styles from './insignia.module.css'
export function EmpireInsignia({
  appearance,
  size = 'small',
  label,
}: {
  appearance: InsigniaAppearance
  size?: 'small' | 'medium' | 'large'
  label?: string
}) {
  return (
    <span
      className={`${styles.insignia} ${styles[size]}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={
        {
          '--insignia-foreground': appearance.recipe.foreground,
          '--insignia-background': appearance.recipe.background,
          '--insignia-mask': `url("${appearance.asset_url}")`,
        } as CSSProperties
      }
    >
      <span />
    </span>
  )
}
