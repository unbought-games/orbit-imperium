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
      <p>
        Assumes empty cargo on arrival. Launch fuel is paid up front; surviving
        arrival capacity has no fuel deduction. This is gross loot before fuel
        costs. See Attack planning for flight estimates and Dispatch for launch
        review.
      </p>
      {summary.loot && summary.total ? (
        <>
          <p>
            Estimated loot: <strong>{amount(summary.total.average)}</strong>{' '}
            average ({amount(summary.total.minimum)}–
            {amount(summary.total.maximum)} across samples). Calculated per
            battle using the universe’s cargo and loot rules and the
            report-observed resources. Defeat, draws and mutual destruction
            contribute zero loot. No capacity means no loot.
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
            Resources may have changed since the observation above. No
            production or spending is forecast. These are sample estimates, not
            guaranteed loot; averages are rounded down to whole resource units.
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
