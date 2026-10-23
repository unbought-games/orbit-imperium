import { usePlayerDisplay } from '../shell/player-profiles-context'
import { SupporterIdentity } from './supporter-identity'

/** Every player reference uses the same current public identity and badge. */
export function PlayerName({
  player,
  fallback,
}: {
  player: string
  fallback?: string
}) {
  const profile = usePlayerDisplay(player)
  return (
    <SupporterIdentity
      name={profile?.username ?? fallback ?? `Player ${player.slice(0, 8)}`}
      tier={profile?.supporter_tier}
    />
  )
}
