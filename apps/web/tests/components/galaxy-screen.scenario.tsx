import { useEffect, useState } from 'react'
import { useStore } from 'zustand'
import {
  useParams,
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  RouterProvider,
} from '@tanstack/react-router'
import missileContent from '../../../../rules/content/missile-warfare.json'
import type { components } from '../../src/contracts'
import { readyFixture } from '../../src/test-support/bootstrap'
import { useCommands } from '../../src/client-model/use-commands'
import { PlayerProfilesController } from '../../src/client-model/player-profiles'
import { PlayerPreferencesController } from '../../src/client-model/player-preferences'
import { SessionContext } from '../../src/shell/session-context'
import { PlayerProfilesContext } from '../../src/shell/player-profiles-context'
import { PlayerPreferencesContext } from '../../src/shell/player-preferences-context'
import { validateGalaxySearch } from '../../src/shell/galaxy-location'
import { Galaxy } from '../../src/features/galaxy'
import { ErrorBannerProvider, ErrorBannerSlot } from '../../src/ui/error-banner'
import type { DispatchDraft } from '../../src/features/missions'
import { createDispatchFixture, type DispatchFixture } from './dispatch-fixture'
import { id, originId, now } from './dispatch-data'
type S = components['schemas']
type Input = {
  missiles?: boolean
  dimensions?: { galaxies: number; systems_per_galaxy: number }
  liveTicker?: boolean
  elapsed?: number
  holdSystem?: number
  search?: string
  positions?: Record<number, Partial<S['GalaxyPosition4']>>
  profiles?: S['PlayerDisplay'][]
  failRead?: boolean
}
declare global {
  interface Window {
    galaxyInput?: Input
    galaxyHistory: { back: () => void; forward: () => void; href: () => string }
    setGalaxyOrigin: (origin: string) => Promise<void>
    galaxyScene: DispatchFixture
    releaseGalaxyRead?: () => void
  }
}
const input = (window.galaxyInput ??= {})
const fixture = await createDispatchFixture(
  async (query) => {
    if (query.system === input.holdSystem)
      await new Promise<void>((resolve) => {
        window.releaseGalaxyRead = () => {
          delete input.holdSystem
          delete window.releaseGalaxyRead
          resolve()
        }
      })
    if (input.failRead) throw Error('Unavailable')
    return {
      galaxy: query.galaxy,
      system: query.system,
      observed_at: now,
      player_names: { [id(30)]: 'Stargazer' },
      positions: Array.from({ length: 15 }, (_, index) => ({
        coordinates: {
          galaxy: query.galaxy,
          system: query.system,
          position: index + 1,
        },
        body:
          index === 0
            ? {
                id: id(20),
                owner: id(30),
                kind: 'Planet',
                name: 'Ember Watch',
                activity: { type: 'Recent' },
                inactivity: 'Active',
                vacation: false,
                espionage_eligible: true,
              }
            : null,
        debris:
          index === 0
            ? { field_identity: id(42), metal: '40000', crystal: '10000' }
            : null,
        ...input.positions?.[index + 1],
      })),
    }
  },
  () => input.elapsed ?? (input.liveTicker ? performance.now() : 0),
  input.dimensions,
)
const { view } = fixture.snapshot()
const recyclers = view.bodies[0].inventories.find(
  (stack) => stack.item.id === 'Recycler',
)!
recyclers.count = '5'
view.catalog = view.catalog.map((entry) =>
  entry.key.id === 'Recycler'
    ? {
        ...entry,
        ship_statistics: {
          combat: null,
          propulsion: {
            cargo_capacity: '20000',
            base_speed: '2000',
            fuel_consumption: '300',
            drive: 'CombustionDrive',
            impulse_upgrade: null,
          },
        },
      }
    : entry,
)
if (input.missiles) {
  view.capabilities.push({
    capability: 'Missiles',
    enabled: true,
    reason: 'Available',
  })
  view.bodies[0].inventories.push({
    item: { kind: 'Missile', id: 'InterplanetaryMissile' },
    count: '5',
  })
  await fixture.configure({
    options: { missileRules: missileContent.rules as S['MissileRules4'] },
  })
}
await fixture.configure({ view })
window.galaxyScene = fixture
const profiles = new PlayerProfilesController(async () => {
  return {
    binding: fixture.model.view!.binding,
    request_id: id(230),
    players: structuredClone(input.profiles ?? []),
  }
})
const preferences = new PlayerPreferencesController(async (patch) => {
  if (patch) throw Error('Unexpected preference write on Galaxy')
  return { galaxy_probe_count: '1' }
})
const preparedSession = readyFixture(4).session
function Surface() {
  const view = useStore(fixture.model.store, (state) => state.view)!
  const commands = useCommands(
    input.liveTicker
      ? {
          status: 'authenticated',
          signupEnabled: false,
          source: 'document',
          session: preparedSession,
          game: { status: 'ready', model: fixture.model },
        }
      : null,
  )
  const origin = useParams({ strict: false }).body ?? originId
  const [draft, setDraft] = useState<Pick<
    DispatchDraft,
    'coordinates' | 'mission' | 'targetKind'
  > | null>(null)
  useEffect(() => {
    const stop = profiles.start()
    return () => {
      window.releaseGalaxyRead?.()
      stop()
      preferences.stop()
      fixture.dispose()
    }
  }, [])
  return (
    <SessionContext.Provider
      value={{
        view,
        model: fixture.model,
        commands,
        universeName: 'andromeda',
        logout: () => fixture.model.logout(),
      }}
    >
      <PlayerProfilesContext.Provider value={profiles}>
        <PlayerPreferencesContext.Provider value={preferences}>
          <ErrorBannerProvider model={fixture.model}>
            <main style={{ paddingInline: 'var(--shell-inline-gutter)' }}>
              <ErrorBannerSlot model={fixture.model} />
              <Galaxy
                model={fixture.model}
                universe="andromeda"
                origin={origin}
                onDraft={(coordinates, mission, targetKind) =>
                  setDraft({ coordinates, mission, targetKind })
                }
              />
              {draft && (
                <output aria-label="Prepared fleet">
                  {JSON.stringify(draft)}
                </output>
              )}
            </main>
          </ErrorBannerProvider>
        </PlayerPreferencesContext.Provider>
      </PlayerProfilesContext.Provider>
    </SessionContext.Provider>
  )
}
export function GalaxyScreenScenario() {
  const [router] = useState(() => {
    const root = createRootRoute()
    const route = createRoute({
      getParentRoute: () => root,
      path: '/u/$universe/b/$body/galaxy',
      validateSearch: validateGalaxySearch,
      component: Surface,
    })
    const router = createRouter({
      routeTree: root.addChildren([route]),
      history: createMemoryHistory({
        initialEntries: [
          `/u/andromeda/b/${originId}/galaxy${input.search ?? ''}`,
        ],
      }),
    })
    window.galaxyHistory = {
      back: () => router.history.back(),
      forward: () => router.history.forward(),
      href: () => router.state.location.href,
    }
    window.setGalaxyOrigin = (body) =>
      router.navigate({
        to: '/u/$universe/b/$body/galaxy',
        params: { universe: 'andromeda', body },
        search: router.state.location.search,
      })
    return router
  })
  return <RouterProvider router={router} />
}
