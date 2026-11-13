import type { Coordinator } from '../client-model/coordinator'
import { observedLootPlan } from './dispatch-loot-model'
import { NumberValue, ResourceSummary, DurationValue } from '../ui/number-value'
import { Heading, Text } from '../ui/typography'
import styles from './missions.module.css'
import { useDispatchLoot } from './use-dispatch-loot'

export function DispatchLoot({
  model,
  target,
  revision,
  now,
  space,
}: {
  model: Coordinator
  target?: { id: string; owner: string; kind: 'Planet' | 'Moon' }
  revision: string
  now: number
  space: { remaining: bigint | null } | null
}) {
  const { id, current, observed } = useDispatchLoot(model, target, revision)
  const plan = observed ? observedLootPlan(observed.resources) : null
  return (
    <section
      aria-label="Observed raid resources"
      className={styles.lootPlanning}
    >
      <Heading level={3} className={styles.reviewGroupHeading}>
        Raid cargo planning
      </Heading>
      {observed && plan ? (
        <>
          {current?.error && (
            <Text className={styles.lootText} role="status">
              Unable to refresh. Showing the last received observation.
            </Text>
          )}
          <Text className={styles.lootText}>
            <time
              dateTime={new Date(observed.observedAt).toISOString()}
              title={new Date(observed.observedAt).toLocaleString()}
            >
              Observed{' '}
              <DurationValue
                milliseconds={Math.max(0, now - observed.observedAt)}
              />{' '}
              ago
            </time>
          </Text>
          <Text className={styles.lootText}>
            Observed resources: <ResourceSummary value={observed.resources} />
          </Text>
          <Text className={styles.lootText}>
            Potential loot: <ResourceSummary value={plan.loot} />
          </Text>
          <Text className={styles.lootText}>
            Estimated free cargo needed:{' '}
            <strong>
              <NumberValue value={plan.required} />
            </strong>
            .
            {space?.remaining !== null && space?.remaining !== undefined && (
              <>
                {' '}
                Selected fleet: <NumberValue value={space.remaining} /> free
                {space.remaining < plan.required ? (
                  <>
                    {' '}
                    · <NumberValue
                      value={plan.required - space.remaining}
                    />{' '}
                    more needed
                  </>
                ) : (
                  ' · enough before losses'
                )}
                .
              </>
            )}
          </Text>
          <Text className={styles.lootText}>
            Historical snapshot; loot is not guaranteed. Assumes victory and
            surviving cargo space. Resources may have changed.
          </Text>
        </>
      ) : (
        <Text className={styles.lootText}>
          {!id
            ? 'Choose a known target to check your observations.'
            : !current
              ? 'Checking your latest espionage observation…'
              : current.error
                ? 'Unable to load your observation. Cargo needs are unknown.'
                : 'No known resources in your latest espionage observation. Cargo needs are unknown.'}
        </Text>
      )}
    </section>
  )
}
