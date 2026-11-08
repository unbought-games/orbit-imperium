import type { MouseEventHandler } from 'react'
import { ArrowRight } from 'lucide-react'
import { useGameSession } from '../../shell/session-context'
import { briefingRoute } from './briefing-route'
import { Link } from '../../ui/link'
import { ButtonLink } from '../../ui/button'
import { useTutorial } from './use-tutorial'
import { hasIncompleteBriefing } from './model'
import styles from './tutorial.module.css'

/** Shared by both orb surfaces; tutorial visibility stays inside this feature. */
export function BriefingLink({
  onClick,
  appearance = 'link',
}: {
  appearance?: 'link' | 'button'
  onClick?: MouseEventHandler<HTMLAnchorElement>
}) {
  const { universeName, view } = useGameSession()
  const { data } = useTutorial()
  if (view.protocol !== 4 || (data && !hasIncompleteBriefing(data))) return null
  const target = briefingRoute(universeName, data, view.bodies[0]?.id)
  if (!target) return null
  if (appearance === 'button')
    return (
      <ButtonLink
        {...target}
        variant="secondary"
        size="small"
        onClick={onClick}
      >
        Briefing
      </ButtonLink>
    )
  return (
    <Link {...target} className={styles.briefingLink} onClick={onClick}>
      Open briefing <ArrowRight size={16} aria-hidden="true" />
    </Link>
  )
}
