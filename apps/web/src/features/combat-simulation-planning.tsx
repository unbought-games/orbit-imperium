import {
  planningSummary,
  type SimulationResponse,
} from './combat-simulation-model'
import { ResourceValue } from '../ui/resource-value'
import { formatWholeNumber } from '../ui/whole-number'
import styles from './combat-simulation.module.css'

const amount = (n: bigint) => formatWholeNumber(n, 1_000_000)

export function SimulationPlanning({ result }: { result: SimulationResponse }) {
  const summary = planningSummary(result)
  return (
    <div>
      <h4>Surviving cargo capacity and estimated loot</h4>
      {summary.cargo && (
        <p>
          Surviving cargo capacity:{' '}
          <strong>{amount(summary.cargo.average)}</strong> average (
          {amount(summary.cargo.minimum)}–{amount(summary.cargo.maximum)} across
          samples).
        </p>
      )}
      {summary.loot && summary.total ? (
        <>
          <p>
            Estimated loot: <strong>{amount(summary.total.average)}</strong>{' '}
            average ({amount(summary.total.minimum)}–
            {amount(summary.total.maximum)} across samples).
          </p>
          <dl className={styles.survivors}>
            {summary.loot.map((row) => (
              <div key={row.resource}>
                <dt>
                  <ResourceValue resource={row.resource}>
                    {amount(row.average)} average
                  </ResourceValue>
                </dt>
                <dd>
                  <ResourceValue resource={row.resource}>
                    {amount(row.minimum)}–{amount(row.maximum)}
                  </ResourceValue>{' '}
                  range
                </dd>
              </div>
            ))}
          </dl>
          <p>
            Based on observed resources; current stock may differ. Gross loot
            before fuel costs.
          </p>
        </>
      ) : (
        <p>
          {result.loot_rules_enabled
            ? 'Estimated loot unavailable: resources were not observed. Unknown resources are not treated as zero.'
            : 'Estimated loot unavailable: raiding is not enabled in this universe.'}
        </p>
      )}
    </div>
  )
}
