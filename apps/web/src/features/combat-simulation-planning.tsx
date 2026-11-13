import {
  battleEstimates,
  planningSummary,
  type MoonTarget,
  type SimulationResponse,
} from './combat-simulation-model'
import { ResourceValue } from '../ui/resource-value'
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
  const estimates = battleEstimates(result, moonTarget)
  return (
    <>
      <p className={styles.battleDuration}>
        <strong>
          {estimates.averageRounds === null
            ? '—'
            : decimal(estimates.averageRounds)}
        </strong>{' '}
        average battle {estimates.averageRounds === 1 ? 'round' : 'rounds'} ·{' '}
        {result.samples.length} sampled battles
      </p>
      <div className={styles.planningGrid}>
        <section aria-label="Cargo and loot">
          <h4>Cargo & loot</h4>
          {summary.cargo && (
            <p>
              Surviving cargo capacity:{' '}
              <strong>{amount(summary.cargo.average)}</strong> average
            </p>
          )}
          {summary.total && summary.loot ? (
            <>
              <p>
                Estimated loot: <strong>{amount(summary.total.average)}</strong>{' '}
                average
              </p>
              <div className={styles.resourceLine}>
                {summary.loot.map((row) => (
                  <ResourceValue key={row.resource} resource={row.resource}>
                    {amount(row.average)}
                  </ResourceValue>
                ))}
              </div>
              {estimates.cargoCovered !== null && (
                <p>
                  {estimates.victories
                    ? `Cargo covers all available loot in ${estimates.cargoCovered} / ${estimates.victories} victories.`
                    : 'No victorious samples to collect loot.'}
                </p>
              )}
              <small>Observed resources; gross loot before fuel.</small>
            </>
          ) : (
            <p>
              {result.loot_rules_enabled
                ? 'Estimated loot unavailable: resources were not observed. Unknown resources are not treated as zero.'
                : 'Estimated loot unavailable: raiding is not enabled in this universe.'}
            </p>
          )}
        </section>
        <section aria-label="New debris field">
          <h4>New debris field</h4>
          <div className={styles.resourceLine}>
            {summary.debris.map((row) => (
              <ResourceValue key={row.resource} resource={row.resource}>
                {amount(row.average)} average
              </ResourceValue>
            ))}
          </div>
          {estimates.recyclers ? (
            <p>
              <strong>{formatWholeNumber(estimates.recyclers.estimate)}</strong>{' '}
              {estimates.recyclers.estimate === 1n ? 'recycler' : 'recyclers'}{' '}
              estimated for the average field ·{' '}
              <strong>{formatWholeNumber(estimates.recyclers.maximum)}</strong>{' '}
              for the largest sample.
            </p>
          ) : (
            <p>Recycler estimate unavailable under the current rules.</p>
          )}
          <small>
            Newly generated debris only. Existing debris is excluded; collection
            is not simulated.
          </small>
        </section>
        <section aria-label="Moon creation chance">
          <h4>Moon creation</h4>
          <p>
            <strong>
              {estimates.moon
                ? `${decimal(estimates.moon.average)}%`
                : 'Unavailable'}
            </strong>
            {estimates.moon && ' average chance'}
          </p>
          <p>
            {result.moons_enabled === false
              ? 'Moon creation is disabled in this universe.'
              : moonTarget === 'Moon'
                ? 'A battle at a moon cannot create another moon.'
                : moonTarget === 'PlanetWithMoon'
                  ? 'This planet already has a moon.'
                  : moonTarget === 'Unknown'
                    ? 'Conditional: only if the target is a planet without a moon.'
                    : 'Assumes the target planet has no moon.'}
          </p>
        </section>
      </div>
      <details className={styles.resultDetails}>
        <summary>Estimate ranges and assumptions</summary>
        <dl className={styles.survivors}>
          {summary.cargo && (
            <div>
              <dt>Surviving cargo capacity</dt>
              <dd>
                {amount(summary.cargo.minimum)}–{amount(summary.cargo.maximum)}
              </dd>
            </div>
          )}
          {summary.total && (
            <div>
              <dt>Estimated total loot</dt>
              <dd>
                {amount(summary.total.minimum)}–{amount(summary.total.maximum)}
              </dd>
            </div>
          )}
          {summary.debris.map((row) => (
            <div key={row.resource}>
              <dt>Generated debris · {row.resource}</dt>
              <dd>
                <ResourceValue resource={row.resource}>
                  {amount(row.minimum)}–{amount(row.maximum)}
                </ResourceValue>
              </dd>
            </div>
          ))}
          {summary.loot?.map((row) => (
            <div key={row.resource}>
              <dt>Estimated loot · {row.resource}</dt>
              <dd>
                <ResourceValue resource={row.resource}>
                  {amount(row.minimum)}–{amount(row.maximum)}
                </ResourceValue>
              </dd>
            </div>
          ))}
          {estimates.moon && (
            <div>
              <dt>Moon chance</dt>
              <dd>
                {decimal(estimates.moon.minimum)}–
                {decimal(estimates.moon.maximum)}%
              </dd>
            </div>
          )}
        </dl>
        {estimates.recyclers && (
          <p>
            Recycler count rounds up to whole ships using{' '}
            {formatWholeNumber(estimates.recyclers.capacity)} collection
            capacity per empty recycler under this universe’s rules. It covers
            only the generated, harvestable field; existing debris and loaded
            cargo require additional capacity.
          </p>
        )}
        <p>
          Chance is calculated for each battle’s newly generated debris, then
          averaged. Outcomes are samples, not guarantees. Moon eligibility is an
          editable assumption, not a live target check.
        </p>
      </details>
    </>
  )
}
