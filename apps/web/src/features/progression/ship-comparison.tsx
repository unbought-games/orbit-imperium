import type { ShipEntry, Research } from './ship-comparison-model'
import { UnitComparison } from './unit-comparison'

export function ShipComparison({
  catalog,
  research,
  initialShipId,
}: {
  catalog: ShipEntry[]
  research: Research
  initialShipId?: string
}) {
  return (
    <UnitComparison
      catalog={catalog}
      research={research}
      initialId={initialShipId}
      kind="Ship"
    />
  )
}
