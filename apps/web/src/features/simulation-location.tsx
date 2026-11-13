import type { components } from '../contracts'
import { Link } from '../ui/link'
import { routeTarget } from '../shell/route-target'
import { useGameScreen } from '../shell/screen-context'
import { BodyIdentity } from './body-identity'
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
}: {
  body: Body
  owner: string
  owned?: boolean
  label: string
}) {
  const { universeName, view } = useGameScreen()
  return (
    <div className={styles.location} role="group" aria-label={label}>
      <BodyIllustration
        body={body}
        className={styles.locationArt}
        sizes="36px"
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
        <div>
          {owned && (
            <>
              <Link {...routeTarget(universeName, 'overview', body.id)}>
                {bodyName(body)}
              </Link>
              {' · '}
            </>
          )}
          <BodyIdentity
            name={owned ? undefined : body.name}
            kind={owned ? undefined : body.kind}
            at={body.coordinates}
            label={label.toLowerCase()}
          />
        </div>
      </div>
    </div>
  )
}
