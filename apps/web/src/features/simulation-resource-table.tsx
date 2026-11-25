import type { ReactNode } from 'react'
import type { resourceNames } from '../client-model/resources'
import { ResourceValue } from '../ui/resource-value'
import styles from './combat-simulation.module.css'

export type ResourceAverages = readonly {
  resource: (typeof resourceNames)[number]
  average: bigint
}[]

export function SimulationResourceTable({
  caption,
  amounts,
  formatAmount,
  footer,
}: {
  caption: string
  amounts: ResourceAverages
  formatAmount: (average: bigint) => string
  footer: ReactNode
}) {
  return (
    <table className={styles.resourceTable}>
      <caption>{caption}</caption>
      <tbody>
        {amounts.map(({ resource, average }) => (
          <tr key={resource}>
            <th scope="row">{resource[0].toUpperCase() + resource.slice(1)}</th>
            <td>
              <ResourceValue resource={resource}>
                {formatAmount(average)}
              </ResourceValue>
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>{footer}</tfoot>
    </table>
  )
}
