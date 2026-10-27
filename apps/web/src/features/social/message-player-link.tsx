import { universeSlug } from '../../client-model/universe-name'
import { useContext } from 'react'
import { MessageSquare } from 'lucide-react'
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
  if (
    !session ||
    session.view.protocol !== 4 ||
    session.view.binding.player === player
  )
    return null
  return (
    <Link
      to="/u/$universe/messages"
      params={{ universe: universeSlug(session.universeName) }}
      search={{ player }}
      title={`Message ${name}`}
      aria-label={`Message ${name}`}
    >
      <MessageSquare
        size={14}
        aria-hidden="true"
        style={{
          display: 'inline',
          verticalAlign: 'middle',
          marginInlineStart: 4,
        }}
      />
    </Link>
  )
}
