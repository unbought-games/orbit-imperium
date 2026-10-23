import { bodyName } from '../ui/format'
import type { components } from '../contracts'
import styles from './galaxy.module.css'
import { BodyIllustration } from './body-illustration'

export function GalaxyAtlas({
  system,
}: {
  system: components['schemas']['GalaxySystem4']
}) {
  return (
    <nav className={styles.atlas} aria-label="System atlas">
      <svg
        className={styles.atlasOrbits}
        viewBox="0 0 800 200"
        preserveAspectRatio="none"
        fill="none"
        aria-hidden="true"
      >
        <g transform="rotate(-8 400 100)">
          <ellipse cx="400" cy="100" rx="160" ry="34" />
          <ellipse cx="400" cy="100" rx="265" ry="63" />
          <ellipse cx="400" cy="100" rx="380" ry="92" />
        </g>
      </svg>
      {system.positions.map((position) => (
        <a
          key={position.coordinates.position}
          href={`#position-${position.coordinates.position}`}
          className={styles.atlasPosition}
          aria-label={`Position ${position.coordinates.position}${position.body ? ` · ${bodyName(position.body)}` : ' · Empty'}`}
        >
          {position.body ? (
            <BodyIllustration
              body={{ ...position.body, coordinates: position.coordinates }}
              className={styles.atlasPlanet}
              sizes="48px"
            />
          ) : (
            <span className={styles.atlasEmpty} aria-hidden="true" />
          )}
          <span>{position.coordinates.position}</span>
        </a>
      ))}
      <span className={styles.atlasCaption}>
        System atlas · schematic, not to scale
      </span>
    </nav>
  )
}
