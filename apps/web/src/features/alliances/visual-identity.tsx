import compassUrl from '../../../../../crates/application/assets/insignias/compass.svg?url'
import type { CSSProperties } from 'react'
import type { components } from '../../contracts'
import { useReducedMotion } from '../../ui/use-reduced-motion'
import { EmpireInsignia } from '../empire-insignia'
import {
  defaultIdentity,
  mediaPath,
  type Placement,
  type VisualIdentity,
} from './presentation-model'
import styles from './presentation.module.css'
export const allianceDefaultArtwork =
  '/art/orbital-capital/orbital-capital-1672.webp'
export function AllianceArtwork({
  universe,
  placement,
  className,
  still = false,
}: {
  universe: string
  placement?: Placement | null
  className?: string
  still?: boolean
}) {
  const reduced = useReducedMotion()
  return (
    <img
      className={`${styles.artwork} ${className ?? ''}`}
      src={
        placement
          ? mediaPath(universe, placement.media_id, still || reduced)
          : allianceDefaultArtwork
      }
      alt={placement?.alt ?? ''}
      style={
        placement
          ? ({
              '--art-position': `${placement.x}% ${placement.y}%`,
              '--art-mobile-position': `${placement.mobile_x ?? placement.x}% ${placement.mobile_y ?? placement.y}%`,
            } as CSSProperties)
          : undefined
      }
      onError={(e) => {
        if (!e.currentTarget.src.endsWith(allianceDefaultArtwork))
          e.currentTarget.src = allianceDefaultArtwork
      }}
    />
  )
}
export function AllianceCrestMark({
  universe,
  identity = defaultIdentity,
  size = 'medium',
  animated = false,
}: {
  universe: string
  identity?: VisualIdentity
  size?: 'inline' | 'small' | 'medium'
  animated?: boolean
}) {
  const reduced = useReducedMotion()
  const crest = identity.crest
  if (crest.kind === 'upload')
    return (
      <img
        className={`${styles.uploadedCrest} ${styles[size]}`}
        src={mediaPath(
          universe,
          crest.media_id,
          !animated || reduced,
          animated && !reduced ? undefined : 256,
        )}
        alt="Alliance crest"
        onError={(e) => {
          if (
            e.currentTarget.src !==
            new URL(compassUrl, window.location.href).href
          )
            e.currentTarget.src = compassUrl
        }}
      />
    )
  if (crest.appearance)
    return (
      <EmpireInsignia
        appearance={crest.appearance}
        size={size}
        label="Alliance crest"
      />
    )
  const recipe = crest.recipe
  const url = (id: string) =>
    id === 'compass'
      ? compassUrl
      : `/api/alliance-presentation/symbols/${encodeURIComponent(id)}`
  return (
    <EmpireInsignia
      size={size}
      label="Alliance crest"
      appearance={{
        recipe,
        asset_url: url(recipe.symbol),
        ...(recipe.layers
          ? {
              layers: recipe.layers.map((l) => ({
                ...l,
                asset_url: url(l.symbol),
              })),
            }
          : {}),
      }}
    />
  )
}
export function AllianceIdentityHeader({
  summary,
  background,
}: {
  summary: components['schemas']['AllianceSummary']
  background?: Placement | null
}) {
  const identity = summary.visual_identity ?? defaultIdentity
  return (
    <header
      className={styles.hallHero}
      style={
        {
          '--alliance-accent': identity.primary,
          '--alliance-secondary': identity.secondary,
        } as CSSProperties
      }
    >
      <AllianceArtwork
        universe={summary.universe}
        placement={background ?? identity.banner}
      />
      <div className={styles.identityContent}>
        <AllianceCrestMark
          universe={summary.universe}
          identity={identity}
          animated
        />
        <div>
          <span className={styles.eyebrow}>[{summary.tag}]</span>
          <h2>{summary.name}</h2>
          {identity.motto && <p className={styles.motto}>{identity.motto}</p>}
        </div>
      </div>
    </header>
  )
}
