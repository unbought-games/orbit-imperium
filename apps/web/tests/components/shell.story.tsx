import { useState } from 'react'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { GameShellFrame } from '../../src/shell/game-shell-frame'
import { SessionContext } from '../../src/shell/session-context'
import { Coordinator } from '../../src/client-model/coordinator'
import { useCommands } from '../../src/client-model/use-commands'
import { attemptStorage } from '../../src/adapters/attempt-storage'
import {
  readyFixture,
  memoryStorage,
  id,
} from '../../src/test-support/bootstrap'
import type { BoundView } from '../../src/client-model/commands'
import type { Page } from '../../src/shell/routes'
import { pageTitles } from '../../src/shell/navigation-model'
import { ContentColumn } from '../../src/ui/content-column'
import { Button } from '../../src/ui/button'
import styles from '../../src/shell/game-shell.module.css'

const body: BoundView['bodies'][number] = {
  id: id(5),
  kind: 'Planet',
  coordinates: { galaxy: 1, system: 371, position: 12 },
  amounts: {
    metal: '6661686240',
    crystal: '9420339537',
    deuterium: '3122000000',
  },
  capacity: {
    metal: '10000000000',
    crystal: '10000000000',
    deuterium: '10000000000',
  },
  levels: { MetalMine: 1, CrystalMine: 1, SolarPlant: 1 },
  energy: { supply: '48400000', demand: '22000000', utilization: '1000000' },
  fields: 163,
  fields_used: 3,
  fields_reserved: 1,
  inventories: [],
}
const worlds = [
  {
    ...body,
    name: 'Martialis',
    coordinates: { galaxy: 1, system: 19, position: 6 },
  },
  {
    ...body,
    id: id(10),
    kind: 'Moon' as const,
    coordinates: { galaxy: 1, system: 19, position: 6 },
  },
  {
    ...body,
    id: id(8),
    name: 'Nova Roma',
    coordinates: { galaxy: 1, system: 1, position: 3 },
  },
  {
    ...body,
    id: id(9),
    name: 'A long planet name that wraps safely',
    coordinates: { galaxy: 1, system: 1, position: 4 },
  },
]
const roster = Array.from({ length: 12 }, (_, i) => ({
  ...body,
  id: i ? id(20 + i) : body.id,
  name: `World ${i + 1}`,
  coordinates: { galaxy: 1, system: 1, position: i + 1 },
}))
const unexpected = async (): Promise<never> => {
  throw new Error('Shell presentation must not issue model commands or reads')
}
function preparedModel(bodies: BoundView['bodies']) {
  const view = readyFixture(4).snapshot.view
  view.bodies = bodies
  view.capabilities = [
    'Galaxy',
    'Research',
    'Manufacturing',
    'Transport',
    'Reports',
  ].map((capability) => ({
    capability,
    enabled: true,
  })) as BoundView['capabilities']
  const model = new Coordinator(
    {
      currentBinding: unexpected,
      settings: unexpected,
      view: unexpected,
      quote: unexpected,
      submit: unexpected,
      receipt: unexpected,
    },
    attemptStorage(memoryStorage()),
    { newId: () => id(99), monotonicNowMs: () => 1000, isOnline: () => true },
  )
  model.store.setState({
    view,
    binding: view.binding,
    ready: true,
    tutorial: {
      revision: view.viewer_revision,
      loading: false,
      error: null,
      data: {
        enrolled: false,
        human: true,
        program: 'colony-opening-v1',
        version: 1,
        preference: null,
        beginner: false,
        completed: false,
        homeworld: null,
        chapters: [],
        recommended_objectives: [],
        receipts: [],
        sites: [],
      },
    },
  })
  return { model, view }
}
function Shell({
  bodies = [body, { ...body, id: id(6), kind: 'Moon' }],
  badges = false,
}: {
  bodies?: BoundView['bodies']
  badges?: boolean
}) {
  const [router] = useState(() => {
    function Sample() {
      const [{ model, view }] = useState(() => preparedModel(bodies))
      const commands = useCommands(null)
      const [selected, select] = useState(bodies[0].id)
      const [page, visit] = useState<Page>('overview')
      const [unread, setUnread] = useState(badges)
      const [working, setWorking] = useState(badges)
      return (
        <SessionContext.Provider
          value={{
            model,
            view,
            commands,
            universeName: 'Andromeda',
            logout: unexpected,
          }}
        >
          <GameShellFrame
            view={view}
            body={bodies.find((b) => b.id === selected)}
            page={page}
            universeName="Andromeda"
            unreadReports={unread}
            activity={working ? new Set(['resources']) : new Set()}
            blockers={
              working
                ? new Map([
                    [
                      'facilities',
                      'Blocked while a resource building is under construction',
                    ],
                  ])
                : new Map()
            }
            onSelectBody={select}
            onVisit={visit}
            onLogout={unexpected}
          >
            <ContentColumn
              as="main"
              width="full"
              id="main"
              tabIndex={-1}
              className={styles['work-area']}
            >
              <h1>{pageTitles[page]}</h1>
              <p>
                Prepared shell content. Navigation destinations and session
                journeys are tested in application tests.
              </p>
              <Button
                onClick={() => {
                  setUnread(false)
                  setWorking(false)
                }}
              >
                Clear prepared alerts
              </Button>
              <div style={{ height: 2000 }} aria-hidden="true" />
              <p>End of scrollable content</p>
            </ContentColumn>
          </GameShellFrame>
        </SessionContext.Provider>
      )
    }
    const root = createRootRoute({ component: Sample })
    const catchAll = createRoute({ getParentRoute: () => root, path: '$' })
    return createRouter({
      routeTree: root.addChildren([catchAll]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
  })
  return <RouterProvider router={router} />
}
export const ShellDefault = () => <Shell />
export const ShellNamed = () => (
  <Shell bodies={[{ ...body, name: 'Nova Roma Research Colony' }]} />
)
export const ShellWorlds = () => <Shell bodies={worlds} />
export const ShellRoster = () => <Shell bodies={roster} />
export const ShellBadges = () => <Shell badges />
export const ShellLargeStocks = () => (
  <Shell
    bodies={[
      {
        ...body,
        amounts: {
          metal: '1000000000000000',
          crystal: '1000000000000',
          deuterium: '1000000000000000000',
        },
      },
    ]}
  />
)
export const ShellWideStocks = () => (
  <Shell
    bodies={[
      {
        ...body,
        amounts: {
          metal: '9223372036854775807',
          crystal: '999999999999999999',
          deuterium: '99999999999999',
        },
        energy: { supply: '0', demand: '999000000000000000', utilization: '0' },
      },
    ]}
  />
)
