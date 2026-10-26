import { useContext } from 'react'
import { usePlayerDisplay } from '../shell/player-profiles-context'
import { SupporterIdentity } from './supporter-identity'
import { playerLabel, type PlayerNames } from './player-label'
import {
  AllianceTag,
  HistoricalAlliances,
  type AllianceIdentity,
} from './player-alliance'

/** Public identity with current affiliation, unless a report binds historical facts. */
export function PlayerName({
  player,
  fallback,
  names,
  alliance,
  linkAlliance = true,
  badgeTooltip = false,
}: {
  player: string
  fallback?: string
  names?: PlayerNames
  alliance?: AllianceIdentity | null
  linkAlliance?: boolean
  badgeTooltip?: boolean
}) {
  const profile = usePlayerDisplay(player)
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
        badgeTooltip={badgeTooltip}
      />
      {affiliation && (
        <>
          {' '}
          <AllianceTag alliance={affiliation} linked={linkAlliance} />
        </>
      )}
    </>
  )
}
