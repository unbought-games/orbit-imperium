import { ArrowRight, CheckCircle2 } from 'lucide-react'
import type { TutorialData } from '../../client-model/tutorial-engine'
import { useGameSession } from '../../shell/session-context'
import { routeTarget } from '../../shell/route-target'
import { ButtonLink } from '../../ui/button'
import { label } from '../../ui/format'
import {
  accomplishmentTitle,
  objectiveDestination,
  objectiveDescription,
  objectiveTitle,
} from './model'
import { ObjectiveReward } from './objective-card'
import {
  celebrationNextDirective,
  celebrationReward,
} from './advisor-celebration'
import styles from './advisor.module.css'

export function AdvisorCelebrationContent({
  data,
  receipts,
  onNavigate,
}: {
  data: TutorialData
  receipts: TutorialData['receipts']
  onNavigate: () => void
}) {
  const { universeName, view } = useGameSession()
  const next = celebrationNextDirective(data, receipts)
  const destination = next && objectiveDestination(next, data)
  const reward = celebrationReward(receipts)
  const paid = Object.values(reward).some((amount) => BigInt(amount) > 0n)
  return (
    <div className={styles.content}>
      <div>
        <span className={styles.celebrationLabel}>
          <CheckCircle2 size={16} aria-hidden="true" /> Directive complete
        </span>
        <div className={styles.celebrationHeading}>
          <h2>Nicely done!</h2>
          <ButtonLink
            {...routeTarget(
              universeName,
              'briefing',
              data.homeworld ?? view.bodies[0]?.id,
            )}
            variant="secondary"
            size="compact"
            className={styles.briefingAction}
            onClick={onNavigate}
          >
            Briefing
          </ButtonLink>
        </div>
        <div
          className={styles.completionDetails}
          role="status"
          aria-live="polite"
        >
          <p className={styles.completedJob}>
            {receipts.length === 1
              ? accomplishmentTitle(receipts[0].objective, data).replace(
                  ' · at least level ',
                  ' · level ',
                )
              : `${receipts.length} directives completed.`}
          </p>
          <ObjectiveReward
            reward={reward}
            variant="inline"
            className={styles.completionReward}
          />
          {paid && (
            <p className={styles.rewardNote}>Rewards added automatically.</p>
          )}
        </div>
      </div>
      {next && destination ? (
        <section className={styles.nextJob} aria-label="Next directive">
          <span className={styles.celebrationLabel}>Up next</span>
          <h3>{objectiveTitle(next)}</h3>
          <p>{objectiveDescription(next)}</p>
          <ButtonLink
            {...routeTarget(
              universeName,
              destination.page,
              destination.body,
              destination.item,
            )}
            {...(destination.location ? { search: destination.location } : {})}
            size="small"
            onClick={onNavigate}
          >
            {destination.item && destination.page !== 'fleets'
              ? `Open ${label(destination.item)}`
              : 'Continue'}{' '}
            <ArrowRight size={16} aria-hidden="true" />
          </ButtonLink>
        </section>
      ) : (
        <p className={styles.nextJob}>
          {data.completed
            ? 'Briefing complete. Your colony is ready for what comes next!'
            : 'Your next steps are waiting in the Briefing.'}
        </p>
      )}
    </div>
  )
}
