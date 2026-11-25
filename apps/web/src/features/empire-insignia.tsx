import {
  TreatmentLayer,
  useTreatmentInteraction,
} from './rewards/cosmetic-treatment'
import type { CSSProperties } from 'react'
import type { InsigniaAppearance } from '../adapters/insignias'
import styles from './insignia.module.css'

const polygonVertices = {
  diamond: [
    [50, 0],
    [100, 50],
    [50, 100],
    [0, 50],
  ],
  hexagon: [
    [25, 0],
    [75, 0],
    [100, 50],
    [75, 100],
    [25, 100],
    [0, 50],
  ],
}

export function EmpireInsignia({
  appearance,
  size = 'small',
  label,
}: {
  appearance: InsigniaAppearance
  size?: 'inline' | 'small' | 'compact' | 'medium' | 'large'
  label?: string
}) {
  const shape = appearance.recipe.shape ?? 'shield'
  const vertices =
    shape === 'diamond' || shape === 'hexagon' ? polygonVertices[shape] : null
  const rendering = appearance.rendering
  const motion = useTreatmentInteraction(rendering?.effect, size !== 'large')
  return (
    <span
      className={`${styles.insignia} ${styles[size]}`}
      data-shape={shape}
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
          clipPath: vertices
            ? `polygon(${vertices.map(([x, y]) => `${x}% ${y}%`).join(', ')})`
            : undefined,
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
      {vertices && (
        <svg
          className={styles.polygonOutline}
          aria-hidden="true"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <polygon
            points={vertices.map(([x, y]) => `${x},${y}`).join(' ')}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}
    </span>
  )
}
