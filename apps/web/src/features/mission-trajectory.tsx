import { Recycle } from 'lucide-react'
import type { components } from '../contracts'
import { CoordinateLink } from './coordinate-link'
import styles from './missions.module.css'
import { BodyIllustration } from './body-illustration'
import { atmosphereArt } from '../ui/artwork'
type Coordinates = components['schemas']['Coordinates']

/** An illustrative route, deliberately independent of elapsed time and distance. */
export function MissionTrajectory({
  origin,
  destination,
  returning = false,
  originIdentity,
  destinationIdentity,
}: {
  origin: Coordinates
  destination?: Coordinates
  returning?: boolean
  originIdentity?: { id: string; name?: string; kind: 'Planet' | 'Moon' }
  destinationIdentity?: {
    id: string
    name?: string
    kind: 'Planet' | 'Moon' | 'Debris'
  }
}) {
  return (
    <figure className={styles.trajectory} aria-label="Mission route schematic">
      <img
        className={styles.atmosphere}
        src={atmosphereArt.src}
        srcSet={atmosphereArt.srcSet}
        sizes="(max-width: 767px) 100vw, 900px"
        width={atmosphereArt.width}
        height={atmosphereArt.height}
        alt=""
        loading="lazy"
        decoding="async"
        onError={(event) => {
          event.currentTarget.style.visibility = 'hidden'
        }}
        onLoad={(event) => {
          event.currentTarget.style.visibility = 'visible'
        }}
      />
      <svg
        viewBox="0 0 800 330"
        preserveAspectRatio="none"
        fill="none"
        aria-hidden="true"
      >
        <g className={styles.orbits} transform="rotate(-22 400 170)">
          <ellipse cx="400" cy="170" rx="125" ry="48" />
          <ellipse cx="400" cy="170" rx="200" ry="79" />
          <ellipse cx="400" cy="170" rx="280" ry="111" />
          <ellipse cx="400" cy="170" rx="365" ry="145" />
          <path d="M35 170h730M400 25v290" strokeDasharray="2 8" />
        </g>
        {destination && (
          <path className={styles.flightPath} d="M133 238Q330 3 678 73" />
        )}
        <circle cx="400" cy="170" r="4" className={styles.star} />
        {destination && (
          <path className={styles.shipMark} d="m385 87 15-11-7 17-2-7-6 1Z" />
        )}
      </svg>
      <div className={styles.routeOrigin}>
        {originIdentity ? (
          <BodyIllustration
            className={styles.worldArt}
            body={{ ...originIdentity, coordinates: origin }}
            sizes="(max-width: 767px) 64px, 96px"
          />
        ) : (
          <span className={styles.unknownWorld} aria-hidden="true" />
        )}
        <span>{returning ? 'Returning to' : 'Origin'}</span>
        <strong>
          {originIdentity?.name && (
            <span title={originIdentity.name}>{originIdentity.name}</span>
          )}
          <CoordinateLink
            at={origin}
            target={originIdentity?.kind === 'Moon' ? 'moon' : 'planet'}
            label="origin"
            className={styles.routeCoordinate}
          />
        </strong>
      </div>
      {destination && (
        <div className={styles.routeDestination}>
          {destinationIdentity?.kind === 'Debris' ? (
            <Recycle className={styles.debrisArt} aria-hidden="true" />
          ) : destinationIdentity ? (
            <BodyIllustration
              className={styles.worldArt}
              body={{
                ...destinationIdentity,
                coordinates: destination,
                kind: destinationIdentity.kind,
              }}
              sizes="(max-width: 767px) 64px, 96px"
            />
          ) : (
            <span className={styles.unknownWorld} aria-hidden="true" />
          )}
          <span>
            {returning
              ? 'From'
              : destinationIdentity?.kind === 'Debris'
                ? 'Debris field'
                : 'Destination'}
          </span>
          <strong>
            {destinationIdentity?.name && (
              <span title={destinationIdentity.name}>
                {destinationIdentity.name}
              </span>
            )}
            <CoordinateLink
              at={destination}
              target={
                destinationIdentity?.kind === 'Moon'
                  ? 'moon'
                  : destinationIdentity?.kind === 'Debris'
                    ? 'debris'
                    : 'planet'
              }
              label="destination"
              className={styles.routeCoordinate}
            />
          </strong>
        </div>
      )}
      <figcaption>Schematic · not to scale</figcaption>
    </figure>
  )
}
