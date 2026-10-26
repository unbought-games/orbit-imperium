import { createContext } from 'react'
import type { components } from '../contracts'
import styles from './player-alliance.module.css'

export type AllianceIdentity = components['schemas']['AllianceIdentity']
export type PlayerAlliances = Readonly<Record<string, AllianceIdentity>>
// Even an empty historical map suppresses current affiliations. Old reports
// cannot acquire intelligence from a player's subsequent alliance membership.
export const HistoricalAlliances = createContext<PlayerAlliances | undefined>(
  undefined,
)
export function AllianceTag({
  alliance,
  linked = true,
}: {
  alliance: AllianceIdentity
  linked?: boolean
}) {
  const title = `${alliance.name} [${alliance.tag}]`
  return linked ? (
    <a
      className={styles.tag}
      href={`/alliances/${encodeURIComponent(alliance.universe)}/${encodeURIComponent(alliance.id)}`}
      title={title}
      aria-label={`Alliance ${title}`}
    >
      [{alliance.tag}]
    </a>
  ) : (
    <span className={styles.tag} title={title}>
      [{alliance.tag}]
    </span>
  )
}
