import { useEffect, useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { RouterProvider, useRouterState } from '@tanstack/react-router'
import { createCatalogPreviewRouter } from '../../src/dev/catalog-preview-router'
import {
  SessionContext,
  type GameSession,
} from '../../src/shell/session-context'
import { ScreenContext, useGameScreen } from '../../src/shell/screen-context'
import { useCatalogSelection } from '../../src/shell/use-catalog-selection'
import type { Coordinator } from '../../src/client-model/coordinator'
import { projectGameView } from '../../src/client-model/game-projection'
import { TechnologyPage } from '../../src/features/progression/technology-page'
import { ResourcesPage } from '../../src/features/progression/resources-page'
import {
  catalogPage,
  catalogPages,
  catalogSlug,
  resolveCatalogItem,
} from '../../src/shell/catalog-routes'
import { ErrorBanner } from '../../src/ui/error-banner'
import { createProgressionScene } from './progression-runtime'

type Runtime = Awaited<ReturnType<typeof createProgressionScene>>

declare global {
  interface Window {
    progressionScene: Runtime
  }
}

export function ProgressionDetailScenario() {
  const [params] = useState(() => new URLSearchParams(location.search))
  const [runtime, setRuntime] = useState<Runtime | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    void createProgressionScene(params).then(
      (value) => {
        if (active) {
          window.progressionScene = value
          setRuntime(value)
        }
      },
      (error) => {
        if (active) setError(String(error))
      },
    )
    return () => {
      active = false
    }
  }, [params])
  return error ? (
    <p role="alert">{error}</p>
  ) : runtime ? (
    <PreparedDetail runtime={runtime} params={params} />
  ) : (
    <p role="status">Preparing progression component</p>
  )
}

function PreparedDetail({
  runtime,
  params,
}: {
  runtime: Runtime
  params: URLSearchParams
}) {
  const [router] = useState(() => {
    const requested = params.get('item')
    const entry = runtime.view.catalog.find(
      (entry) => entry.key.id === (requested ?? 'SmallCargo'),
    )
    if (!entry) throw Error('Unknown prepared catalog item')
    const page = catalogPage(entry.key)
    const item =
      params.get('list') === 'yes' ? '' : `/${catalogSlug(entry.key.id)}`
    return createCatalogPreviewRouter(
      `/u/andromeda/b/${runtime.view.bodies[0].id}/${page}${item}`,
      () => (
        <PreparedScreen model={runtime.model}>
          {params.get('mode') === 'order' && (
            <ErrorBanner model={runtime.model} />
          )}
          <PreparedCatalog />
        </PreparedScreen>
      ),
    )
  })
  return <RouterProvider router={router} />
}

function PreparedScreen({
  model,
  children,
}: {
  model: Coordinator
  children: ReactNode
}) {
  const state = useStore(model.store)
  const view = projectGameView(state)
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const [, , , , , segment, slug] = pathname.split('/')
  const page = catalogPages.find((page) => page === segment)
  if (!view || view.protocol === 2 || !page)
    throw Error('Prepared modern catalog route required')
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
    <SessionContext.Provider value={session}>
      <ScreenContext.Provider
        value={{
          ...session,
          body,
          route: {
            page,
            body: body.id,
            item: slug ? resolveCatalogItem(page, slug, view) : null,
            available: true,
            reason: '',
          },
          prepareDispatch: () => {
            throw Error('Unexpected dispatch')
          },
        }}
      >
        <main style={{ padding: 16 }}>{children}</main>
      </ScreenContext.Provider>
    </SessionContext.Provider>
  )
}

function PreparedCatalog() {
  const { model, view, body, route } = useGameScreen()
  const selection = useCatalogSelection()
  if (view.protocol === 2 || !body) throw Error('Prepared modern body required')
  const props = { coordinator: model, view, body, page: route.page, selection }
  return route.page === 'resources' ? (
    <ResourcesPage {...props} />
  ) : (
    <TechnologyPage {...props} />
  )
}
