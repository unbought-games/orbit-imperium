import { debrisResourceKinds } from './debris-resources'
import { formatWholeNumber } from '../ui/whole-number'
import { formatCompactResource } from '../ui/compact-resource'
import { ResourceValue } from '../ui/resource-value'
import { Button } from '../ui/button'
import type { components } from '../contracts'
import styles from './galaxy.module.css'

type Debris = components['schemas']['GalaxyPosition4']['debris']

/** Whole resource units from the public galaxy projection, not micro-units. */
export function debrisFieldSize(
  metal: string,
  crystal: string,
  deuterium = '0',
) {
  const total = BigInt(metal) + BigInt(crystal) + BigInt(deuterium)
  return total < 10_000n ? 'small' : total < 1_000_000n ? 'medium' : 'large'
}

function DebrisAmount({ value }: { value: string }) {
  const full = formatWholeNumber(value)
  return (
    <span title={full}>
      <span className={styles.debrisExact}>{full}</span>
      <span className={styles.debrisCompact}>
        <span aria-hidden="true">
          {formatCompactResource(BigInt(value) * 1_000_000n)}
        </span>
        <span className={styles.srOnly}>{full}</span>
      </span>
    </span>
  )
}

export function GalaxyDebris({
  debris,
  target,
  onHarvest,
}: {
  debris: NonNullable<Debris>
  target: string
  onHarvest?: (opener: HTMLButtonElement) => void
}) {
  const size = debrisFieldSize(debris.metal, debris.crystal, debris.deuterium)
  const resources = debrisResourceKinds(debris.deuterium)
  const contents = (
    <>
      <img
        src={`/art/debris/debris-${size}.webp`}
        className={styles.debrisArt}
        width={48}
        height={48}
        alt=""
        loading="lazy"
        decoding="async"
      />
      <span className={styles.debrisAmounts}>
        <span className={styles.srOnly}>Debris field</span>
        {resources.map((resource) => (
          <ResourceValue key={resource} resource={resource}>
            <DebrisAmount value={debris[resource] ?? '0'} />
          </ResourceValue>
        ))}
      </span>
    </>
  )
  return onHarvest ? (
    <Button
      type="button"
      variant="ghost"
      className={`${styles.debris} ${styles.debrisTrigger}`}
      aria-label={`Quick harvest debris at ${target}: ${resources.map((resource) => `${resource[0].toUpperCase() + resource.slice(1)} ${formatWholeNumber(debris[resource] ?? '0')}`).join(', ')}`}
      aria-haspopup="dialog"
      title={`Quick harvest · ${size} debris field`}
      onClick={(event) => onHarvest(event.currentTarget)}
    >
      {contents}
    </Button>
  ) : (
    <div
      className={styles.debris}
      aria-label={`${size} debris field`}
      title={`${size[0].toUpperCase()}${size.slice(1)} debris field`}
    >
      {contents}
    </div>
  )
}
