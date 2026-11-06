import type { components } from '../../contracts'
import { bodyName, coordinates } from '../../ui/format'
import { Link } from '../../ui/link'
import { useUniverseName } from '../../shell/session-context'
import { routeTarget } from '../../shell/route-target'
import { DetailRow } from './detail-layout'
import styles from './detail-layout.module.css'

/** Display the server-selected labs, including the immutable active snapshot. */
export function ResearchLabs({
  labs,
  host,
  bodies,
  active = false,
}: {
  labs: components['schemas']['LabTerm'][]
  host: string
  bodies: components['schemas']['BodyV3'][]
  active?: boolean
}) {
  const universe = useUniverseName()
  return (
    <details className={styles.technical}>
      <summary>Contributing laboratories · {labs.length}</summary>
      <dl className={styles.compare}>
        {labs.map((lab) => {
          const body = bodies.find((body) => body.id === lab.body)
          return (
            <DetailRow
              key={lab.body}
              label={
                body ? (
                  <Link {...routeTarget(universe, 'research', body.id)}>
                    {bodyName(body)} {coordinates(body)}
                    {body.id === host ? ' · Origin' : ''}
                  </Link>
                ) : (
                  'Unavailable planet'
                )
              }
            >
              Lab {lab.level}
            </DetailRow>
          )
        })}
      </dl>
      <p className={styles.note}>
        {active
          ? 'These lab levels and the completion time were fixed when research started.'
          : 'The origin always participates. The highest eligible remote labs are selected automatically; each must meet this technology’s lab requirement.'}{' '}
        Only the origin pays. Research and lab upgrades or demolition anywhere
        in your empire cannot overlap.
      </p>
    </details>
  )
}
