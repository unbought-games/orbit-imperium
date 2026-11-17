import { useEffect, useState } from 'react'
import { useStore } from 'zustand'
import { RouterProvider, useRouterState } from '@tanstack/react-router'
import { createCatalogPreviewRouter } from '../../src/dev/catalog-preview-router'
import { ShipAppearancesController } from '../../src/client-model/ship-appearances'
import type { ShipAppearanceState } from '../../src/client-model/ship-appearance-types'
import { projectGameView } from '../../src/client-model/game-projection'
import {
  ShipAppearancesContext,
  useShipAppearances,
} from '../../src/shell/ship-appearances-context'
import { ShipCustomizationLaunchContext } from '../../src/shell/ship-customization-launch-context'
import {
  SessionContext,
  type GameSession,
} from '../../src/shell/session-context'
import { ScreenContext, useGameScreen } from '../../src/shell/screen-context'
import { useCatalogSelection } from '../../src/shell/use-catalog-selection'
import { resolveCatalogItem } from '../../src/shell/catalog-routes'
import { ShipyardPage } from '../../src/features/shipyard/shipyard-page'
import { FleetInventoryView } from '../../src/features/fleet-inventory'
import { ErrorBanner } from '../../src/ui/error-banner'
import { id } from '../../src/test-support/bootstrap'
import { createProgressionScene } from './progression-runtime'

type AppearanceMode = 'ready' | 'rendering' | 'missing' | 'foreign'
type ProgressionRuntime = Awaited<ReturnType<typeof createProgressionScene>>
type Runtime = {
  progression: ProgressionRuntime
  appearances: ShipAppearancesController
  setAppearance: (mode: AppearanceMode) => Promise<void>
}

declare global {
  interface Window {
    shipyardScene: Runtime
  }
}

/** Transport observations only. Real controllers, URL selection and order hooks
 * own all behavior. The query-marked atlas asset is an independently free fixture,
 * not a claim that a renderer produced recolored pixels. */
async function createShipyardScene(): Promise<Runtime> {
  const progression = await createProgressionScene(
    new URLSearchParams({ mode: 'order', item: 'LightFighter' }),
  )
  progression.view.bodies[0].inventories.push({
    item: { kind: 'Ship', id: 'LightFighter' },
    count: '3',
  })
  await progression.refresh()
  let appearanceMode: AppearanceMode = 'ready'
  let request = 700
  const appearances = new ShipAppearancesController(
    async (action, _signal, requestId) => {
      if (action.type !== 'Load')
        throw Error('Unexpected appearance mutation in Shipyard scenario')
      const snapshot: ShipAppearanceState = {
        binding:
          appearanceMode === 'foreign'
            ? { ...progression.view.binding, player: id(99) }
            : progression.view.binding,
        request_id: requestId,
        catalog: [
          {
            id: 'fixture-fighter',
            name: 'Free fixture fighter',
            target: 'LightFighter',
            package_revision: 'fixture-v1',
            package_url: '/unused-fixture-package.json',
            preview_url: '/art/atlas/objects/light-fighter-640.webp',
            available: true,
          },
        ],
        dyes: [],
        library: [],
        emblem: null,
        emblem_revision: 0,
        equipment: [
          {
            target: 'LightFighter',
            revision: 1,
            design_id: id(90),
            design_revision: 1,
            render: {
              id: id(91),
              stage: appearanceMode === 'rendering' ? 'rendering' : 'ready',
              can_cancel: appearanceMode === 'rendering',
              can_retry: false,
            },
            artwork:
              appearanceMode === 'missing'
                ? null
                : {
                    id: id(92),
                    variants: [96, 640].map((width) => ({
                      width,
                      height: width,
                      url: `/art/atlas/objects/light-fighter-${width}.webp?fixture=equipped`,
                    })),
                  },
          },
        ],
      }
      return structuredClone(snapshot)
    },
    () => id(request++),
  )
  return {
    progression,
    appearances,
    setAppearance: async (mode) => {
      appearanceMode = mode
      await appearances.reload()
    },
  }
}

export function ShipyardScenario() {
  const [runtime, setRuntime] = useState<Runtime | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    let prepared: Runtime | undefined
    void createShipyardScene().then(
      (value) => {
        prepared = value
        if (!active) return
        window.shipyardScene = value
        value.appearances.start()
        setRuntime(value)
      },
      (error) => {
        if (active) setError(String(error))
      },
    )
    return () => {
      active = false
      prepared?.appearances.stop()
      if (window.shipyardScene === prepared)
        delete (window as Partial<Window>).shipyardScene
    }
  }, [])
  return error ? (
    <p role="alert">{error}</p>
  ) : runtime ? (
    <PreparedShipyard runtime={runtime} />
  ) : (
    <p role="status">Preparing Shipyard</p>
  )
}

function PreparedShipyard({ runtime }: { runtime: Runtime }) {
  const [target, setTarget] = useState<string | null>(null)
  const [router] = useState(() =>
    createCatalogPreviewRouter(
      `/u/andromeda/b/${runtime.progression.view.bodies[0].id}/shipyard/light-fighter`,
      () => <ShipyardScreen runtime={runtime} />,
    ),
  )
  return (
    <ShipAppearancesContext.Provider value={runtime.appearances}>
      <ShipCustomizationLaunchContext.Provider value={{ open: setTarget }}>
        <RouterProvider router={router} />
        <output
          aria-label="Customization target"
          style={{ display: 'block', padding: 16 }}
        >
          {target ?? 'None'}
        </output>
      </ShipCustomizationLaunchContext.Provider>
    </ShipAppearancesContext.Provider>
  )
}

function ShipyardScreen({ runtime }: { runtime: Runtime }) {
  const { model } = runtime.progression
  const state = useStore(model.store)
  const view = projectGameView(state)
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  if (!view || view.protocol === 2) throw Error('Prepared modern view required')
  const body = view.bodies[0]
  const slug = pathname.split('/')[6]
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
            page: 'shipyard',
            body: body.id,
            item: slug ? resolveCatalogItem('shipyard', slug, view) : null,
            available: true,
            reason: '',
          },
          prepareDispatch: () => {
            throw Error('Unexpected dispatch in Shipyard scenario')
          },
        }}
      >
        <main
          style={{
            padding: 16,
            maxWidth: 1440,
            marginInline: 'auto',
            minWidth: 0,
          }}
        >
          <ErrorBanner model={model} />
          <PreparedYard />
          <output
            aria-label="Current route"
            style={{
              display: 'block',
              overflowWrap: 'anywhere',
              paddingBlock: 16,
            }}
          >
            {pathname}
          </output>
        </main>
      </ScreenContext.Provider>
    </SessionContext.Provider>
  )
}

function PreparedYard() {
  const { model, view, body, route } = useGameScreen()
  const selection = useCatalogSelection()
  const { snapshot } = useShipAppearances()
  if (view.protocol === 2 || !body) throw Error('Prepared modern body required')
  return (
    <>
      <ShipyardPage
        coordinator={model}
        view={view}
        body={body}
        page={route.page}
        selection={selection}
      />
      <section aria-label="Owner inventory preview" style={{ marginTop: 24 }}>
        <h2>Empire fleet</h2>
        <FleetInventoryView
          view={view}
          origin={body.id}
          universe="andromeda"
          scope="empire"
          appearances={snapshot}
        />
      </section>
    </>
  )
}
