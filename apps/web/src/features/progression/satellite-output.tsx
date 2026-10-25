import { ResourceQuantity } from '../../ui/number-value'
import { DetailRow } from './detail-layout'
import type { ProgressionProps } from './shared'
import styles from './detail-layout.module.css'

export function SatelliteOutput({
  view,
  body,
}: Pick<ProgressionProps, 'view' | 'body'>) {
  const output = view.progression.production.find(
    (p) => p.body === body.id,
  )?.solar_satellite
  if (!output) return null
  return (
    <dl className={styles.compare}>
      <DetailRow
        label="Energy per satellite on this planet"
        hint="At 100% production, based on this planet’s maximum temperature."
      >
        <ResourceQuantity resource="energy" value={output.unit_energy} />
      </DetailRow>
      <DetailRow label="Current satellite energy">
        <ResourceQuantity resource="energy" value={output.energy_supply} />
      </DetailRow>
    </dl>
  )
}
