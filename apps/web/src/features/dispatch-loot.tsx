import { Eye, Check, PackagePlus } from 'lucide-react'
import type { Coordinator } from '../client-model/coordinator'
import { observedLootPlan } from './dispatch-loot-model'
import { NumberValue, ResourceSummary } from '../ui/number-value'
import { Heading, Text } from '../ui/typography'
import { Link } from '../ui/link'
import { routeTarget } from '../shell/route-target'
import styles from './missions.module.css'
import { useDispatchLoot } from './use-dispatch-loot'

export function DispatchLoot({
  model,
  target,
  revision,
  space,
  hasShips,
  universeName,
  origin,
}: {
  model: Coordinator
  target?: { id: string; owner: string; kind: 'Planet' | 'Moon' }
  revision: string
  space: { remaining: bigint | null } | null
  hasShips: boolean
  universeName: string
  origin: string
}) {
  const { id, current, observed } = useDispatchLoot(model, target, revision)
  const plan = observed
    ? observedLootPlan(observed.resources, space?.remaining)
    : null
  const allFits = plan?.carried === plan?.total
  return (
    <section aria-label="Raid cargo planning" className={styles.lootPlanning}>
      <header className={styles.lootHeader}>
        <Heading level={3}>Raid cargo planning</Heading>
        {current?.report && (
          <Link
            {...routeTarget(universeName, 'reports', origin, current.report.id)}
            className={styles.lootReport}
            title={`Espionage report · ${new Date(current.report.observed_at).toLocaleString()}`}
          >
            <Eye size={16} aria-hidden="true" />
            Report
          </Link>
        )}
      </header>
      {observed && plan ? (
        <>
          {current?.error && (
            <Text className={styles.lootText} role="status">
              Unable to refresh. Showing the last received report.
            </Text>
          )}
          <div className={styles.lootResources}>
            <span>Potential loot</span>
            <ResourceSummary value={plan.loot} layout="grid" />
          </div>
          <div
            className={styles.lootFit}
            data-fits={hasShips && plan.carried !== null ? allFits : undefined}
            aria-live="polite"
          >
            {plan.total === 0n ? (
              'No loot in this report.'
            ) : !hasShips ? (
              'Select ships to see how much loot they can carry.'
            ) : !space ? (
              'Calculating cargo space…'
            ) : plan.carried === null ? (
              'Enter valid cargo amounts to see what fits.'
            ) : (
              <>
                {allFits ? (
                  <Check size={16} aria-hidden="true" />
                ) : (
                  <PackagePlus size={16} aria-hidden="true" />
                )}
                <span>
                  {allFits ? (
                    <>
                      Enough cargo space for all{' '}
                      <NumberValue value={plan.total} /> loot.
                    </>
                  ) : (
                    <>
                      Can carry <NumberValue value={plan.carried} /> of{' '}
                      <NumberValue value={plan.total} /> loot.
                      <small>
                        <NumberValue
                          value={plan.required - (space.remaining ?? 0n)}
                        />{' '}
                        more free cargo space needed.
                      </small>
                    </>
                  )}
                </span>
              </>
            )}
          </div>
        </>
      ) : (
        <Text className={styles.lootText}>
          {!id
            ? 'Choose a target to check its espionage report.'
            : !current
              ? 'Loading espionage report…'
              : current.error
                ? 'Unable to load the report. Loot is unknown.'
                : 'No resource information in the latest espionage report. Loot is unknown.'}
        </Text>
      )}
    </section>
  )
}
