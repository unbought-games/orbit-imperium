import { Plus } from 'lucide-react'
import { usePlayerDisplay } from '../shell/player-profiles-context'
import { useGameSession } from '../shell/session-context'
import { routeTarget } from '../shell/route-target'
import { Link } from '../ui/link'
import { EmpireInsignia } from './empire-insignia'
import styles from './empire-emblem-link.module.css'

/** A distinct entry to the insignia editor, beside the empire's name. */
export function EmpireEmblemLink({
  player,
  body,
}: {
  player: string
  body: string
}) {
  const profile = usePlayerDisplay(player)
  const { universeName } = useGameSession()
  const empty = profile !== undefined && !profile.insignia
  const label = empty ? 'Create your empire emblem' : 'Edit your empire emblem'
  return (
    <Link
      {...routeTarget(universeName, 'settings', body, 'identity')}
      hash="empire-insignia"
      className={styles.link}
      aria-label={label}
      title={label}
      aria-busy={!profile || undefined}
    >
      {profile?.insignia ? (
        <EmpireInsignia appearance={profile.insignia} size="compact" />
      ) : (
        <span
          className={styles.slot}
          aria-hidden="true"
          data-empty={empty || undefined}
        >
          {empty && <Plus size={16} />}
        </span>
      )}
    </Link>
  )
}
