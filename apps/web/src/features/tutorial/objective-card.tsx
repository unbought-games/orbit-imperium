import { ArrowRight } from 'lucide-react'
import type { components } from '../../contracts'
import { useUniverseName } from '../../shell/session-context'
import { routeTarget } from '../../shell/route-target'
import { resolveCatalogArt } from '../../ui/artwork'
import { ButtonLink } from '../../ui/button'
import { ResourceMark } from '../../ui/resource-mark'
import { ResourceNumber } from '../../ui/number-value'
import { label } from '../../ui/format'
import {
  objectiveTitle,
  objectiveDescription,
  progressionTarget,
  type Objective,
} from './model'
import styles from './objective-card.module.css'
type S = components['schemas']
const resourceNames = {
  metal: 'Metal',
  crystal: 'Crystal',
  deuterium: 'Deuterium',
}

/** Keep the level and its number together when titles wrap on narrow screens. */
export function ObjectiveTitle({ objective }: { objective: Objective }) {
  return (
    <>{objectiveTitle(objective).replace(/level (\d+)$/, 'level\u00a0$1')}</>
  )
}

export function ObjectiveReward({
  reward,
  variant = 'card',
}: {
  reward: S['Resources']
  variant?: 'card' | 'inline'
}) {
  const resources = (['metal', 'crystal', 'deuterium'] as const).filter(
    (resource) => BigInt(reward[resource]) > 0n,
  )
  if (!resources.length) return null
  return (
    <div className={styles.reward} data-variant={variant} aria-label="Reward">
      {variant === 'card' && <span className={styles.rewardLabel}>Reward</span>}
      <div className={styles.amounts}>
        {resources.map((resource) => (
          <span
            key={resource}
            className={styles.amount}
            title={resourceNames[resource]}
          >
            <ResourceMark
              resource={resource}
              width={variant === 'inline' ? 18 : 26}
              height={variant === 'inline' ? 18 : 26}
              role="img"
              aria-label={resourceNames[resource]}
              aria-hidden={false}
            />
            <strong>
              <ResourceNumber value={reward[resource]} />
            </strong>
          </span>
        ))}
      </div>
    </div>
  )
}

export function ProgressionObjectiveCard({
  objective,
  status,
}: {
  objective: Objective
  status: { ready: boolean; text: string }
}) {
  const universe = useUniverseName()
  const action = objective.next_action
  if (action?.type !== 'Progression') return null
  const request = action.request
  const target = progressionTarget(request)
  const key: S['CatalogKey3'] | null =
    request.type === 'Upgrade' || request.type === 'Demolition'
      ? { kind: 'Building', id: request.building }
      : request.type === 'Research'
        ? { kind: 'Research', id: request.research }
        : request.type === 'Manufacture'
          ? request.item
          : null
  if (!target || !key) return null
  const art = resolveCatalogArt(key)
  const why = objectiveDescription(objective)
  return (
    <section className={styles.card} aria-label="Recommended next action">
      <img
        className={styles.art}
        src={art.thumbnail}
        srcSet={art.srcSet}
        sizes="80px"
        width={80}
        height={80}
        alt={label(key.id)}
      />
      <div className={styles.details}>
        <span className={styles.eyebrow}>Current directive</span>
        <h3>
          <ObjectiveTitle objective={objective} />
        </h3>
        <p>{why}</p>
        {!status.ready && (
          <p className={styles.status} role="status">
            {status.text}
          </p>
        )}
      </div>
      <ButtonLink
        className={styles.action}
        {...routeTarget(universe, target.page, target.body, target.item)}
      >
        Open {label(target.item)} <ArrowRight size={16} aria-hidden="true" />
      </ButtonLink>
      <ObjectiveReward reward={objective.reward} />
    </section>
  )
}
