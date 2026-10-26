import { createContext, useContext } from 'react'
import { usePlayerDisplay } from '../shell/player-profiles-context'
import { SupporterIdentity } from './supporter-identity'
import { playerLabel, type PlayerNames } from './player-label'
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
}: {
  player: string
  fallback?: string
  names?: PlayerNames
  alliance?: AllianceIdentity | null
  linkAlliance?: boolean
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
  return (
    <>
      <SupporterIdentity
        name={profile?.username ?? fallback ?? playerLabel(player, names)}
        tier={profile?.supporter_tier}
      />
      {(profile?.kind ?? kinds[player]) === 'bot' && (
        <span
          title="Automated player"
          aria-label="Bot"
          className="text-xs text-muted-foreground"
        >
          {' '}
          Bot
        </span>
      )}
      {affiliation && (
        <>
          {' '}
          <AllianceTag alliance={affiliation} linked={linkAlliance} />
        </>
      )}
    </>
  )
}
