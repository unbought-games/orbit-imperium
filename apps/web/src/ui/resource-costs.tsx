import { ResourceValue } from './resource-value'
import {
  ResourceShortfall,
  ResourceNumber,
  ResourceQuantity,
} from './number-value'
import type { components } from '../contracts'
import { ResourceMark } from './resource-mark'
import { Popover } from './popover'
import { resourceDecision } from './resource-cost-values'
import { formatWholeNumber } from './whole-number'
import { formatCompactCost, formatCompactResource } from './compact-resource'
import hidden from './visually-hidden.module.css'
import styles from './resource-costs.module.css'
const materials = [
  { name: 'metal', title: 'Metal' },
  { name: 'crystal', title: 'Crystal' },
  { name: 'deuterium', title: 'Deuterium' },
] as const
/** A noninteractive preview inside a link; full prices remain available to assistive technology. */
export function ResourceCostPreview({
  cost,
  energyDemand = null,
}: {
  cost: components['schemas']['Resources'] | null
  energyDemand?: bigint | null
}) {
  const priced = cost
    ? materials.filter(({ name }) => BigInt(cost[name]) > 0n)
    : []
  if (!priced.length && energyDemand === null) return null
  return (
    <span className={styles.preview}>
      {priced.length > 0 && (
        <span className={hidden.hidden}>Next level costs </span>
      )}
      {cost &&
        priced.map(({ name, title }) => {
          const exact = formatWholeNumber(cost[name], 1_000_000) + ' ' + title
          return (
            <span key={name} className={styles.previewAmount} title={exact}>
              <ResourceMark resource={name} width={16} height={16} />
              <span aria-hidden="true">{formatCompactCost(cost[name])}</span>
              <span className={hidden.hidden}>{exact} </span>
            </span>
          )
        })}
      {energyDemand !== null && <EnergyDemandPreview demand={energyDemand} />}
    </span>
  )
}

function EnergyDemandPreview({ demand }: { demand: bigint }) {
  const partial = demand > 0n && demand < 1_000_000n
  const label = partial ? 'less than 1' : formatWholeNumber(demand, 1_000_000)
  const description = `Next level draws ${label} more energy`
  const amount = partial ? '<1' : formatCompactResource(demand)
  return (
    <span className={styles.previewAmount} title={description}>
      <ResourceMark resource="energy" width={16} height={16} />
      <span aria-hidden="true">{amount}</span>
      <span className={hidden.hidden}>{description}</span>
    </span>
  )
}

export function ResourceCosts({
  cost,
  available,
  compact = false,
  placeholder = false,
  showShortfalls = true,
}: {
  compact?: boolean
  placeholder?: boolean
  showShortfalls?: boolean
  cost: components['schemas']['Resources']
  available: components['schemas']['Resources']
}) {
  if (compact)
    return (
      <div
        className={styles.compact}
        role="group"
        aria-label="Required resources"
      >
        {materials
          .filter(({ name }) => BigInt(cost[name]) > 0n)
          .map(({ name, title }) => {
            if (placeholder)
              return (
                <span
                  key={name}
                  className={styles.compactMaterial}
                  aria-label={`${title} amount unavailable`}
                >
                  <ResourceMark resource={name} width={22} height={22} />
                  <strong>—</strong>
                </span>
              )
            const { after, shortfall } = resourceDecision(
              cost[name],
              available[name],
            )
            return (
              <div key={name} data-resource={name}>
                <Popover
                  label={title}
                  className={styles.compactMaterial}
                  trigger={
                    <>
                      <ResourceMark resource={name} width={22} height={22} />
                      <strong>
                        <ResourceNumber value={cost[name]} />
                      </strong>
                    </>
                  }
                >
                  <p>
                    Required{' '}
                    <ResourceQuantity resource={name} value={cost[name]} />
                  </p>
                  <p>
                    Available{' '}
                    <ResourceQuantity resource={name} value={available[name]} />
                  </p>
                  <p>
                    {shortfall ? (
                      <>
                        Shortfall{' '}
                        <ResourceValue resource={name}>
                          <ResourceShortfall value={shortfall} />
                        </ResourceValue>
                      </>
                    ) : (
                      <>
                        After spending{' '}
                        <ResourceQuantity resource={name} value={after} />
                      </>
                    )}
                  </p>
                </Popover>
                {showShortfalls && shortfall && (
                  <small className={styles.shortfall}>
                    Need{' '}
                    <ResourceValue resource={name}>
                      <ResourceShortfall value={shortfall} />
                    </ResourceValue>{' '}
                    more
                  </small>
                )}
              </div>
            )
          })}
      </div>
    )
  const longBalances = materials.some(({ name }) =>
    [cost[name], available[name]].some(
      (value) => formatWholeNumber(value, 1000000).length > 12,
    ),
  )
  return (
    <div
      className={`${styles.costs} ${longBalances ? styles.longBalances : ''}`}
      role="group"
      aria-label="Required resources"
    >
      <table>
        <caption>Cost and balance after spending</caption>
        <thead>
          <tr>
            <th scope="col">Material / cost</th>
            <th scope="col">Available</th>
            <th scope="col">After spending</th>
          </tr>
        </thead>
        <tbody>
          {materials.map(({ name, title }) => {
            const { after, shortfall } = resourceDecision(
              cost[name],
              available[name],
            )
            return (
              <tr key={name}>
                <th scope="row">
                  <Popover
                    label={title}
                    className={styles.material}
                    trigger={
                      <>
                        <ResourceMark resource={name} width={24} height={24} />
                        <span>
                          <span>{title}</span>
                          <strong>
                            <span
                              className={styles.cellLabel}
                              aria-hidden="true"
                            >
                              Cost{' '}
                            </span>
                            <span className={styles.number}>
                              <ResourceNumber value={cost[name]} />
                            </span>
                          </strong>
                        </span>
                      </>
                    }
                  >
                    <p>
                      Required{' '}
                      <strong>
                        <ResourceQuantity resource={name} value={cost[name]} />
                      </strong>
                    </p>
                    <p>
                      Available{' '}
                      <strong>
                        <ResourceQuantity
                          resource={name}
                          value={available[name]}
                        />
                      </strong>
                    </p>
                    {shortfall && (
                      <p>
                        Shortfall{' '}
                        <strong>
                          <ResourceValue resource={name}>
                            <ResourceShortfall value={shortfall} />
                          </ResourceValue>
                        </strong>
                      </p>
                    )}
                  </Popover>
                </th>
                <td>
                  <span className={styles.cellLabel} aria-hidden="true">
                    Available
                  </span>
                  <span className={styles.number}>
                    <ResourceQuantity resource={name} value={available[name]} />
                  </span>
                </td>
                <td className={shortfall ? styles.shortfall : undefined}>
                  <span className={styles.cellLabel} aria-hidden="true">
                    After spending
                  </span>
                  {shortfall ? (
                    <>
                      Need{' '}
                      <span className={styles.number}>
                        <ResourceValue resource={name}>
                          <ResourceShortfall value={shortfall} />
                        </ResourceValue>
                      </span>{' '}
                      more
                    </>
                  ) : (
                    <span className={styles.number}>
                      <ResourceQuantity resource={name} value={after} />
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
