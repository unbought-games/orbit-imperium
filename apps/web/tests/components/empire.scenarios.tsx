import shellStyles from '../../src/shell/game-shell.module.css'
import { ScreenContext } from '../../src/shell/screen-context'
import { PlanetRename } from '../../src/features/planet-rename'
import { PlanetActions } from '../../src/features/planet-actions'
import { VacationSettings } from '../../src/features/vacation'
import { EmpireDeletion } from '../../src/features/empire-deletion'
import { useState } from 'react'
import { useStore } from 'zustand'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  useRouterState,
} from '@tanstack/react-router'
import {
  SessionContext,
  type GameSession,
} from '../../src/shell/session-context'
import { PlayerProfilesContext } from '../../src/shell/player-profiles-context'
import { PlayerProfilesController } from '../../src/client-model/player-profiles'
import { projectGameView } from '../../src/client-model/game-projection'
import { EmpireOverview } from '../../src/features/empire-overview'
import { WorkSummaries } from '../../src/features/work-summaries'
import { createEmpireScene, type EmpireSceneInput } from './empire-runtime'

declare global {
  interface Window {
    empireInput?: EmpireSceneInput
    empireScene: Awaited<ReturnType<typeof createEmpireScene>>
  }
}
const runtime = await createEmpireScene(window.empireInput)
window.empireScene = runtime
const profiles = new PlayerProfilesController(async () => ({
  binding: runtime.view.binding,
  request_id: 'profiles',
  players: [],
}))
export function EmpireScenario() {
  const [router] = useState(() => {
    const root = createRootRoute({ component: Surface })
    const route = createRoute({ getParentRoute: () => root, path: '$' })
    return createRouter({
      routeTree: root.addChildren([route]),
      history: createMemoryHistory({
        initialEntries: [
          `/u/andromeda/b/${runtime.view.bodies[0].id}/overview`,
        ],
      }),
    })
  })
  return <RouterProvider router={router} />
}
function Surface() {
  const { model } = runtime
  const state = useStore(model.store)
  const view = projectGameView(state)
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  if (!view) throw Error('Prepared view required')
  const body =
    view.bodies.find((body) => pathname.includes(body.id)) ?? view.bodies[0]
  const screen = window.empireInput?.screen ?? 'overview'
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
      retry: (id) => model.retryOrder(id),
      dismiss: (id) => model.dismiss(id),
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
            page: 'settings',
            body: body.id,
            item: null,
            available: true,
            reason: '',
          },
          prepareDispatch: () => {
            throw Error('Unexpected dispatch')
          },
        }}
      >
        <PlayerProfilesContext.Provider value={profiles}>
          <main
            className={shellStyles['work-area']}
            style={{ padding: 18, maxWidth: 1200, margin: 'auto' }}
          >
            {window.empireInput?.surface === 'rename' ? (
              <PlanetRename model={model} body={body} />
            ) : window.empireInput?.surface === 'settings' ? (
              <>
                <VacationSettings />
                <EmpireDeletion />
              </>
            ) : window.empireInput?.surface === 'abandonment' ? (
              <PlanetActions model={model} body={view.bodies[1] ?? body} />
            ) : screen === 'overview' ? (
              <EmpireOverview model={model} view={view} body={body} />
            ) : (
              <WorkSummaries
                view={view}
                body={body}
                currentPage={screen}
                only={
                  screen === 'research'
                    ? 'research'
                    : screen === 'shipyard' || screen === 'defense'
                      ? 'manufacturing'
                      : 'buildings'
                }
                layout="compact"
              />
            )}
          </main>
          <output
            aria-label="Scene destination"
            style={{ overflowWrap: 'anywhere' }}
          >
            {pathname}
          </output>
        </PlayerProfilesContext.Provider>
      </ScreenContext.Provider>
    </SessionContext.Provider>
  )
}
