import { useGameSession } from '../../shell/session-context'
import { Button } from '../../ui/button'
import { canReviewProduction } from './model'
import { useTutorial } from './use-tutorial'
import styles from './advisor.module.css'
import { ObjectiveReward } from './objective-card'

/** An explicit learning acknowledgement; never alters production settings. */
export function ProductionReviewAction() {
  const { view, model } = useGameSession()
  const { data, pending } = useTutorial()
  const directive = data?.chapters
    .flatMap((chapter) => chapter.objectives)
    .find((objective) => objective.id === 'production-settings')
  const ready = view.protocol === 4 && canReviewProduction(data, view)
  return (
    <>
      {!ready && (
        <p>Upgrade your Solar Plant to level 2 to complete this directive.</p>
      )}
      {directive && (
        <div className={styles.reviewReward}>
          <span>Reward</span>
          <ObjectiveReward reward={directive.reward} variant="inline" />
        </div>
      )}
      <Button
        className={styles.reviewAction}
        size="small"
        disabled={!ready || pending}
        onClick={() =>
          void model.send({
            type: 'World',
            action: { type: 'ReviewProductionSettings' },
          })
        }
      >
        Understood
      </Button>
    </>
  )
}
