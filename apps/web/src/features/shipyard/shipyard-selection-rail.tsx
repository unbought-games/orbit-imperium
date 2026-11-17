import type { components } from '../../contracts'
import type { ShipEquipment } from '../../client-model/ship-appearance-types'
import type { CatalogSelection } from '../../shell/use-catalog-selection'
import { label } from '../../ui/format'
import { NumberValue } from '../../ui/number-value'
import { shipGroup, shipGroups } from '../ship-order'
import { ShipAppearanceImage } from './ship-appearance-image'
import styles from './shipyard.module.css'

type Entry = components['schemas']['CatalogEntry3']

export function ShipyardSelectionRail({
  entries,
  selection,
  equipment,
  count,
  status,
}: {
  entries: Entry[]
  selection: CatalogSelection
  equipment?: readonly ShipEquipment[]
  count: (target: string) => string
  status: (entry: Entry) => string
}) {
  return (
    <nav className={styles.rail} aria-label="Choose a ship">
      {shipGroups.map((group) => {
        const ships = entries.filter((entry) => shipGroup(entry) === group)
        if (!ships.length) return null
        return (
          <section
            key={group}
            className={styles.group}
            aria-label={`${group} ships`}
          >
            <h2>{group} ships</h2>
            <div className={styles.ships}>
              {ships.map((entry) => (
                <a
                  key={entry.key.id}
                  {...selection.link(entry.key.id)}
                  className={styles.ship}
                  aria-current={
                    selection.selectedId === entry.key.id ? 'page' : undefined
                  }
                  aria-label={`Build ${label(entry.key.id)}`}
                >
                  <ShipAppearanceImage
                    item={entry.key}
                    equipment={equipment}
                    sizes="40px"
                    width={40}
                    height={40}
                  />
                  <span>
                    <strong>{label(entry.key.id)}</strong>
                    <small>
                      <NumberValue value={count(entry.key.id)} /> stationed
                    </small>
                    {status(entry) && <small>{status(entry)}</small>}
                  </span>
                </a>
              ))}
            </div>
          </section>
        )
      })}
    </nav>
  )
}
