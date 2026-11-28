import { AverageHaul } from './average-haul'
import {
  battleEstimates,
  planningSummary,
  type MoonTarget,
  type SimulationResponse,
} from './combat-simulation-model'
import { SimulationResourceTable } from './simulation-resource-table'
import { formatWholeNumber } from '../ui/whole-number'
import styles from './combat-simulation.module.css'

const amount = (n: bigint) => formatWholeNumber(n, 1_000_000)
const decimal = (n: number) =>
  n.toLocaleString(undefined, { maximumFractionDigits: 1 })

export function SimulationPlanning({
  result,
  moonTarget,
}: {
  result: SimulationResponse
  moonTarget: MoonTarget
}) {
  const summary = planningSummary(result)
  const { averageRounds, moon, recyclers } = battleEstimates(result, moonTarget)
  const { loot, total } = summary
  const hasHaul = loot !== null && total !== null
  const shortfall = summary.winningCargoShortfall
  return (
    <>
      {averageRounds !== null && (
        <p className={styles.battleDuration}>
          Average Rounds: <strong>{decimal(averageRounds)}</strong>
        </p>
      )}
      <div className={styles.planningGrid} data-haul={hasHaul ? '' : undefined}>
        <section aria-label="Cargo and loot" className={styles.cargoPlanning}>
          <div className={styles.planningPanel}>
            <h4>Cargo & loot</h4>
            <dl className={styles.lootMetrics}>
              {summary.potentialLoot !== null && (
                <div>
                  <dt>Potential loot</dt>
                  <dd>{amount(summary.potentialLoot)}</dd>
                </div>
              )}
              {summary.cargo && (
                <div>
                  <dt>Avg. surviving capacity</dt>
                  <dd>{amount(summary.cargo.average)}</dd>
                </div>
              )}
              {shortfall !== null && (
                <div>
                  <dt>Extra space for full haul</dt>
                  <dd>{formatWholeNumber(shortfall)}</dd>
                </div>
              )}
            </dl>
            {!result.loot_rules_enabled && (
              <p>Raiding disabled in this universe.</p>
            )}
          </div>
          {hasHaul && (
            <div className={styles.planningPanel} data-tone="haul">
              <AverageHaul loot={loot} total={total.average} />
            </div>
          )}
        </section>
        <section
          aria-label="Debris and moon creation"
          className={styles.planningPanel}
          data-tone="debris"
        >
          <SimulationResourceTable
            caption="Debris"
            amounts={summary.debris}
            formatAmount={amount}
            footer={
              <>
                <tr>
                  <th scope="row">Recyclers</th>
                  <td>
                    {!recyclers
                      ? 'Unavailable'
                      : recyclers.estimate === recyclers.maximum
                        ? formatWholeNumber(recyclers.estimate)
                        : `${formatWholeNumber(recyclers.estimate)} average · ${formatWholeNumber(recyclers.maximum)} max`}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Moon creation</th>
                  <td>{moon ? `${decimal(moon.average)}%` : 'Unavailable'}</td>
                </tr>
              </>
            }
          />
        </section>
      </div>
    </>
  )
}
