import { EmpireInsignia } from './empire-insignia'
import { PlayerProfile } from './player-profile'
import { createContext, useContext, type Ref } from 'react'
import { usePlayerDisplay } from '../shell/player-profiles-context'
import { SupporterIdentity } from './supporter-identity'
import { playerLabel, type PlayerNames } from './player-label'
import styles from './player-name.module.css'
import {
  AllianceTag,
  HistoricalAlliances,
  type AllianceIdentity,
} from './player-alliance'

export const PlayerKinds = createContext<Record<string, 'human' | 'bot'>>({})

/** Public identity with current affiliation, unless a report binds historical facts. */
export function PlayerName({
  player,
  fallback,
  names,
  alliance,
  linkAlliance = true,
  showInsignia = true,
  interactive = true,
  triggerRef,
}: {
  player: string
  fallback?: string
  names?: PlayerNames
  alliance?: AllianceIdentity | null
  linkAlliance?: boolean
  showInsignia?: boolean
  triggerRef?: Ref<HTMLButtonElement>
  interactive?: boolean
}) {
  const profile = usePlayerDisplay(player)
  const kinds = useContext(PlayerKinds)
  const historical = useContext(HistoricalAlliances)
  const affiliation =
    historical !== undefined
      ? historical[player]
      : alliance !== undefined
        ? alliance
        : profile?.alliance
  const name = profile?.username ?? fallback ?? playerLabel(player, names)
  const bot = (profile?.kind ?? kinds[player]) === 'bot'
  const identity = (
    <span className={styles.identity}>
      <span className={styles.name}>
        {showInsignia && profile?.insignia && (
          <EmpireInsignia appearance={profile.insignia} />
        )}
        <SupporterIdentity name={name} tier={profile?.supporter_tier} />
      </span>
      {bot && (
        <span title="Automated player" aria-label="Bot" className={styles.bot}>
          Bot
        </span>
      )}
      {affiliation && (
        <AllianceTag
          alliance={affiliation}
          linked={!interactive && linkAlliance}
        />
      )}
    </span>
  )
  return interactive ? (
    <PlayerProfile
      triggerRef={triggerRef}
      player={player}
      name={name}
      profile={profile}
      alliance={affiliation}
      bot={bot}
      historical={historical !== undefined}
    >
      {identity}
    </PlayerProfile>
  ) : (
    identity
  )
}
