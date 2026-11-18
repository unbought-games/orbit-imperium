import { SimulationDisclosure } from './simulation-disclosure'
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
          <dl className={styles.lootMetrics}>
            {summary.potentialLoot !== null && (
              <div>
                <dt>Potential loot · unlimited cargo</dt>
                <dd>{amount(summary.potentialLoot)}</dd>
              </div>
            )}
            {summary.cargo && (
              <div>
                <dt>Average surviving cargo capacity</dt>
                <dd>{amount(summary.cargo.average)}</dd>
              </div>
            )}
            {summary.total && summary.loot && (
              <div>
                <dt>Average gross haul</dt>
                <dd>{amount(summary.total.average)}</dd>
                <dd className={styles.haulBreakdown}>
                  {summary.loot.map((row) => (
                    <ResourceValue key={row.resource} resource={row.resource}>
                      {amount(row.average)}
                    </ResourceValue>
                  ))}
                </dd>
              </div>
            )}
          </dl>
          {summary.total ? (
            <>
              {summary.potentialLoot === 0n ? (
                <p>The observed resources yield no raid loot.</p>
              ) : estimates.victories === 0 ? (
                <p>No attacker victories in this sample.</p>
              ) : (
                estimates.cargoCovered !== null && (
                  <p>
                    <strong>
                      {estimates.cargoCovered} of {estimates.victories}
                    </strong>{' '}
                    attacker victories collected the full potential loot.
                  </p>
                )
              )}
              <small>
                Averages include every battle. Ships arrive empty, so launch
                fuel uses no space at the target. Net haul after fuel is gross
                haul minus the deuterium spent at launch.
              </small>
            </>
          ) : (
            <p>
              {result.loot_rules_enabled
                ? 'Loot is unknown because target resources were not observed.'
                : 'Loot is unavailable because raiding is disabled in this universe.'}
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
      <SimulationDisclosure
        section="ranges"
        className={styles.resultDetails}
        summary="Estimate ranges and assumptions"
      >
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
              <dt>Gross haul</dt>
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
              <dt>Gross haul · {row.resource}</dt>
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
        {summary.potentialLoot !== null && summary.potentialLoot > 0n && (
          <p>
            Potential loot is the most a victory can take from the observed
            resources under this universe’s raid rules. Each victory counts
            toward full coverage only when it collects that amount of every
            resource. Loading each resource in turn can leave cargo space
            unused. Other outcomes contribute zero haul to the average.
          </p>
        )}
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
          averaged. Outcomes are samples, not guarantees. A new moon requires a
          planet without an existing moon.
        </p>
      </SimulationDisclosure>
    </>
  )
}
