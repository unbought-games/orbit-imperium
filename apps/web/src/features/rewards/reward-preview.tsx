import type { CommunityOwner } from '../../adapters/community-rewards'
import type { InsigniaState } from '../../adapters/insignias'
import { EmpireInsignia } from '../empire-insignia'
import { defaultInsignia } from '../../client-model/insignias'
import { TreatmentPreview } from './cosmetic-treatment'
import styles from './rewards.module.css'
export type Reward = NonNullable<CommunityOwner['collection'][number]['reward']>
export function rewardScope(reward: Pick<Reward, 'scope' | 'game_id'>) {
  return reward.scope === 'account'
    ? 'Account bound'
    : reward.game_id === 'orbit-imperium'
      ? 'Orbit Imperium'
      : (reward.game_id ?? 'Game bound')
}
export function RewardPreview({
  reward,
  library,
  quiet = false,
  ownedComponents = [],
}: {
  reward: Reward
  library?: InsigniaState
  quiet?: boolean
  ownedComponents?: readonly string[]
}) {
  if (reward.preview.treatment)
    return (
      <TreatmentPreview
        treatment={reward.preview.treatment}
        label={`${reward.name} preview`}
        quiet={quiet}
      />
    )
  if (reward.kind === 'dye')
    return (
      <span
        role="img"
        aria-label={`${reward.name} dye`}
        className={styles.dyeSample}
        style={{ background: reward.preview.color }}
      />
    )
  const emblem = (id: string) => {
    const item = library?.catalog.find((s) => s.id === id)
    return item ? (
      <EmpireInsignia
        key={id}
        appearance={{
          recipe: { ...defaultInsignia, symbol: id },
          asset_url: item.asset_url,
        }}
        size="medium"
        label={reward.name}
      />
    ) : (
      <span key={id} className={styles.missingPreview}>
        Preview unavailable
      </span>
    )
  }
  if (reward.payload.type === 'emblem_set')
    return (
      <span className={styles.emblemSet}>
        {reward.payload.emblem_ids.map((id) => (
          <span key={id}>
            {emblem(id)}
            {ownedComponents.includes(id) && <small>Already yours</small>}
          </span>
        ))}
      </span>
    )
  if (reward.payload.type === 'emblem') return emblem(reward.payload.emblem_id)
  return <span className={styles.titleSample}>{reward.name}</span>
}

export function rewardPreviewAvailable(
  reward: Reward,
  library: InsigniaState | undefined,
): boolean {
  const payload = reward.payload
  if (payload.type === 'emblem')
    return !!library?.catalog.some((i) => i.id === payload.emblem_id)
  if (reward.payload.type === 'emblem_set')
    return reward.payload.emblem_ids.every((id) =>
      library?.catalog.some((i) => i.id === id),
    )
  if (reward.kind === 'finish' || reward.kind === 'effect')
    return !!reward.preview.treatment
  if (reward.kind === 'dye') return !!reward.preview.color
  return !!reward.name
}
