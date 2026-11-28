import type { components } from '../contracts'
import { Link } from '../ui/link'
import { routeTarget } from '../shell/route-target'
import { useGameScreen } from '../shell/screen-context'
import { CoordinateLink } from './coordinate-link'
import { BodyIdentity } from './body-identity'
import { bodyIdentityLabel } from './body-identity-label'
import { BodyIllustration } from './body-illustration'
import { PlayerName } from './player-name'
import { bodyName } from '../ui/format'
import styles from './combat-simulation.module.css'

type Body = Pick<
  components['schemas']['BodyV3'],
  'id' | 'name' | 'kind' | 'coordinates'
>
export function SimulationLocation({
  body,
  owner,
  owned = false,
  label,
  featured = false,
}: {
  body: Body
  owner: string
  owned?: boolean
  label: string
  featured?: boolean
}) {
  const { universeName, view } = useGameScreen()
  const ownedName = (
    <Link {...routeTarget(universeName, 'overview', body.id)}>
      {bodyName(body)}
    </Link>
  )
  const coordinate = (
    <CoordinateLink
      at={body.coordinates}
      target={body.kind === 'Moon' ? 'moon' : 'planet'}
      label={label.toLowerCase()}
    />
  )
  return (
    <div
      className={featured ? styles.matchupLocation : styles.location}
      role="group"
      aria-label={label}
    >
      <BodyIllustration
        body={body}
        className={styles.locationArt}
        sizes={featured ? '(max-width: 620px) 64px, 88px' : '36px'}
      />
      <div>
        <small>
          {label} ·{' '}
          <PlayerName
            player={owner}
            names={'player_names' in view ? view.player_names : undefined}
            fallback={owned ? 'You' : undefined}
          />
        </small>
        {featured ? (
          <>
            <div className={styles.matchupName}>
              {owned ? ownedName : bodyIdentityLabel(body.name, body.kind)}
            </div>
            <div className={styles.matchupCoordinates}>{coordinate}</div>
          </>
        ) : (
          <div>
            {owned ? (
              <>
                {ownedName} · {coordinate}
              </>
            ) : (
              <BodyIdentity
                name={body.name}
                kind={body.kind}
                at={body.coordinates}
                label={label.toLowerCase()}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
