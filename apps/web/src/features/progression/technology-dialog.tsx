import { Button } from '../../ui/button'
import { Link } from '../../ui/link'
import { useUniverseName } from '../../shell/session-context'
import { routeTarget } from '../../shell/route-target'
import { catalogPage } from '../../shell/catalog-routes'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import type { components } from '../../contracts'
import { CatalogImage } from '../../ui/image-catalog'
import { label } from '../../ui/format'
import { Requirements } from '../../ui/requirements'
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
export function TechnologyDialog({
  entry,
  onClose,
  ...props
}: ProgressionProps & { entry: Entry; onClose: () => void }) {
  const universeName = useUniverseName()
  const ref = useRef<HTMLDialogElement>(null)
  const [tab, setTab] = useState('Techtree')
  useEffect(() => {
    const dialog = ref.current!
    dialog.showModal()
    return () => dialog.close()
  }, [])
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
            {...routeTarget(
              universeName,
              catalogPage(key),
              props.body.id,
              key.id,
            )}
            onClick={onClose}
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
  const applications = props.view.catalog.filter((x) =>
    x.requirements.some((r) => {
      const key = requirementKey(r)
      return key.kind === entry.key.kind && key.id === entry.key.id
    }),
  )
  return createPortal(
    <dialog
      ref={ref}
      className={styles.dialog}
      onClose={onClose}
      onKeyDown={(e) => e.stopPropagation()}
      aria-label={`Technology — ${label(entry.key.id)}`}
    >
      <header>
        <h2>Technology — {label(entry.key.id)}</h2>
        <Button
          variant="secondary"
          type="button"
          size="icon"
          aria-label="Close technology"
          onClick={() => ref.current?.close()}
        >
          <X size={20} />
        </Button>
      </header>
      <div
        className={styles.tabs}
        role="tablist"
        aria-label="Technology information"
      >
        {['Techtree', 'Applications', 'Techinfo'].map((t) => (
          <Button
            variant="ghost"
            type="button"
            key={t}
            role="tab"
            id={`technology-${t}`}
            aria-controls="technology-panel"
            aria-selected={tab === t}
            tabIndex={tab === t ? 0 : -1}
            onKeyDown={(event) => {
              const tabs = ['Techtree', 'Applications', 'Techinfo']
              const index = tabs.indexOf(t)
              const next =
                event.key === 'ArrowRight'
                  ? tabs[(index + 1) % tabs.length]
                  : event.key === 'ArrowLeft'
                    ? tabs[(index + tabs.length - 1) % tabs.length]
                    : event.key === 'Home'
                      ? tabs[0]
                      : event.key === 'End'
                        ? tabs[tabs.length - 1]
                        : null
              if (next) {
                event.preventDefault()
                setTab(next)
                document.getElementById(`technology-${next}`)?.focus()
              }
            }}
            onClick={() => setTab(t)}
          >
            {t}
          </Button>
        ))}
      </div>
      <div
        id="technology-panel"
        role="tabpanel"
        aria-labelledby={`technology-${tab}`}
        className={styles.content}
      >
        {tab === 'Techtree' && (
          <>
            <p>Prerequisites · current / required level on this planet</p>
            <ul className={styles.tree}>{node(entry.key, null)}</ul>
            {!entry.requirements.length && <p>No prerequisites.</p>}
          </>
        )}
        {tab === 'Applications' &&
          (applications.length ? (
            <div className={styles.applications}>
              {applications.map((x) => (
                <section key={`${x.key.kind}:${x.key.id}`}>
                  <CatalogImage art={catalogContent(x.key).art} />
                  <h3>
                    <Link
                      {...routeTarget(
                        universeName,
                        catalogPage(x.key),
                        props.body.id,
                        x.key.id,
                      )}
                      onClick={onClose}
                    >
                      {label(x.key.id)}
                    </Link>
                  </h3>
                  <p>
                    {x.enabled
                      ? 'Available in this universe'
                      : 'Unavailable in this universe'}
                  </p>
                  <Requirements
                    requirements={x.requirements}
                    view={props.view}
                    body={props.body}
                  />
                </section>
              ))}
            </div>
          ) : (
            <p>No catalog entries require this technology.</p>
          ))}
        {tab === 'Techinfo' && (
          <>
            <h3>{label(entry.key.id)}</h3>
            <p>{catalogContent(entry.key).description}</p>
            <p>
              {entry.enabled
                ? 'Available in this universe'
                : 'Unavailable in this universe'}
            </p>
            <Requirements
              requirements={entry.requirements}
              view={props.view}
              body={props.body}
            />
          </>
        )}
      </div>
    </dialog>,
    document.body,
  )
}
