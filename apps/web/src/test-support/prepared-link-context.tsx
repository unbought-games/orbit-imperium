import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterContextProvider,
} from '@tanstack/react-router'
import { useState, type ReactNode } from 'react'
import { commandId } from '../adapters/command-id'
import type { BoundView } from '../client-model/commands'
import { Coordinator } from '../client-model/coordinator'
import { useCommands } from '../client-model/use-commands'
import { SessionContext } from '../shell/session-context'
import { fleetPresentationFixture } from './fleet-presentation'

const unexpected = async (): Promise<never> => {
  throw Error('Link presentation unexpectedly requested game data')
}

export function PreparedLinkContext({
  children,
  view: suppliedView,
}: {
  children: ReactNode
  view?: BoundView
}) {
  const [router] = useState(() => {
    const root = createRootRoute()
    const galaxy = createRoute({
      getParentRoute: () => root,
      path: '/u/$universe/b/$body/galaxy',
    })
    return createRouter({
      routeTree: root.addChildren([galaxy]),
      history: createMemoryHistory(),
    })
  })
  const [session] = useState(() => {
    const { view, body } = fleetPresentationFixture()
    view.bodies = [body]
    view.capabilities = [
      { capability: 'Galaxy', enabled: true, reason: 'Available' },
    ]
    const model = new Coordinator(
      {
        currentBinding: unexpected,
        settings: unexpected,
        view: unexpected,
        quote: unexpected,
        submit: unexpected,
        receipt: unexpected,
      },
      {
        newId: () => commandId(crypto),
        monotonicNowMs: () => 0,
        isOnline: () => true,
      },
    )
    const snapshot = suppliedView ?? view
    model.store.setState({
      view: snapshot,
      binding: snapshot.binding,
      ready: true,
      receivedAt: 0,
      now: 0,
    })
    return {
      model,
      view: snapshot,
      universeName: 'Andromeda Prime',
      logout: unexpected,
    }
  })
  const commands = useCommands(null)
  return (
    <RouterContextProvider router={router}>
      <SessionContext.Provider value={{ ...session, commands }}>
        {children}
      </SessionContext.Provider>
    </RouterContextProvider>
  )
}
