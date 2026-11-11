import { useState } from 'react'
import { useStore } from 'zustand'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useRouterState,
  RouterProvider,
} from '@tanstack/react-router'
import { useCatalogSelection } from '../../src/shell/use-catalog-selection'
import {
  SessionContext,
  type GameSession,
} from '../../src/shell/session-context'
import { ScreenContext, useGameScreen } from '../../src/shell/screen-context'
import { projectGameView } from '../../src/client-model/game-projection'
import { ResourcesPage } from '../../src/features/progression/resources-page'
import { TechnologyPage } from '../../src/features/progression/technology-page'
import { Production } from '../../src/features/progression/production'
import { catalogSlug } from '../../src/shell/catalog-routes'
import { createResourceScene } from './resource-runtime'

// Only external ports are controlled. Production components, subscriptions,
// inspection, autosave, reservations and receipt reconciliation are real.
const params = new URLSearchParams(location.search)
const runtime = await createResourceScene(params)
declare global {
  interface Window {
    resourceScene: typeof runtime
  }
}
window.resourceScene = runtime

export function ResourcesScenario() {
  const page =
    params.get('page') === 'research'
      ? 'research'
      : params.get('page') === 'facilities'
        ? 'facilities'
        : 'resources'
  const [router] = useState(() => {
    const root = createRootRoute({ component: ResourceSurface })
    const route = createRoute({ getParentRoute: () => root, path: '$' })
    return createRouter({
      routeTree: root.addChildren([route]),
      history: createMemoryHistory({
        initialEntries: [
          `/u/andromeda/b/${runtime.view.bodies[0].id}/${page}${params.get('item') ? `/${catalogSlug(params.get('item')!)}` : ''}`,
        ],
      }),
    })
  })
  return <RouterProvider router={router} />
}
function ResourceSurface() {
  const { model } = runtime
  const state = useStore(model.store)
  const view = projectGameView(state)
  const page =
    params.get('page') === 'research'
      ? 'research'
      : params.get('page') === 'facilities'
        ? 'facilities'
        : 'resources'
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const selected =
    [
      ...runtime.view.catalog.map((entry) => entry.key.id),
      'MetalMine',
      'CrystalMine',
      'DeuteriumSynthesizer',
      'FusionReactor',
    ].find((id) => pathname.endsWith(`/${catalogSlug(id)}`)) ?? null
  if (!view || view.protocol === 2)
    throw Error('Modern resource scene required')
  const body = view.bodies[0]
  const session: GameSession = {
    universeName: 'andromeda',
    model,
    view,
    logout: async () => {},
    commands: {
      model,
      view,
      ready: model.ready,
      attempts: [...state.attempts.values()],
      send: async (command, quote) => {
        await model.send(command, quote)
      },
      retry: (command) => model.retryOrder(command),
      dismiss: (command) => model.dismiss(command),
      quote: async () => null,
    },
  }
  return (
    <>
      <SessionContext.Provider value={session}>
        <ScreenContext.Provider
          value={{
            ...session,
            body,
            route: {
              page,
              body: body.id,
              item: selected,
              available: true,
              reason: '',
            },
            prepareDispatch: () => {
              throw Error('Unexpected dispatch')
            },
          }}
        >
          <main style={{ padding: 16 }}>
            <PreparedControls
              production={params.get('page') === 'production'}
            />
          </main>
        </ScreenContext.Provider>
      </SessionContext.Provider>
    </>
  )
}

function PreparedControls({ production }: { production: boolean }) {
  const { model, view, body, route } = useGameScreen()
  const selection = useCatalogSelection()
  if (view.protocol === 2 || !body) throw Error('Prepared modern body required')
  const props = { coordinator: model, view, body, page: route.page, selection }
  return production ? (
    <Production {...props} />
  ) : route.page === 'resources' ? (
    <ResourcesPage {...props} />
  ) : (
    <TechnologyPage {...props} />
  )
}
