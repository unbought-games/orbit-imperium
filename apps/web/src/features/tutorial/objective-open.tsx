import type { TutorialData } from '../../client-model/tutorial-engine'
import { useUniverseName } from '../../shell/session-context'
import { routeTarget } from '../../shell/route-target'
import { Button, ButtonLink } from '../../ui/button'
import { objectiveDestination, objectiveTitle, type Objective } from './model'
import styles from './tutorial.module.css'

export function ObjectiveOpen({
  objective,
  data,
}: {
  objective: Objective
  data: TutorialData
}) {
  const universe = useUniverseName()
  const target = objectiveDestination(objective, data)
  if (!target)
    return (
      <Button
        variant="secondary"
        size="small"
        disabled
        title="Homeworld unavailable"
      >
        Open
      </Button>
    )
  return (
    <ButtonLink
      {...routeTarget(universe, target.page, target.body, target.item)}
      {...(target.location ? { search: target.location } : {})}
      variant="secondary"
      size="small"
      className={styles.jobAction}
      aria-label={`Open: ${objectiveTitle(objective)}`}
    >
      Open
    </ButtonLink>
  )
}
