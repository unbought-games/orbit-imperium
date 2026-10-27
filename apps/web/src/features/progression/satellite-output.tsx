import { ResourceQuantity } from '../../ui/number-value'
import { DetailRow } from './detail-layout'
import type { ProgressionProps } from './shared'
import styles from './detail-layout.module.css'

export function SatelliteOutput({
  view,
  body,
}: Pick<ProgressionProps, 'view' | 'body'>) {
  const production = view.progression.production.find((p) => p.body === body.id)
  const output = production?.solar_satellite
  if (!output)
    return (
      <p className={styles.note}>
        Satellite energy data unavailable for this planet.
      </p>
    )
  return (
    <dl className={styles.compare}>
      <DetailRow
        label="Energy per satellite · 100% production"
        hint="Based on this planet’s maximum temperature."
      >
        <ResourceQuantity resource="energy" value={output.unit_energy} />
      </DetailRow>
      <DetailRow
        label={`Current satellite energy · ${production.settings.solar_satellite}% production`}
      >
        <ResourceQuantity resource="energy" value={output.energy_supply} />
      </DetailRow>
    </dl>
  )
}
