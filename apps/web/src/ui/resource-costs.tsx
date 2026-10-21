import { ResourceShortfall, ResourceNumber } from './number-value'
import type { components } from '../contracts'
import { ResourceMark } from './resource-mark'
import { Popover } from './popover'
import { resourceDecision } from './resource-cost-values'
import { formatWholeNumber } from './whole-number'
import styles from './resource-costs.module.css'
const materials = [
  { name: 'metal', title: 'Metal' },
  { name: 'crystal', title: 'Crystal' },
  { name: 'deuterium', title: 'Deuterium' },
] as const
export function ResourceCosts({
  cost,
  available,
}: {
  cost: components['schemas']['Resources']
  available: components['schemas']['Resources']
}) {
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
                        <ResourceNumber value={cost[name]} />
                      </strong>
                    </p>
                    <p>
                      Available{' '}
                      <strong>
                        <ResourceNumber value={available[name]} />
                      </strong>
                    </p>
                    {shortfall && (
                      <p>
                        Shortfall{' '}
                        <strong>
                          <ResourceShortfall value={shortfall} />
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
                    <ResourceNumber value={available[name]} />
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
                        <ResourceShortfall value={shortfall} />
                      </span>{' '}
                      more
                    </>
                  ) : (
                    <span className={styles.number}>
                      <ResourceNumber value={after} />
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
