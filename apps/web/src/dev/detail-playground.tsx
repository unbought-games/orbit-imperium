import { useEffect, useState } from 'react'
import { useStore } from 'zustand'
import {
  createMemoryHistory,
  RouterContextProvider,
} from '@tanstack/react-router'
import { createAppRouter } from '../router'
import { SessionContext } from '../shell/session-context'
import { catalogPage, catalogSlug } from '../shell/catalog-routes'
import { ResourceStrip } from '../ui/resource-strip'
import { Button } from '../ui/button'
import { projectGameView } from '../client-model/game-projection'
import { BuildingDetails } from '../features/progression/building-details'
import { TechnologyDetails } from '../features/progression/technology-details'
import { TechnologyDialog } from '../features/progression/technology-dialog'
import { catalogContent } from '../features/progression/catalog-content'
import { technologyRequest } from '../features/progression/options'
import { useProgressionOptions } from '../features/progression/use-progression-options'
import {
  scenes,
  createDetailPreview,
  type SceneId,
} from './detail-playground-fixtures'
import type { ProgressionProps } from '../features/progression/shared'
import styles from './detail-playground.module.css'

type Preview = Awaited<ReturnType<typeof createDetailPreview>>
function ItemPreview({ runtime }: { runtime: Preview }) {
  const { model } = runtime
  const [trail, setTrail] = useState([runtime.entry.key.id])
  const state = useStore(model.store)
  const view = projectGameView(state)
  const [action, setAction] = useState<'Upgrade' | 'Demolition'>('Upgrade')
  const [quantity, setQuantity] = useState('1')
  const [technology, setTechnology] = useState(false)
  const [router] = useState(() =>
    createAppRouter({
      history: createMemoryHistory({ initialEntries: ['/'] }),
    }),
  )
  useEffect(() => {
    const timer = setInterval(() => {
      model.tick()
      void runtime.advance()
    }, 250)
    return () => clearInterval(timer)
  }, [model, runtime])
  if (!view || view.protocol === 2) return null
  const entry =
    view.catalog.find((entry) => entry.key.id === trail[trail.length - 1]) ??
    runtime.entry
  const resetEdits = () => {
    setAction('Upgrade')
    setQuantity('1')
    setTechnology(false)
  }
  return (
    <RouterContextProvider router={router}>
      <SessionContext.Provider
        value={{
          universeName: 'Andromeda',
          model,
          view,
          logout: async () => {},
          commands: {
            model,
            view,
            ready: true,
            attempts: [...state.attempts.values()],
            send: async (command, quote) => {
              await model.send(command, quote)
            },
            retry: (id) => model.recover(id),
            dismiss: (id) => model.dismiss(id),
            quote: async () => null,
          },
        }}
      >
        <div
          className={styles.frame}
          onClickCapture={(event) => {
            const target = event.target as HTMLElement
            const anchor = target.closest('a')
            if (!anchor || anchor.getAttribute('href') === '#') return
            // Follow item links inside this specimen's isolated game state.
            event.preventDefault()
            event.stopPropagation()
            const parts = new URL(anchor.href).pathname.split('/')
            const linked = view.catalog.find(
              (item) =>
                catalogSlug(item.key.id) === parts.at(-1) &&
                catalogPage(item.key) === parts.at(-2),
            )
            if (linked && linked.key.id !== entry.key.id) {
              resetEdits()
              setTrail((previous) => [...previous, linked.key.id])
            }
          }}
        >
          <div className={styles.chrome}>
            <span>New Horizon · preview</span>
            <ResourceStrip view={view} body={view.bodies[0]} />
          </div>
          <div className={styles.tabs} aria-hidden="true">
            <span>Resources</span>
            <span>Facilities</span>
            <span>Research</span>
            <span>Shipyard</span>
            <span>Defense</span>
          </div>
          <main>
            <PreviewDecision
              key={entry.key.id}
              entry={entry}
              onBack={() => {
                resetEdits()
                setTrail((previous) =>
                  previous.length > 1 ? previous.slice(0, -1) : previous,
                )
              }}
              runtime={runtime}
              view={view}
              action={action}
              setAction={setAction}
              quantity={quantity}
              setQuantity={setQuantity}
              technology={technology}
              setTechnology={setTechnology}
            />
          </main>
          <div className={styles.dock} aria-hidden="true">
            <span>Empire</span>
            <span>Develop</span>
            <span>Fleet</span>
            <span>Menu</span>
          </div>
        </div>
      </SessionContext.Provider>
    </RouterContextProvider>
  )
}
function PreviewDecision({
  runtime,
  entry,
  onBack,
  view,
  action,
  setAction,
  quantity,
  setQuantity,
  technology,
  setTechnology,
}: {
  runtime: Preview
  entry: Preview['entry']
  onBack: () => void
  view: ProgressionProps['view']
  action: 'Upgrade' | 'Demolition'
  setAction: (value: 'Upgrade' | 'Demolition') => void
  quantity: string
  setQuantity: (value: string) => void
  technology: boolean
  setTechnology: (value: boolean) => void
}) {
  const { model } = runtime
  const body = view.bodies[0]
  const request = technologyRequest(entry.key, body.id, action, '1')
  const { proposal, loading, error, retry } = useProgressionOptions(
    model,
    view,
    request,
  )
  const page =
    entry.key.kind === 'Building'
      ? ['MetalMine', 'MetalStorage', 'SolarPlant'].includes(entry.key.id)
        ? 'resources'
        : 'facilities'
      : entry.key.kind === 'Research'
        ? 'research'
        : entry.key.kind === 'Ship'
          ? 'shipyard'
          : 'defense'
  const props: ProgressionProps = {
    coordinator: model,
    view,
    body,
    page,
    selection: {
      selectedId: entry.key.id,
      close: () => {},
      back: {
        href: '#',
        'aria-label': `Back to ${page}`,
        onClick: (event) => {
          event.preventDefault()
          onBack()
        },
      },
      link: (id) => ({
        href: '#',
        'data-catalog-item': id,
        onClick: (event) => event.preventDefault(),
      }),
    },
  }
  return (
    <>
      {entry.key.kind === 'Building' ? (
        <BuildingDetails
          {...props}
          building={catalogContent(entry.key)}
          level={body.levels[entry.key.id as keyof typeof body.levels] ?? 0}
          proposal={proposal}
          loading={loading}
          error={error}
          action={action}
          onInspect={(next) => {
            setAction(next)
            retry()
          }}
        />
      ) : (
        <TechnologyDetails
          {...props}
          entry={entry}
          count={
            entry.key.kind === 'Research'
              ? (view.research.find(
                  (research) => research.research === entry.key.id,
                )?.level ?? 0)
              : 0
          }
          proposal={proposal}
          loading={loading}
          error={error}
          quantity={quantity}
          onQuantity={setQuantity}
          onInspect={retry}
          onTechnology={() => setTechnology(true)}
        />
      )}
      {technology && (
        <TechnologyDialog
          {...props}
          entry={entry}
          onClose={() => setTechnology(false)}
        />
      )}
    </>
  )
}
function PreviewFrame({ scene }: { scene: SceneId }) {
  const [runtime, setRuntime] = useState<Preview | null>(null)
  const [message, setMessage] = useState(
    'Interactive preview · no game changes',
  )
  const [failure, setFailure] = useState('')
  useEffect(() => {
    let active = true
    let instance: Preview | undefined
    void createDetailPreview(scene, setMessage)
      .then((value) => {
        instance = value
        if (active) setRuntime(value)
        else value.model.invalidate()
      })
      .catch((error) => setFailure(String(error)))
    return () => {
      active = false
      instance?.model.invalidate()
    }
  }, [scene])
  return (
    <>
      {failure ? (
        <p role="alert">{failure}</p>
      ) : runtime ? (
        <ItemPreview runtime={runtime} />
      ) : (
        <p>Preparing preview…</p>
      )}
      <div className={styles.notice} role="status">
        {message}
      </div>
    </>
  )
}
export function DetailPlayground() {
  const selected = new URLSearchParams(location.search).get('scene')
  const [category, setCategory] = useState('All')
  const [viewport, setViewport] = useState('Both')
  const [revision, setRevision] = useState(0)
  if (selected && scenes.some((scene) => scene.id === selected))
    return (
      <PreviewFrame
        key={`${selected}:${revision}`}
        scene={selected as SceneId}
      />
    )
  return (
    <div className={styles.gallery}>
      <header>
        <span className={styles.kicker}>
          Orbit Imperium · local design playground
        </span>
        <h1>Every decision. One language.</h1>
        <p>
          Real detail components, real viewports, isolated sample data. Try
          upgrade, cancellation, demolition, quantities, and technology dialogs.
          Reset restores every specimen.
        </p>
        <div className={styles.controls}>
          {['All', 'Buildings', 'Research', 'Ships & defenses'].map((value) => (
            <Button
              key={value}
              variant={category === value ? 'primary' : 'secondary'}
              aria-pressed={category === value}
              onClick={() => setCategory(value)}
            >
              {value}
            </Button>
          ))}
          <label>
            View{' '}
            <select
              aria-label="Preview viewport"
              value={viewport}
              onChange={(event) => setViewport(event.target.value)}
            >
              {['Both', 'Desktop', 'Mobile'].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <Button
            variant="secondary"
            onClick={() => setRevision((value) => value + 1)}
          >
            Reset previews
          </Button>
        </div>
      </header>
      {scenes
        .filter((scene) => category === 'All' || scene.category === category)
        .map((scene) => (
          <section key={scene.id} className={styles.specimen}>
            <h2>{scene.title}</h2>
            <div className={styles.specimens}>
              {viewport !== 'Mobile' && (
                <div>
                  <h3>Desktop · 1280 × 900</h3>
                  <div className={styles.desktop}>
                    <iframe
                      key={`desktop:${revision}`}
                      title={`${scene.title} — desktop`}
                      src={`/detail-playground?scene=${scene.id}`}
                      loading="lazy"
                    />
                  </div>
                </div>
              )}
              {viewport !== 'Desktop' && (
                <div>
                  <h3>Mobile · 390 × 844</h3>
                  <div className={styles.mobile}>
                    <iframe
                      key={`mobile:${revision}`}
                      title={`${scene.title} — mobile`}
                      src={`/detail-playground?scene=${scene.id}`}
                      loading="lazy"
                    />
                  </div>
                </div>
              )}
            </div>
          </section>
        ))}
    </div>
  )
}
