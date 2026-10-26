import type { components } from '../contracts'
import { label } from '../ui/format'
import { NumberValue } from '../ui/number-value'
import styles from './ship-composition.module.css'

export function ShipComposition({
  ships,
}: {
  ships: components['schemas']['PublicShip4'][]
}) {
  return (
    <ul className={styles.ships} aria-label="Ship composition">
      {ships.map((ship, index) => (
        <li key={`${ship.ship_type}-${index}`}>
          <span>{label(ship.ship_type)}</span>{' '}
          <span className={styles.count}>
            <NumberValue value={ship.count} />
          </span>
        </li>
      ))}
    </ul>
  )
}
