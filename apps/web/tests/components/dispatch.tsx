import { ErrorBanner } from '../../src/ui/error-banner'
import { ContentColumn } from '../../src/ui/content-column'
import shellStyles from '../../src/shell/game-shell.module.css'
import { useEffect, useState } from 'react'
import {
  createMemoryHistory,
  createRoute,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { useStore } from 'zustand'
import { DispatchView } from '../../src/features/dispatch-view'
import { useDispatch } from '../../src/features/use-dispatch'
import type { DispatchDraft } from '../../src/features/missions'
import {
  occupiedFleetSlots,
  projectGameView,
} from '../../src/client-model/game-projection'
import {
  SessionContext,
  type GameSession,
} from '../../src/shell/session-context'
import { PlayerProfilesContext } from '../../src/shell/player-profiles-context'
import { PlayerProfilesController } from '../../src/client-model/player-profiles'
import { createDispatchFixture, type DispatchFixture } from './dispatch-fixture'
import { originId, player, now, id } from './dispatch-data'

type Variant = 'standard' | 'historical' | 'unknown'
export type DispatchSceneControl = Pick<
  DispatchFixture,
  'snapshot' | 'hold' | 'release' | 'configure'
> & {
  setOrigin: (id: string) => void
}
declare global {
  interface Window {
    dispatchScene?: DispatchSceneControl
  }
}

function MountedDispatch({
  fixture,
  profiles,
  origin,
  draft,
}: {
  fixture: DispatchFixture
  profiles: PlayerProfilesController
  origin: string
  draft: DispatchDraft | null
}) {
  const { model } = fixture
  const state = useStore(model.store)
  const view = projectGameView(state)
  if (!view || view.protocol !== 4)
    throw Error('Dispatch scene requires a ready protocol-4 view')
  const body = view.bodies.find((body) => body.id === origin)
  if (!body) throw Error('Unknown scene origin')
  return (
    <DispatchConsumer
      fixture={fixture}
      profiles={profiles}
      view={view}
      body={body}
      draft={draft}
    />
  )
}
function DispatchConsumer({
  fixture,
  profiles,
  view,
  body,
  draft,
}: {
  fixture: DispatchFixture
  profiles: PlayerProfilesController
  view: import('../../src/contracts').components['schemas']['BoundView4']
  body: import('../../src/contracts').components['schemas']['BodyV3']
  draft: DispatchDraft | null
}) {
  const { model } = fixture
  const state = useStore(model.store)
  const dispatch = useDispatch({ model, view, body, draft })
  const session: GameSession = {
    model,
    view,
    universeName: 'andromeda',
    logout: () => model.logout(),
    commands: {
      model,
      view,
      ready: state.ready,
      attempts: [...state.attempts.values()],
      send: async (command, quote) => {
        await model.send(command, quote)
      },
      retry: async (key) => {
        await model.retryOrder(key)
      },
      dismiss: async (key) => {
        await model.dismiss(key)
      },
      quote: async (request) => {
        const quote = await model.quote(request)
        return quote?.protocol === 2 ? quote.terms : null
      },
    },
  }
  return (
    <SessionContext.Provider value={session}>
      <PlayerProfilesContext.Provider value={profiles}>
        <div style={{ padding: 18 }}>
          {/* Match the production caller's focused width and query container. */}
          <ContentColumn
            as="main"
            width="focused"
            className={shellStyles['work-area']}
            data-dispatch-ready="true"
            data-origin={body.id}
          >
            <ErrorBanner model={model} />
            <DispatchView
              model={model}
              view={view}
              body={body}
              draft={draft}
              universeName="andromeda"
              occupiedSlots={occupiedFleetSlots(state)}
              recentlyCopied={null}
              dispatch={dispatch}
            />
          </ContentColumn>
        </div>
      </PlayerProfilesContext.Provider>
    </SessionContext.Provider>
  )
}
function Scene({ variant }: { variant: Variant }) {
  const [fixture, setFixture] = useState<DispatchFixture | null>(null)
  const [origin, setOrigin] = useState(originId)
  const [profiles] = useState(
    () =>
      new PlayerProfilesController(async () => {
        throw Error('Unexpected profile fetch in prepared Dispatch scene')
      }),
  )
  const [draft] = useState<DispatchDraft | null>(() =>
    variant === 'historical'
      ? {
          coordinates: { galaxy: 1, system: 1, position: 1 },
          mission: 'Attack',
          observedAt: 1000,
          ships: { SmallCargo: '1' },
          target: {
            type: 'Body',
            id: id(20),
            expected_kind: 'Planet',
            expected_owner: id(30),
          },
        }
      : null,
  )
  useEffect(() => {
    let disposed = false
    let active: DispatchFixture | undefined
    void createDispatchFixture().then(async (next) => {
      active = next
      if (disposed) {
        next.dispose()
        return
      }
      if (variant === 'unknown')
        await next.configure({
          options: { profiles: false },
          view: { player_names: {} },
        })
      const applyProfiles = () =>
        profiles.store.setState({
          now,
          players: next.snapshot().options.profiles
            ? {
                [player]: {
                  player,
                  username: 'Commander',
                  observed_at: now / 1000,
                  expires_at: now / 1000 + 3600,
                },
                [id(30)]: {
                  player: id(30),
                  username: 'Stargazer',
                  observed_at: now / 1000,
                  expires_at: now / 1000 + 3600,
                },
              }
            : {},
        })
      applyProfiles()
      if (disposed) {
        next.dispose()
        return
      }
      window.dispatchScene = {
        ...next,
        setOrigin,
        configure: async (patch) => {
          await next.configure(patch)
          applyProfiles()
        },
      }
      setFixture(next)
    })
    return () => {
      disposed = true
      delete window.dispatchScene
      active?.dispose()
    }
  }, [profiles, variant])
  return fixture ? (
    <MountedDispatch
      fixture={fixture}
      profiles={profiles}
      origin={origin}
      draft={draft}
    />
  ) : (
    <p role="status">Preparing Dispatch inputs…</p>
  )
}
function IsolatedDispatch({ variant }: { variant: Variant }) {
  const [router] = useState(() => {
    const root = createRootRoute()
    const index = createRoute({
      getParentRoute: () => root,
      path: '/',
      component: () => <Scene variant={variant} />,
    })
    return createRouter({
      routeTree: root.addChildren([index]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
  })
  return <RouterProvider router={router} />
}
export function DispatchScene() {
  return <IsolatedDispatch variant="standard" />
}
export function DispatchHistoricalScene() {
  return <IsolatedDispatch variant="historical" />
}
export function DispatchUnknownScene() {
  return <IsolatedDispatch variant="unknown" />
}
