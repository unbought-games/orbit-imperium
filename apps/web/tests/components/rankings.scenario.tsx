import { useEffect, useState } from 'react'
import {
  createMemoryHistory,
  createBrowserHistory,
  Link,
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { Coordinator } from '../../src/client-model/coordinator'
import { PlayerProfilesController } from '../../src/client-model/player-profiles'
import type { PlayerDisplay } from '../../src/adapters/player-profiles'
import type { Rankings } from '../../src/client-model/commands'
import { useCommands } from '../../src/client-model/use-commands'
import { HighScoresScreen } from '../../src/features/high-scores'
import { PlayerProfilesContext } from '../../src/shell/player-profiles-context'
import { SessionContext } from '../../src/shell/session-context'
import { readyFixture, id } from '../../src/test-support/bootstrap'

export type RankingInput = {
  data: Omit<Rankings, 'binding' | 'request_id'>
  profiles?: PlayerDisplay[]
  failed?: boolean
}

declare global {
  interface Window {
    rankingInput: RankingInput
    rankingProfileReads: string[][]
    rankingRequests: number
    holdRankings: () => void
    releaseRankings: () => void
  }
}

const { session, snapshot } = readyFixture(4)
let gate: Promise<void> | undefined
window.rankingRequests = 0
window.holdRankings = () => {
  gate = new Promise((resolve) => {
    window.releaseRankings = () => {
      gate = undefined
      resolve()
    }
  })
}
const unused = async (): Promise<never> => {
  throw Error('Unexpected ranking scene operation')
}
let sequence = 100
const model = new Coordinator(
  {
    currentBinding: unused,
    settings: unused,
    view: unused,
    quote: unused,
    submit: unused,
    receipt: unused,
    rankings: async (context) => {
      window.rankingRequests++
      if (gate) await gate
      if (window.rankingInput.failed) throw Error('Rankings unavailable')
      return { ...context, ...structuredClone(window.rankingInput.data) }
    },
  },
  {
    newId: () => id(sequence++),
    monotonicNowMs: () => 0,
    isOnline: () => true,
  },
)
await model.initialize(session, snapshot)
window.rankingProfileReads = []
const profiles = new PlayerProfilesController(async (source) => {
  if (source.type !== 'Rankings')
    throw Error('Unexpected ranking profile source: ' + source.type)
  window.rankingProfileReads.push([...source.players])
  return {
    binding: snapshot.view.binding,
    request_id: id(91),
    players: structuredClone(window.rankingInput.profiles ?? []),
  }
})

function Surface() {
  useEffect(() => profiles.start(), [])
  const commands = useCommands(null)
  return (
    <SessionContext.Provider
      value={{
        model,
        commands,
        view: snapshot.view,
        universeName: 'andromeda',
        logout: unused,
      }}
    >
      <PlayerProfilesContext.Provider value={profiles}>
        <main style={{ padding: 16, maxWidth: 1200, margin: 'auto' }}>
          <HighScoresScreen />
        </main>
      </PlayerProfilesContext.Provider>
    </SessionContext.Provider>
  )
}

export function RankingsScenario() {
  const [router] = useState(() => {
    const root = createRootRoute({ component: Surface })
    return createRouter({
      routeTree: root.addChildren([
        createRoute({
          getParentRoute: () => root,
          path: '/u/$universe/b/$body/high-scores',
        }),
      ]),
      history: createMemoryHistory({
        initialEntries: [`/u/andromeda/b/${id(5)}/high-scores`],
      }),
    })
  })
  return <RouterProvider router={router} />
}

function ScoreEntry() {
  return (
    <main>
      <Link
        to="/u/$universe/b/$body/high-scores"
        params={{ universe: 'andromeda', body: id(5) }}
      >
        High Scores
      </Link>
    </main>
  )
}

// Use native browser history for modal teardown; the ranking surface and its
// prepared ports are identical to the isolated score table above.
export function RankingsHistoryScenario() {
  const [router] = useState(() => {
    const root = createRootRoute({ component: Outlet })
    const index = createRoute({
      getParentRoute: () => root,
      path: '/',
      component: ScoreEntry,
    })
    const scores = createRoute({
      getParentRoute: () => root,
      path: '/u/$universe/b/$body/high-scores',
      component: Surface,
    })
    return createRouter({
      routeTree: root.addChildren([index, scores]),
      history: createBrowserHistory(),
    })
  })
  return <RouterProvider router={router} />
}
