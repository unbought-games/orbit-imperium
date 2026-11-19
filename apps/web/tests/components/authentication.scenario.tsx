import { readyFixture } from '../../src/test-support/bootstrap'
import { Home } from '../../src/features/home'
import { ProtectedGame } from '../../src/shell/protected-game'
import { HostedJoin } from '../../src/features/hosted-join'
import { UniverseEnrollment } from '../../src/features/oidc'
import { useState } from 'react'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useLocation,
  useSearch,
} from '@tanstack/react-router'
import { RuntimeController } from '../../src/adapters/runtime-controller'
import { HttpError } from '../../src/adapters/http'
import type { OidcConfig } from '../../src/adapters/oidc'
import { OidcEntryApi } from '../../src/client-model/use-oidc'
import { useAppSession } from '../../src/client-model/use-app-session'
import { AuthContext } from '../../src/shell/auth-context'
import { validateAuthSearch } from '../../src/shell/auth-search'
import { AuthenticationPage } from '../../src/shell/authentication-page'
import { RuntimeControllerContext } from '../../src/shell/bootstrap-context'

const universe = readyFixture(4).session.memberships[0].universe

function prepare() {
  const query = new URLSearchParams(location.search)
  const requests: { kind: string; name: string; password: string }[] = []
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  let configReads = 0
  const authenticate = async (
    kind: string,
    name: string,
    password: string,
  ): Promise<never> => {
    requests.push({ kind, name, password })
    await pending
    throw new HttpError(403, 'Forbidden')
  }
  const unexpected = (): never => {
    throw Error(
      'Unexpected authenticated game operation in the public entry scene',
    )
  }
  const controller = new RuntimeController(
    { status: 'anonymous', signupEnabled: !query.has('closed') },
    {
      platform: {
        newId: crypto.randomUUID.bind(crypto),
        monotonicNowMs: () => performance.now(),
        isOnline: () => true,
      },
      createPort: unexpected,
      readEmbedded: unexpected,
      fetchBootstrap: unexpected,
    },
    {
      bootstrap: unexpected,
      logout: unexpected,
      loginBootstrap: (name, password) => authenticate('login', name, password),
      signupBootstrap: (name, password) =>
        authenticate('signup', name, password),
    },
  )
  const enrollments: string[] = []
  const config = async (): Promise<OidcConfig> => {
    configReads++
    if (query.get('config') === 'retry' && configReads === 1)
      throw Error('Unavailable')
    return {
      mode:
        ['retry', 'hosted'].includes(query.get('config') ?? '') ||
        query.get('mode') === 'join'
          ? 'oidc'
          : 'local',
      hosted_universe: universe,
      universes: [{ universe, name: 'Andromeda' }],
    }
  }
  const root = createRootRoute({ component: AuthFrame })
  const routes = (
    [
      ['/login', false],
      ['/signup', true],
    ] as const
  ).map(([path, signup]) =>
    createRoute({
      getParentRoute: () => root,
      path,
      validateSearch: validateAuthSearch,
      component: () => <FormRoute signup={signup} />,
    }),
  )
  const router = createRouter({
    routeTree: root.addChildren([
      ...routes,
      createRoute({
        getParentRoute: () => root,
        path: '/',
        component: Home,
      }),
      createRoute({
        getParentRoute: () => root,
        path: '$',
        component: ProtectedGame,
      }),
      createRoute({
        getParentRoute: () => root,
        path: '/join',
        component: () => (
          <HostedJoin universe={universe} hasMembership={false} />
        ),
      }),
      createRoute({
        getParentRoute: () => root,
        path: '/choice',
        component: UniverseEnrollment,
      }),
    ]),
    history: createMemoryHistory({
      initialEntries: [
        query.get('mode') === 'unknown'
          ? '/unknown'
          : query.get('mode') === 'alias'
            ? '/index.html'
            : query.get('mode') === 'join'
              ? '/join'
              : query.get('mode') === 'choice'
                ? '/choice'
                : query.get('mode') === 'signup'
                  ? '/signup'
                  : query.has('protected')
                    ? '/login?redirect=%2Fu%2Fandromeda%2Fb%2Fplanet%2Fmessages%23last'
                    : '/login?redirect=%2Fu%2F..%2F..%2Flogin',
      ],
    }),
  })
  return {
    controller,
    router,
    api: {
      config,
      enroll: async (target: string) => {
        enrollments.push(target)
        await window.recordHostedEnrollment?.(target)
        throw new Error('Universe admission refused.')
      },
    },
    enrollments,
    requests,
    release,
    configReads: () => configReads,
  }
}

function AuthFrame() {
  const session = useAppSession()
  const href = useLocation({ select: (location) => location.href })
  return (
    <AuthContext.Provider value={session}>
      <Outlet />
      <output aria-label="Current route">{href}</output>
    </AuthContext.Provider>
  )
}
function FormRoute({ signup }: { signup: boolean }) {
  const search = useSearch({ strict: false }) as { redirect?: string }
  return <AuthenticationPage signup={signup} redirect={search.redirect} />
}

declare global {
  interface Window {
    authenticationScene: ReturnType<typeof prepare>
    recordHostedEnrollment?: (target: string) => Promise<void>
  }
}

export function AuthenticationScenario() {
  const [scene] = useState(prepare)
  window.authenticationScene = scene
  return (
    <RuntimeControllerContext.Provider value={scene.controller}>
      <OidcEntryApi.Provider value={scene.api}>
        <RouterProvider router={scene.router} />
      </OidcEntryApi.Provider>
    </RuntimeControllerContext.Provider>
  )
}
