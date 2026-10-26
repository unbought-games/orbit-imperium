import { Diamond, Orbit, Sparkles, Star } from 'lucide-react'
import styles from './supporter-identity.module.css'
import { InfoTooltip } from '../ui/info-tooltip'

export type SupporterTier = 1 | 2 | 3
export type SupporterPalette = 'aurora' | 'starlight'
export type SupporterBadge = 'orbital' | 'star'
export const supporterTiers = [1, 2, 3] as const
export const tierLabels = {
  1: '$10 / month',
  2: '$25 / month',
  3: '$100 / month',
}

/** Shared account display; callers supply only a current verified tier. */
export function SupporterIdentity({
  name,
  tier,
  palette = 'starlight',
  badge = 'star',
  badgeTooltip = false,
}: {
  name: string
  tier?: SupporterTier
  palette?: SupporterPalette
  badgeTooltip?: boolean
  badge?: SupporterBadge
}) {
  const Icon =
    badge === 'star'
      ? Star
      : tier === 1
        ? Orbit
        : tier === 2
          ? Diamond
          : Sparkles
  return (
    <span className={styles.identity} data-palette={palette} data-tier={tier}>
      <span className={styles.name}>{name}</span>
      {tier &&
        (badgeTooltip ? (
          <InfoTooltip
            className={styles.badge}
            label={`Supporter · ${tierLabels[tier]} USD`}
            description="This player supports Orbit Imperium. Supporter status does not affect gameplay strength or protection."
          >
            <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
          </InfoTooltip>
        ) : (
          <span
            className={styles.badge}
            role="img"
            aria-label={`Supporter · ${tierLabels[tier]} USD`}
            title={`Supporter · ${tierLabels[tier]} USD`}
          >
            <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
          </span>
        ))}
    </span>
  )
}
