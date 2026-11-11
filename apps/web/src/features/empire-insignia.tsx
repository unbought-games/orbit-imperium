import {
  TreatmentLayer,
  useTreatmentInteraction,
} from './rewards/cosmetic-treatment'
import type { CSSProperties } from 'react'
import type { InsigniaAppearance } from '../adapters/insignias'
import styles from './insignia.module.css'
export function EmpireInsignia({
  appearance,
  size = 'small',
  label,
}: {
  appearance: InsigniaAppearance
  size?: 'inline' | 'small' | 'medium' | 'large'
  label?: string
}) {
  const rendering = appearance.rendering
  const motion = useTreatmentInteraction(rendering?.effect, size !== 'large')
  return (
    <span
      className={`${styles.insignia} ${styles[size]}`}
      data-shape={appearance.recipe.shape ?? 'shield'}
      data-treatment-pattern={rendering?.effect?.parameters.pattern}
      data-treatment-active={motion.active || undefined}
      data-still={motion.still || undefined}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      tabIndex={
        label && !motion.still && rendering?.effect?.renderer === 'interaction'
          ? 0
          : undefined
      }
      {...motion.handlers}
      style={
        {
          '--insignia-foreground':
            rendering?.foreground ?? appearance.recipe.foreground,
          '--insignia-background':
            rendering?.background ?? appearance.recipe.background,
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
      {rendering?.finish && (
        <TreatmentLayer
          className={styles.treatment}
          treatment={rendering.finish}
          quiet={motion.still}
        />
      )}
      {rendering?.effect && (
        <TreatmentLayer
          className={styles.treatment}
          treatment={rendering.effect}
          quiet={motion.still}
          active={motion.active}
        />
      )}
    </span>
  )
}
