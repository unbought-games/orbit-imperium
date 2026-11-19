import { useState, useEffect } from 'react'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  useRouterState,
} from '@tanstack/react-router'
import { AllianceScreen } from '../../src/features/alliances/screen'
import { Coordinator } from '../../src/client-model/coordinator'
import { PlayerProfilesController } from '../../src/client-model/player-profiles'
import { PlayerProfilesContext } from '../../src/shell/player-profiles-context'
import { ScreenContext } from '../../src/shell/screen-context'
import { AuthContext } from '../../src/shell/auth-context'
import { SessionContext } from '../../src/shell/session-context'
import { useCommands } from '../../src/client-model/use-commands'
import { readyFixture, id } from '../../src/test-support/bootstrap'
import { body } from '../../src/test-support/empire'
import { productionFixture } from '../../src/test-support/production'
import { allianceMembershipFixture } from '../fixtures/alliance-membership'
import type { GamePort } from '../../src/client-model/commands'
import type { components } from '../../src/contracts'

const { snapshot, session } = readyFixture(4)
const view = snapshot.view
if (view.protocol !== 4) throw Error('Alliance workspace requires protocol 4')
view.bodies = [body]
view.progression.production = [productionFixture(body)]
const { alliance, applicant, member, summary, own } = allianceMembershipFixture(
  view.binding,
)
const mode = new URLSearchParams(location.search).get('mode')
const membership = own()
let joined = !['join', 'apply', 'ordinary-apply', 'withdraw'].includes(
  mode ?? '',
)
const applications: components['schemas']['AllianceApplication'][] = []
const commands: components['schemas']['AllianceCommandRequest'][] = []
const departed = id(888)
if (mode === 'identity') {
  membership.posts![0].author = departed
  membership.posts![0].author_name = 'Departed Pilot'
}
membership.next_post_before = id(851)
const queries: components['schemas']['AllianceQuery'][] = []
const unexpected = async (): Promise<never> => {
  throw Error('Unexpected alliance workspace operation')
}
const port: GamePort = {
  currentBinding: unexpected,
  settings: unexpected,
  view: unexpected,
  quote: unexpected,
  submit: unexpected,
  receipt: unexpected,
  allianceQuery: async (context, query) => {
    queries.push(query)
    if (query.type === 'Detail' && query.post_before) {
      if (query.alliance !== alliance || query.post_before !== id(851))
        return unexpected()
      membership.revision++
      membership.posts![0].title = 'Fresh standing orders'
      membership.next_post_before = null
      throw { status: 409, code: 'Conflict' }
    }
    if (
      query.type !== 'Mine' &&
      query.type !== 'Directory' &&
      !(
        query.type === 'Detail' &&
        query.alliance === alliance &&
        !query.post_before
      )
    )
      return unexpected()
    return structuredClone({
      ...context,
      sampled_at: 1700000000000,
      directory: query.type === 'Directory' ? [summary] : [],
      directory_count: query.type === 'Directory' ? 1 : 0,
      alliance: joined && query.type !== 'Directory' ? membership : null,
      applications,
    })
  },
  allianceCommand: async (context, request) => {
    const { action, command_id } = request
    const allowed =
      mode === 'join'
        ? ['Join']
        : mode === 'apply' || mode === 'ordinary-apply'
          ? ['Apply']
          : mode === 'withdraw'
            ? ['Apply', 'Withdraw']
            : []
    if (!allowed.includes(action.type)) return unexpected()
    if (
      context.binding.player !== view.binding.player ||
      context.binding.universe !== view.binding.universe
    )
      return unexpected()
    if (
      (action.type === 'Join' || action.type === 'Apply') &&
      action.alliance !== alliance
    )
      return unexpected()
    if (
      action.type === 'Withdraw' &&
      !applications.some((item) => item.id === action.application)
    )
      return unexpected()
    commands.push(structuredClone({ ...request, context }))
    if (commands.length === 1) {
      if (mode === 'withdraw')
        throw Object.assign(new Error('Conflict'), { status: 409 })
      throw { status: 503, code: 'Unavailable' }
    }
    if (action.type === 'Withdraw')
      applications.splice(
        applications.findIndex((item) => item.id === action.application),
        1,
      )
    if (action.type === 'Join') joined = true
    if (action.type === 'Apply')
      applications.push({
        id: applicant,
        alliance,
        alliance_tag: 'STAR',
        player: session.memberships[0].player,
        username: 'Commander',
        text: action.text,
        created_at: 1700000000000,
      })
    return { command_id, alliance: joined ? alliance : null, revision: 1 }
  },
}
const model = new Coordinator(port, {
  newId: () => crypto.randomUUID(),
  monotonicNowMs: () => 0,
  isOnline: () => true,
})
await model.initialize(session, snapshot)
const profiles = new PlayerProfilesController(async (source) => {
  const players =
    source.type === 'Rankings'
      ? source.players
      : source.type === 'SelfAccount'
        ? [view.binding.player]
        : []
  const now = Math.floor(Date.now() / 1000)
  return {
    binding: view.binding,
    request_id: crypto.randomUUID(),
    players: players.map((player) => ({
      player,
      username:
        player === departed
          ? 'Departed Pilot'
          : player === member
            ? 'Nova'
            : 'Commander',
      observed_at: now,
      expires_at: now + 300,
      title: {
        id: 'admiral',
        label: 'Admiral',
        address: 'Admiral',
        expires_at: null,
      },
      alliance: {
        id: id(889),
        universe: view.binding.universe,
        name: 'Other Alliance',
        tag: 'AWAY',
      },
    })),
  }
})
declare global {
  interface Window {
    allianceWorkspaceQueries: typeof queries
    allianceWorkspaceCommands: typeof commands
  }
}
function Surface() {
  const path = useRouterState({ select: (state) => state.location.pathname })
  const game = {
    model,
    view,
    universeName: 'andromeda',
    commands: useCommands(null),
    logout: unexpected,
  }
  useEffect(() => {
    window.allianceWorkspaceQueries = queries
    window.allianceWorkspaceCommands = commands
    const stop = profiles.start()
    const releaseSelf = profiles.watch({ type: 'SelfAccount' })
    return () => {
      releaseSelf()
      stop()
    }
  }, [])
  return (
    <AuthContext.Provider
      value={{
        runtime: {
          status: 'authenticated',
          signupEnabled: true,
          session,
          source: 'document',
          game: { status: 'ready', model },
        },
        busy: false,
        message: '',
        errorRef: { current: null },
        login: () => {},
        clearMessage: () => {},
      }}
    >
      <SessionContext.Provider value={game}>
        <ScreenContext.Provider
          value={{
            ...game,
            body,
            prepareDispatch: unexpected,
            route: {
              page: 'alliance',
              body: body.id,
              item: path.split('/alliance/')[1] ?? null,
              available: true,
              reason: '',
            },
          }}
        >
          <PlayerProfilesContext.Provider value={profiles}>
            <AllianceScreen discovering={path.endsWith('/discover')} />
          </PlayerProfilesContext.Provider>
        </ScreenContext.Provider>
      </SessionContext.Provider>
    </AuthContext.Provider>
  )
}
export function AllianceWorkspaceScenario() {
  const [router] = useState(() => {
    const root = createRootRoute({ component: Surface })
    return createRouter({
      routeTree: root.addChildren([
        createRoute({ getParentRoute: () => root, path: '$' }),
      ]),
      history: createMemoryHistory({
        initialEntries: [
          `/u/andromeda/b/${body.id}/alliance${['join', 'apply', 'ordinary-apply'].includes(mode ?? '') ? `/discover?alliance=${alliance}${mode === 'ordinary-apply' ? '' : '&welcome=1'}` : ''}`,
        ],
      }),
    })
  })
  return <RouterProvider router={router} />
}
