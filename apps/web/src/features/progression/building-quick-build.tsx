import { useId, type ComponentProps } from 'react'
import { ImageTile } from '../../ui/image-catalog'
import { VisuallyHidden } from '../../ui/visually-hidden'
import { Hammer, Check, Clock3, AlertTriangle } from 'lucide-react'
import type { ProgressionProps } from './shared'
import type { ProgressionRequest } from './options'
import { Button } from '../../ui/button'
import { useBuildingQuickBuild } from './use-building-quick-build'
import styles from './building-quick-build.module.css'

export function BuildingQuickBuild({
  model,
  view,
  request,
  tile,
  unavailable,
}: {
  model: ProgressionProps['coordinator']
  view: ProgressionProps['view']
  request: Extract<ProgressionRequest, { type: 'Upgrade' }>
  tile: ComponentProps<typeof ImageTile>
  unavailable: string
}) {
  const description = useId()
  const title = tile.title
  const { proposal, reason, submit, feedback, recover } = useBuildingQuickBuild(
    {
      model,
      view,
      request,
      unavailable,
    },
  )
  const terms = proposal?.terms?.type === 'Building' ? proposal.terms : null
  return (
    <div>
      <ImageTile
        {...tile}
        action={
          <div
            className={styles.action}
            role="group"
            aria-label={`${title} quick build`}
            data-phase={feedback.phase}
          >
            <span
              className={styles.layer}
              aria-hidden={feedback.phase !== 'hammer'}
            >
              <Button
                type="button"
                size="small"
                className={styles.build}
                padding="compact"
                variant="ghost"
                aria-label={`Build ${title}${terms ? ` level ${terms.target_level}` : ''}`}
                aria-describedby={description}
                title={reason || `Build ${title} level ${terms?.target_level}`}
                disabled={!!reason || feedback.phase !== 'hammer'}
                onClick={submit}
              >
                <Hammer size={16} aria-hidden="true" />
              </Button>
            </span>
            <span
              className={`${styles.layer} ${styles.check}`}
              aria-hidden={feedback.phase !== 'check'}
              aria-label={feedback.status}
              title={feedback.status}
              role="img"
            >
              <Check size={20} aria-hidden="true" />
            </span>
            <span
              className={styles.layer}
              aria-hidden={feedback.phase !== 'pending'}
              aria-label={feedback.status}
              title={feedback.status}
              role="img"
            >
              <Clock3 size={16} aria-hidden="true" />
            </span>
            <span
              className={`${styles.layer} ${styles.countdown}`}
              aria-hidden={feedback.phase !== 'countdown'}
              aria-label={`${title} time remaining`}
            >
              {feedback.work?.secondsRemaining != null
                ? feedback.work.countdown
                : ''}
            </span>
            <span
              className={styles.layer}
              aria-hidden={feedback.phase !== 'uncertain'}
            >
              <Button
                variant="ghost"
                className={styles.build}
                disabled={feedback.phase !== 'uncertain'}
                onClick={recover}
                aria-label={`Check ${title} build status`}
                title={feedback.status}
              >
                <AlertTriangle size={18} aria-hidden="true" />
              </Button>
            </span>
            <VisuallyHidden id={description}>
              {reason || 'Build the next level on this planet.'}
            </VisuallyHidden>
          </div>
        }
      />
      {feedback.problem && (
        <p className={styles.problem} role="group" aria-label="Build problem">
          {feedback.problem}
        </p>
      )}
    </div>
  )
}
