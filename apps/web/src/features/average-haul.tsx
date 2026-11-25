import { formatWholeNumber } from '../ui/whole-number'
import {
  SimulationResourceTable,
  type ResourceAverages,
} from './simulation-resource-table'

function averageAmount(micro: bigint) {
  const whole = formatWholeNumber(micro, 1_000_000)
  const fraction = (micro % 1_000_000n)
    .toString()
    .padStart(6, '0')
    .replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : whole
}

export function AverageHaul({
  loot,
  total,
}: {
  loot: ResourceAverages
  total: bigint
}) {
  return (
    <SimulationResourceTable
      caption="Haul"
      amounts={loot}
      formatAmount={averageAmount}
      footer={
        <tr>
          <th scope="row">Total</th>
          <td>{averageAmount(total)}</td>
        </tr>
      }
    />
  )
}
