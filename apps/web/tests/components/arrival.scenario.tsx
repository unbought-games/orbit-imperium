import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  useRouterState,
} from '@tanstack/react-router'
import { useStore } from 'zustand'
import { useState } from 'react'
import { SessionContext } from '../../src/shell/session-context'
import { AuthContext } from '../../src/shell/auth-context'
import { PlayerProfilesContext } from '../../src/shell/player-profiles-context'
import { PlayerProfilesController } from '../../src/client-model/player-profiles'
import { useCommands } from '../../src/client-model/use-commands'
import { Coordinator } from '../../src/client-model/coordinator'
import type { GamePort } from '../../src/client-model/commands'
import type { components } from '../../src/contracts'
import { body } from '../../src/test-support/empire'
import { readyFixture, id } from '../../src/test-support/bootstrap'
import { productionFixture } from '../../src/test-support/production'
import { ArrivalScene } from '../../src/features/arrival/arrival-scene'
type S = components['schemas']
const unexpected = (): never => {
  throw Error('Unexpected first-landing operation')
}
async function prepare() {
  const { session, snapshot } = readyFixture(4),
    view = snapshot.view
  if (view.protocol !== 4) throw Error('Arrival requires protocol 4')
  view.bodies = [{ ...structuredClone(body), name: 'Terra' }]
  view.homeworld_id = body.id
  view.arrival_pending = true
  view.progression.production = [productionFixture(body)]
  const applications: S['AllianceView']['applications'] = []
  const commands: S['AllianceAction'][] = []
  const port: GamePort = {
    currentBinding: unexpected,
    quote: unexpected,
    receipt: unexpected,
    submit: unexpected,
    view: async (context) => structuredClone({ ...view, ...context }),
    settings: async (context) => ({ ...snapshot.settings, ...context }),
    allianceQuery: async (context, q) => {
      if (q.type !== 'Mine') return unexpected()
      return {
        ...context,
        sampled_at: 1700000000000,
        directory: [],
        directory_count: 0,
        alliance: null,
        applications: structuredClone(applications),
      }
    },
    allianceCommand: async (_context, { command_id, action }) => {
      if (action.type !== 'Apply') return unexpected()
      commands.push(action)
      applications.push({
        id: id(912),
        alliance: action.alliance,
        alliance_tag: 'STAR',
        player: view.binding.player,
        username: 'Commander',
        text: action.text,
        created_at: 1700000000000,
      })
      return { command_id, alliance: action.alliance, revision: 1 }
    },
  }
  let n = 500
  const model = new Coordinator(port, {
    newId: () => id(n++),
    monotonicNowMs: () => 1000,
    isOnline: () => true,
  })
  await model.initialize(session, structuredClone(snapshot))
  return {
    session,
    model,
    view,
    commands,
    profiles: new PlayerProfilesController(unexpected),
  }
}
const prepared = await prepare()
declare global {
  interface Window {
    arrivalFeature: typeof prepared
  }
}
function Surface() {
  const { model, session } = prepared
  const view = useStore(model.store, (s) => s.view)!
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const commands = useCommands(null)
  return (
    <SessionContext.Provider
      value={{
        view,
        model,
        commands,
        universeName: 'Andromeda',
        logout: unexpected,
      }}
    >
      <AuthContext.Provider
        value={{
          runtime: {
            status: 'authenticated',
            source: 'document',
            signupEnabled: true,
            session,
            game: { status: 'ready', model },
          },
          busy: false,
          message: '',
          errorRef: { current: null },
          login: unexpected,
          clearMessage: () => {},
        }}
      >
        <PlayerProfilesContext.Provider value={prepared.profiles}>
          {pathname.endsWith('/overview') && <ArrivalScene />}
        </PlayerProfilesContext.Provider>
        <output aria-label="Mounted arrival route">{pathname}</output>
      </AuthContext.Provider>
    </SessionContext.Provider>
  )
}
export function ArrivalScenario() {
  const [router] = useState(() => {
    const root = createRootRoute({ component: Surface })
    return createRouter({
      routeTree: root.addChildren([
        createRoute({ getParentRoute: () => root, path: '$' }),
      ]),
      history: createMemoryHistory({
        initialEntries: [`/u/andromeda/b/${body.id}/overview`],
      }),
    })
  })
  window.arrivalFeature = prepared
  return <RouterProvider router={router} />
}
