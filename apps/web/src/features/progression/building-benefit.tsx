import type { components } from '../../contracts'
import { ResourceNumber } from '../../ui/number-value'

const descriptions = {
  MetalPerHour: ['metal / hour', '100% output · sufficient energy'],
  CrystalPerHour: ['crystal / hour', '100% output · sufficient energy'],
  DeuteriumPerHour: ['deuterium / hour', '100% output · sufficient energy'],
  Energy: ['energy', '100% output'],
  MetalCapacity: ['metal capacity', ''],
  CrystalCapacity: ['crystal capacity', ''],
  DeuteriumCapacity: ['deuterium capacity', ''],
} as const

export function BuildingBenefit({
  benefit,
  target = false,
}: {
  benefit: components['schemas']['BuildingBenefit']
  target?: boolean
}) {
  const [unit, qualifier] = descriptions[benefit.kind]
  return (
    <span>
      <strong>
        <ResourceNumber value={target ? benefit.target : benefit.current} />
      </strong>{' '}
      {unit}
      {qualifier && <small>{qualifier}</small>}
    </span>
  )
}
