import { MenuScreen } from '../../src/features/menu'
import { useEffect, useState } from 'react'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  useRouterState,
} from '@tanstack/react-router'
import { Coordinator } from '../../src/client-model/coordinator'
import type { TutorialData } from '../../src/client-model/tutorial-engine'
import { useCommands } from '../../src/client-model/use-commands'
import { TutorialAdvisor } from '../../src/features/tutorial/advisor'
import { BriefingIcon } from '../../src/features/tutorial/briefing-icon'
import { BriefingWelcome } from '../../src/features/tutorial/briefing-summary'
import { TutorialBriefing } from '../../src/features/tutorial/tutorial'
import { Navigation } from '../../src/shell/navigation'
import { routeTarget } from '../../src/shell/route-target'
import { SessionContext } from '../../src/shell/session-context'
import { ScreenContext } from '../../src/shell/screen-context'
import { body as preparedPlanet } from '../../src/test-support/empire'
import { productionFixture } from '../../src/test-support/production'
import { readyFixture } from '../../src/test-support/bootstrap'
import { Link } from '../../src/ui/link'

export type TutorialSceneInput = {
  data: TutorialData | null
  refused?: boolean
  body: string
  page: 'briefing' | 'overview' | 'resources' | 'menu'
}
declare global {
  interface Window {
    tutorialInput: TutorialSceneInput
    deliverTutorial?: (data: TutorialData) => void
  }
}

const unexpected = async (): Promise<never> => {
  throw new Error('Viewing a briefing must not issue a game request')
}

async function prepare({ body, data, refused }: TutorialSceneInput) {
  const { session, snapshot } = readyFixture(4)
  const view = snapshot.view
  if (view.protocol !== 4) throw Error('Protocol 4 required')
  if (window.tutorialInput.page === 'menu')
    view.capabilities = [
      { capability: 'Transport', enabled: true, reason: 'Available' },
      { capability: 'Research', enabled: true, reason: 'Available' },
      { capability: 'Manufacturing', enabled: true, reason: 'Available' },
    ]
  view.bodies = [
    {
      id: body,
      kind: 'Planet',
      coordinates: { galaxy: 1, system: 1, position: 1 },
      levels: {},
      amounts: { metal: '1000000000', crystal: '1000000000', deuterium: '0' },
      capacity: {
        metal: '10000000000',
        crystal: '10000000000',
        deuterium: '10000000000',
      },
      energy: { supply: '0', demand: '0', utilization: '1000000' },
      fields: 163,
      fields_used: 0,
      fields_reserved: 0,
      inventories: [],
    },
  ]
  const model = new Coordinator(
    {
      currentBinding: unexpected,
      settings: unexpected,
      view: unexpected,
      quote: unexpected,
      submit: unexpected,
      receipt: unexpected,
      world: async (context, request) => {
        if (!refused || request.type !== 'Tutorial' || !data)
          return unexpected()
        return {
          protocol: 4,
          ...context,
          viewer_revision: view.viewer_revision,
          sampled_at: view.sampled_at,
          as_of_ms: view.as_of_ms,
          data,
        }
      },
    },
    {
      newId: () => crypto.randomUUID(),
      monotonicNowMs: () => 1000,
      isOnline: () => true,
    },
  )
  if (refused) {
    view.bodies[0].levels = { ...preparedPlanet.levels }
    view.progression.production = view.bodies.map((b) => productionFixture(b))
    await model.initialize(session, snapshot)
  }
  model.store.setState({
    ready: true,
    view,
    binding: view.binding,
    tutorial: {
      data: refused ? null : data,
      loading: !data && !refused,
      revision: view.viewer_revision,
      error: refused
        ? 'Unable to load guidance. Your orders and earned rewards are safe. Retry guidance.'
        : null,
    },
  })
  return { model, view }
}

const preparedTutorial = await prepare(window.tutorialInput)

function Surface() {
  const { model, view } = preparedTutorial
  const [suspended, setSuspended] = useState(false)
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const body = view.bodies[0]
  const page = pathname.endsWith('/briefing')
    ? 'briefing'
    : pathname.endsWith('/menu')
      ? 'menu'
      : 'overview'
  const session = {
    model,
    view,
    commands: useCommands(null),
    universeName: 'andromeda',
    logout: unexpected,
  }
  useEffect(() => {
    window.deliverTutorial = (data) =>
      model.store.setState({
        tutorial: {
          data,
          loading: false,
          error: null,
          revision: view.viewer_revision,
        },
      })
    return () => {
      delete window.deliverTutorial
    }
  }, [model, view])
  return (
    <SessionContext.Provider value={session}>
      <ScreenContext.Provider
        value={{
          ...session,
          body,
          route: {
            page,
            body: body.id,
            item: null,
            available: true,
            reason: '',
          },
          prepareDispatch: unexpected,
        }}
      >
        <main>
          {pathname.endsWith('/briefing') ? (
            <TutorialBriefing />
          ) : pathname.endsWith('/overview') ? (
            <>
              <BriefingIcon />
              <BriefingWelcome />
            </>
          ) : null}
          {window.tutorialInput.page === 'menu' && <MenuScreen />}
          {['resources', 'menu'].includes(window.tutorialInput.page) && (
            <Navigation
              hasUnreadReports={false}
              view={view}
              body={body.id}
              page={
                pathname.endsWith('/facilities') ? 'facilities' : 'resources'
              }
              activity={new Set()}
              blockers={new Map()}
              onLogout={unexpected}
            >
              {(navigation) => navigation}
            </Navigation>
          )}
          <Link {...routeTarget(session.universeName, 'overview', body.id)}>
            Return to overview
          </Link>
          <output aria-label="Destination">{pathname}</output>
          <button onClick={() => setSuspended((active) => !active)}>
            Toggle advisor suspension
          </button>
          <div style={{ position: 'fixed', right: 20, bottom: 20 }}>
            <TutorialAdvisor
              suspended={suspended}
              onOpenCommands={() => setSuspended(true)}
            >
              {(props) => <button {...props}>Advisor</button>}
            </TutorialAdvisor>
          </div>
        </main>
      </ScreenContext.Provider>
    </SessionContext.Provider>
  )
}

export function TutorialBriefingScenario() {
  const [router] = useState(() => {
    const root = createRootRoute({ component: Surface })
    const route = createRoute({ getParentRoute: () => root, path: '$' })
    const { page, body } = window.tutorialInput
    return createRouter({
      routeTree: root.addChildren([route]),
      history: createMemoryHistory({
        initialEntries: [`/u/andromeda/b/${body}/${page}`],
      }),
    })
  })
  return <RouterProvider router={router} />
}
