import { BookOpen } from 'lucide-react'
import { bindingKey } from '../../client-model/commands'
import { useGameSession } from '../../shell/session-context'
import { Link } from '../../ui/link'
import { briefingRoute } from './briefing-route'
import { briefingEntryAvailable } from './model'
import { useBriefingAttention } from './use-briefing-attention'
import { useTutorial } from './use-tutorial'
import styles from './briefing-icon.module.css'

export function BriefingIcon() {
  const { universeName, view } = useGameSession()
  const { data } = useTutorial()
  const { attention, acknowledge } = useBriefingAttention(
    bindingKey(view.binding),
    data,
  )
  const target = briefingRoute(universeName, data, view.bodies[0]?.id)
  if (!target || !briefingEntryAvailable(data, view.protocol)) return null
  return (
    <Link
      {...target}
      className={styles.icon}
      data-attention={attention}
      aria-label={
        attention ? 'Open briefing — unread updates' : 'Open briefing'
      }
      title={attention ? 'Briefing — unread updates' : 'Briefing'}
      onClick={acknowledge}
    >
      <BookOpen size={16} aria-hidden="true" />
      <span className={styles.stars} aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
      </span>
    </Link>
  )
}
