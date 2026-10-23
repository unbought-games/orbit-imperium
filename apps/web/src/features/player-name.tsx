import { usePlayerDisplay } from '../shell/player-profiles-context'
import { SupporterIdentity } from './supporter-identity'
import { playerLabel, type PlayerNames } from './player-label'

/** Every player reference uses the same current public identity and badge. */
export function PlayerName({
  player,
  fallback,
  names,
}: {
  player: string
  fallback?: string
  names?: PlayerNames
}) {
  const profile = usePlayerDisplay(player)
  return (
    <SupporterIdentity
      name={profile?.username ?? fallback ?? playerLabel(player, names)}
      tier={profile?.supporter_tier}
    />
  )
}
