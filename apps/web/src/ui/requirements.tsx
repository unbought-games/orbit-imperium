import { useUniverseName } from '../shell/session-context'
import styles from './requirements.module.css'
import { Text } from './typography'
import { Link } from './link'
import type { components } from '../contracts'
import { label } from './format'
import { catalogPage } from '../shell/catalog-routes'
import { routeTarget } from '../shell/route-target'
type S = components['schemas']
export function Requirements({
  requirements,
  view,
  body,
}: {
  requirements: S['CatalogEntry3']['requirements']
  view: S['BoundView3'] | S['BoundView4']
  body: S['BodyV3']
}) {
  const universeName = useUniverseName()
  return requirements.length ? (
    <ul className={styles['requirements']} aria-label="Prerequisites">
      {requirements.map((r, i) => {
        const id = r.type === 'BodyBuilding' ? r.building : r.research
        const current =
          r.type === 'BodyBuilding'
            ? body.levels[r.building as keyof typeof body.levels]
            : view.research.find((x) => x.research === r.research)?.level
        const page = catalogPage(
          r.type === 'BodyBuilding'
            ? { kind: 'Building', id: r.building }
            : { kind: 'Research', id: r.research },
        )
        return (
          <li key={i}>
            <Link
              data-touch-control=""
              {...routeTarget(universeName, page, body.id, id)}
            >
              {label(id)} {r.level}
            </Link>
            <span>
              {current === undefined
                ? 'Level unavailable'
                : ` · current ${current}${current < r.level ? ' · required' : ' · met'}`}
            </span>
          </li>
        )
      })}
    </ul>
  ) : (
    <Text>Prerequisites: None</Text>
  )
}
