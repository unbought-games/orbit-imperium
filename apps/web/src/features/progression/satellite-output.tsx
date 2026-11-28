import { routeTarget } from '../../shell/route-target'
import { useUniverseName } from '../../shell/session-context'
import { Link } from '../../ui/link'
import { ResourceQuantity } from '../../ui/number-value'
import { ResourceValue } from '../../ui/resource-value'
import {
  satelliteOrderEnergy,
  formatEnergyGain,
} from './satellite-order-energy'
import type { unitCounts } from './unit-counts'
import { DetailRow } from './detail-layout'
import type { ProgressionProps } from './shared'
import styles from './detail-layout.module.css'

export function SatelliteOutput({
  view,
  body,
  inventory,
  quantity,
}: Pick<ProgressionProps, 'view' | 'body'> & {
  inventory: Pick<ReturnType<typeof unitCounts>, 'stationed' | 'ordered'>
  quantity: string | undefined
}) {
  if (body.kind === 'Moon')
    return (
      <p className={styles.note}>
        Solar Satellites produce no energy on moons.
      </p>
    )
  const production = view.progression.production.find((p) => p.body === body.id)
  const output = production?.solar_satellite
  if (!output)
    return (
      <p className={styles.note}>
        Satellite energy data unavailable for this planet.
      </p>
    )
  const percent = production.settings.solar_satellite
  const gain = quantity
    ? satelliteOrderEnergy(
        output.unit_energy,
        percent,
        inventory.stationed,
        inventory.ordered,
        quantity,
      )
    : null
  return (
    <dl className={styles.compare}>
      <DetailRow label="Planet energy per satellite">
        <ResourceQuantity resource="energy" value={output.unit_energy} />
      </DetailRow>
      <DetailRow label="Energy added">
        {gain === null ? (
          '—'
        ) : (
          <>
            {percent < 100 && (
              <small>
                <SatelliteProductionLink
                  body={body.id}
                  percent={percent}
                />{' '}
              </small>
            )}
            <ResourceValue resource="energy">
              {formatEnergyGain(gain)}
            </ResourceValue>
          </>
        )}
      </DetailRow>
    </dl>
  )
}

function SatelliteProductionLink({
  body,
  percent,
}: {
  body: string
  percent: number
}) {
  const universe = useUniverseName()
  return (
    <Link
      {...routeTarget(universe, 'resource-settings', body)}
      className={styles.inlineLink}
      aria-label={`${percent}% production. Open Resource settings`}
    >
      ({percent}% production)
    </Link>
  )
}
