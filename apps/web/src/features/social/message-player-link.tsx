import styles from './social.module.css'
import { routeTarget } from '../../shell/route-target'
import { useParams } from '@tanstack/react-router'
import { useContext } from 'react'
import { SessionContext, type GameSession } from '../../shell/session-context'
import { Link } from '../../ui/link'
type Props = { player: string; name: string }
export function MessagePlayerLink(props: Props) {
  const session = useContext(SessionContext)
  if (
    !session ||
    session.view.protocol !== 4 ||
    session.view.binding.player === props.player
  )
    return null
  return <GameMessagePlayerLink {...props} session={session} />
}

// Public report profiles render without a game router or session.
function GameMessagePlayerLink({
  player,
  name,
  session,
}: Props & { session: GameSession }) {
  const { body } = useParams({ strict: false })
  return (
    <Link
      data-message-player
      className={styles.playerLink}
      {...routeTarget(
        session.universeName,
        'messages',
        body ?? session.view.bodies[0]?.id,
      )}
      search={{ player }}
      title={`Message ${name}`}
      aria-label={`Message ${name}`}
    >
      Send message
    </Link>
  )
}
