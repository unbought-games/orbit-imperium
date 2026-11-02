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
      data-shape={appearance.recipe.shape ?? 'shield'}
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
      {appearance.layers ? (
        appearance.layers.map((layer) => (
          <span
            key={layer.symbol}
            className={styles.layer}
            style={{
              background: layer.color,
              mask: `url("${layer.asset_url}") center / 100% 100% no-repeat`,
            }}
          />
        ))
      ) : (
        <span />
      )}
    </span>
  )
}
