import type { components } from '../contracts'
import { Popover } from '../ui/popover'
import { coordinates as formatCoordinates } from '../ui/format'
import { BodyIllustration } from './body-illustration'
import styles from './galaxy.module.css'

export function GalaxyMoon({
  moon,
  coordinates,
}: {
  moon: components['schemas']['PublicMoon4']
  coordinates: components['schemas']['Coordinates']
}) {
  return (
    <Popover
      placement="top"
      label={`Moon at ${formatCoordinates({ coordinates })}`}
      className={styles.moonTrigger}
      trigger={
        <BodyIllustration
          body={{ id: moon.id, kind: 'Moon', coordinates }}
          className={styles.moonArt}
          sizes="32px"
        />
      }
    >
      <p>Diameter: {moon.diameter_km.toLocaleString()} km</p>
      <p>Moon operations are not available yet.</p>
    </Popover>
  )
}
