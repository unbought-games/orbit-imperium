import styles from './social.module.css'
import { routeTarget } from '../../shell/route-target'
import { useParams } from '@tanstack/react-router'
import { useContext } from 'react'
import { SessionContext } from '../../shell/session-context'
import { Link } from '../../ui/link'
export function MessagePlayerLink({
  player,
  name,
}: {
  player: string
  name: string
}) {
  const session = useContext(SessionContext)
  const { body } = useParams({ strict: false })
  if (
    !session ||
    session.view.protocol !== 4 ||
    session.view.binding.player === player
  )
    return null
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
