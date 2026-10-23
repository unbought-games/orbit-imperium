import { Button } from '../ui/button'
import type { BoundView } from '../client-model/commands'
import { bodyName, coordinates } from '../ui/format'
import { classes } from '../ui/classes'
import styles from './planet-rail.module.css'
export function PlanetRail({
  view,
  selected,
  onSelect,
}: {
  view: BoundView
  selected?: string
  onSelect: (id: string) => void
}) {
  const planets = view.bodies.filter((b) => b.kind === 'Planet').length
  return (
    <aside className={styles.rail} aria-label="Planets and moons">
      <h2>
        {planets} {planets === 1 ? 'Planet' : 'Planets'}
      </h2>
      <div className={styles.bodies}>
        {view.bodies.map((b) => (
          <Button
            variant="ghost"
            type="button"
            key={b.id}
            aria-pressed={b.id === selected}
            onClick={() => onSelect(b.id)}
          >
            <span
              className={classes(styles.orb, b.kind === 'Moon' && styles.moon)}
              aria-hidden="true"
            />
            <strong>{bodyName(b)}</strong>
            <span>{coordinates(b)}</span>
            {b.id === selected && <small>Selected</small>}
          </Button>
        ))}
      </div>
    </aside>
  )
}
