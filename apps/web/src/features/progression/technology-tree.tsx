import { Link } from '../../ui/link'
import { useUniverseName } from '../../shell/session-context'
import { routeTarget } from '../../shell/route-target'
import { catalogPage } from '../../shell/catalog-routes'
import type { components } from '../../contracts'
import { CatalogImage } from '../../ui/image-catalog'
import { label } from '../../ui/format'
import { catalogContent } from './catalog-content'
import type { ProgressionProps } from './shared'
import styles from './technology-dialog.module.css'
type Entry = components['schemas']['CatalogEntry3']
type Key = Entry['key']
export function technologyLevel(
  key: Key,
  { view, body }: Pick<ProgressionProps, 'view' | 'body'>,
): number {
  return key.kind === 'Building'
    ? (body.levels[key.id as keyof typeof body.levels] ?? 0)
    : key.kind === 'Research'
      ? (view.research.find((x) => x.research === key.id)?.level ?? 0)
      : 0
}
export function requirementKey(r: Entry['requirements'][number]): Key {
  return r.type === 'BodyBuilding'
    ? { kind: 'Building', id: r.building }
    : { kind: 'Research', id: r.research }
}

/** The actual tree is independent of dialog mounting and native modal behavior. */
export function TechnologyTree({
  entry,
  onNavigate,
  ...props
}: Pick<ProgressionProps, 'view' | 'body'> & {
  entry: Entry
  onNavigate: () => void
}) {
  const universeName = useUniverseName()
  function node(key: Key, required: number | null, path: string[] = []) {
    const identity = `${key.kind}:${key.id}`
    const found = props.view.catalog.find(
      (x) => x.key.kind === key.kind && x.key.id === key.id,
    )
    const level = technologyLevel(key, props)
    const met = required === null || level >= required
    const requirements = path.includes(identity)
      ? []
      : (found?.requirements ?? [])
    return (
      <li key={identity}>
        <div className={met ? styles.met : styles.missing}>
          <CatalogImage art={catalogContent(key).art} />
          <Link
            data-touch-control=""
            {...routeTarget(
              universeName,
              catalogPage(key),
              props.body.id,
              key.id,
            )}
            onClick={onNavigate}
          >
            {label(key.id)}
          </Link>
          {required !== null ? (
            <span>
              {level} / {required} · {met ? 'Met' : 'Required'}
            </span>
          ) : (
            <span>
              {key.kind === 'Building' || key.kind === 'Research'
                ? `Level ${level}`
                : key.kind}
            </span>
          )}
        </div>
        {requirements.length > 0 && (
          <ul>
            {requirements.map((r) =>
              node(requirementKey(r), r.level, [...path, identity]),
            )}
          </ul>
        )}
      </li>
    )
  }
  return <ul className={styles.tree}>{node(entry.key, null)}</ul>
}
