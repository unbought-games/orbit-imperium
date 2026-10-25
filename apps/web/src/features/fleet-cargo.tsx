import type { components } from '../contracts'
import { ResourceSummary } from '../ui/number-value'
import styles from './fleet-cargo.module.css'

/** Current server cargo, never the historical launch intent or paid fuel. */
export function FleetCargo({
  cargo,
}: {
  cargo?: components['schemas']['Resources'] | null
}) {
  return (
    <div className={styles.cargo} role="group" aria-label="Carried resources">
      <span>Cargo</span>
      {cargo ? <ResourceSummary value={cargo} /> : <span>Unavailable</span>}
    </div>
  )
}
