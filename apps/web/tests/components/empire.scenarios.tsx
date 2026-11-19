import { routeTarget } from '../../src/shell/route-target'
import type { Page } from '../../src/shell/routes'
import shellStyles from '../../src/shell/game-shell.module.css'
import { ScreenContext } from '../../src/shell/screen-context'
import { PlanetRename } from '../../src/features/planet-rename'
import { PlanetActions } from '../../src/features/planet-actions'
import { VacationSettings } from '../../src/features/vacation'
import { EmpireDeletion } from '../../src/features/empire-deletion'
import { useState, useEffect } from 'react'
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
import { playerProfilesApi } from '../../src/adapters/player-profiles'
import { PlayerProfilesController } from '../../src/client-model/player-profiles'
import { projectGameView } from '../../src/client-model/game-projection'
import { ReportSimulation } from '../../src/features/combat-simulation'
import { Route as FundedSimulatorRoute } from '../../src/routes/u.$universe.b.$body.combat-simulator'
import { ReportObservation } from '../../src/features/report-observation'
import { MissionFleets } from '../../src/features/mission-fleets'
import { ErrorBanner } from '../../src/ui/error-banner'
import { EmpireOverview } from '../../src/features/empire-overview'
import { WorkSummaries } from '../../src/features/work-summaries'
import {
  createEmpireScene,
  createQuietEmpire,
  type EmpireSceneInput,
} from './empire-runtime'

// Mount the production funded route's registered component.
const RegisteredSimulator = FundedSimulatorRoute.options.component!

declare global {
  interface Window {
    selectPreparedEmpireBody: (body: string) => Promise<void>
    empireInput?: EmpireSceneInput
    empireProfileFeed: PlayerProfilesController
    empireScene: Awaited<ReturnType<typeof createEmpireScene>>
  }
}
const runtime =
  window.empireInput?.protocol === 3
    ? undefined
    : await createEmpireScene(window.empireInput)
if (runtime) window.empireScene = runtime
const model = runtime?.model ?? (await createQuietEmpire())
const liveIdentity =
  new URLSearchParams(location.search).get('profile-source') === 'live'
const profiles = new PlayerProfilesController(
  liveIdentity
    ? playerProfilesApi(model.view!.binding, 'fixture')
    : async () => ({
        binding: model.view!.binding,
        request_id: 'profiles',
        players: [],
      }),
)
window.empireProfileFeed = profiles
function initialPage(input?: EmpireSceneInput): Page {
  if (input?.deliveredReport || input?.simulationReport) return 'reports'
  if (input?.surface === 'simulation') return 'combat-simulator'
  if (input?.surface === 'settings') return 'settings'
  return input?.screen ?? 'overview'
}
const entryPage = initialPage(window.empireInput)
export function EmpireScenario() {
  const [router] = useState(() => {
    const root = createRootRoute({ component: Surface })
    const route = createRoute({ getParentRoute: () => root, path: '$' })
    const router = createRouter({
      routeTree: root.addChildren([route]),
      history: createMemoryHistory({
        initialEntries: [
          `/u/andromeda/b/${model.view!.bodies[0].id}/${entryPage}${window.empireInput?.fleetId ? '/' + window.empireInput.fleetId : ''}`,
        ],
      }),
    })
    window.selectPreparedEmpireBody = (body) =>
      router.navigate(
        routeTarget('andromeda', entryPage, body, window.empireInput?.fleetId),
      )
    return router
  })
  return <RouterProvider router={router} />
}
function Surface() {
  useEffect(() => {
    if (!liveIdentity) return
    const stop = profiles.start()
    const release = profiles.watch({ type: 'SelfAccount' })
    return () => {
      release()
      stop()
    }
  }, [])
  const state = useStore(model.store)
  const view = projectGameView(state)
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const href = useRouterState({ select: (s) => s.location.href })
  if (!view) throw Error('Prepared view required')
  const body =
    view.bodies.find((body) => pathname.includes(body.id)) ?? view.bodies[0]
  const fleetRoute = pathname.match(/\/fleets(?:\/([^/]+))?$/)
  const screen = fleetRoute
    ? 'fleets'
    : (window.empireInput?.screen ?? 'overview')
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
            page: fleetRoute ? 'fleets' : entryPage,
            body: body.id,
            item: fleetRoute?.[1] ?? window.empireInput?.fleetId ?? null,
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
              <>
                <ErrorBanner model={model} />
                <PlanetRename model={model} body={body} />
              </>
            ) : window.empireInput?.surface === 'settings' ? (
              <>
                <VacationSettings />
                <EmpireDeletion />
              </>
            ) : window.empireInput?.surface === 'abandonment' ? (
              <PlanetActions model={model} body={view.bodies[1] ?? body} />
            ) : window.empireInput?.deliveredReport ? (
              <ReportObservation
                payload={window.empireInput.deliveredReport}
                viewer={view.binding.player}
              />
            ) : window.empireInput?.simulationReport ? (
              <ReportSimulation
                model={model}
                report={window.empireInput.simulationReport}
                reportId="00000000-0000-4000-8000-000000000063"
              />
            ) : window.empireInput?.surface === 'simulation' ? (
              <RegisteredSimulator />
            ) : screen === 'fleets' && view.protocol === 4 ? (
              <MissionFleets
                model={model}
                view={view}
                origin={body.id}
                item={fleetRoute?.[1] ?? window.empireInput?.fleetId ?? null}
              />
            ) : screen === 'overview' || screen === 'fleets' ? (
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
            {href}
          </output>
        </PlayerProfilesContext.Provider>
      </ScreenContext.Provider>
    </SessionContext.Provider>
  )
}
