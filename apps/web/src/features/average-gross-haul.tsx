import type { resourceNames } from '../client-model/resources'
import { ResourceValue } from '../ui/resource-value'
import { formatWholeNumber } from '../ui/whole-number'
import styles from './combat-simulation.module.css'

function averageAmount(micro: bigint) {
  const whole = formatWholeNumber(micro, 1_000_000)
  const fraction = (micro % 1_000_000n)
    .toString()
    .padStart(6, '0')
    .replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : whole
}

export function AverageGrossHaul({
  loot,
  total,
}: {
  loot: readonly { resource: (typeof resourceNames)[number]; average: bigint }[]
  total: bigint
}) {
  return (
    <table className={styles.haulTable}>
      <caption>Average gross haul</caption>
      <tbody>
        {loot.map(({ resource, average }) => (
          <tr key={resource}>
            <th scope="row">{resource[0].toUpperCase() + resource.slice(1)}</th>
            <td>
              <ResourceValue resource={resource}>
                {averageAmount(average)}
              </ResourceValue>
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row">Total</th>
          <td>{averageAmount(total)}</td>
        </tr>
      </tfoot>
    </table>
  )
}
