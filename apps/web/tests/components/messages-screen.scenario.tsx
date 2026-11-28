import { useEffect, useState } from 'react'
import {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  RouterProvider,
} from '@tanstack/react-router'
import { Coordinator } from '../../src/client-model/coordinator'
import type { GamePort } from '../../src/client-model/commands'
import type { components } from '../../src/contracts'
import { useCommands } from '../../src/client-model/use-commands'
import { PlayerProfilesController } from '../../src/client-model/player-profiles'
import { PlayerProfilesContext } from '../../src/shell/player-profiles-context'
import { SessionContext } from '../../src/shell/session-context'
import { ScreenContext } from '../../src/shell/screen-context'
import { MessagesScreen } from '../../src/features/social/screen'
import { readyFixture, id } from '../../src/test-support/bootstrap'
import { body } from '../../src/test-support/empire'
import { productionFixture } from '../../src/test-support/production'

type S = components['schemas']
const peer = id(800),
  now = 1700000000000
function message(n: number): S['SocialMessage'] {
  return {
    id: id(1000 + n),
    sequence: String(n),
    sender: peer,
    body: `Message ${n}`,
    sent_at: now + n,
  }
}
const contact: S['SocialContact'] = {
  player: peer,
  username: 'Nova',
  blocked: false,
  request: null,
  requested_by: null,
  accepted: true,
}
async function prepare() {
  const { session, snapshot } = readyFixture(4),
    view = snapshot.view
  if (view.protocol !== 4) throw Error('Modern Messages required')
  view.bodies = [body]
  view.progression.production = [productionFixture(body)]
  const messages = [message(1), message(2)],
    requests: S['SocialQuery'][] = []
  const commands: S['SocialCommandRequest']['action'][] = []
  let viewerRevision = BigInt(view.viewer_revision)
  let sequence = 100,
    hidden = false,
    read = 0,
    fail = new URLSearchParams(location.search).has('failure')
  let gate: Promise<void> | undefined,
    release = () => {}
  const unexpected = async (): Promise<never> => {
    throw Error('Unexpected Messages scene request')
  }
  const port: GamePort = {
    currentBinding: unexpected,
    settings: unexpected,
    view: async (context) =>
      structuredClone({
        ...view,
        ...context,
        viewer_revision: String(viewerRevision),
      }),
    quote: unexpected,
    submit: unexpected,
    receipt: unexpected,
    allianceQuery: async (context, query) => {
      if (query.type !== 'Mine') return unexpected()
      return {
        ...context,
        sampled_at: now,
        alliance: null,
        directory: [],
        directory_count: 0,
        applications: [],
      }
    },
    socialQuery: async (context, q) => {
      requests.push(q)
      const data: S['SocialView'] = {
        ...context,
        conversations: [],
        messages: [],
        circulars: [],
        contacts: [],
        contact: null,
        next_cursor: null,
      }
      if (q.type === 'Messages') {
        if (q.player !== peer) throw Error('Wrong selected conversation')
        const wait = gate
        gate = undefined
        await wait
        if (fail) {
          fail = false
          throw Error('History unavailable')
        }
        const cursor = q.after
          ? messages.findIndex((m) => m.id === q.after)
          : -1
        data.messages = structuredClone(messages.slice(cursor + 1))
        data.contact = contact
      } else if (q.type === 'Conversations') {
        if (!hidden)
          data.conversations = [
            {
              contact,
              latest: messages.at(-1)!,
              unread: messages.length > read,
            },
          ]
      } else if (q.type === 'Contacts') data.contacts = [contact]
      else if (q.type !== 'Circulars') return unexpected()
      return data
    },
    socialCommand: async (_context, req) => {
      commands.push(req.action)
      if (req.action.type === 'Read') {
        const receipt = req.action.message
        read = messages.findIndex((m) => m.id === receipt) + 1
      } else if (req.action.type === 'Hide') hidden = true
      else return unexpected()
      return { command_id: req.command_id, message: null }
    },
  }
  const model = new Coordinator(port, {
    newId: () => id(sequence++),
    monotonicNowMs: () => performance.now(),
    isOnline: () => true,
  })
  await model.initialize(session, snapshot)
  return {
    model,
    view,
    requests,
    commands,
    async invalidate() {
      viewerRevision++
      await model.onUpdate({
        binding: view.binding,
        cursor: String(viewerRevision),
        event: {
          type: 'Invalidate',
          minimum_viewer_revision: String(viewerRevision),
        },
      })
    },
    incoming() {
      messages.push(message(messages.length + 1))
    },
    fail() {
      fail = true
    },
    hold() {
      gate = new Promise((resolve) => {
        release = resolve
      })
    },
    release() {
      release()
    },
  }
}
const scene = await prepare()
const profiles = new PlayerProfilesController(async () => ({
  binding: scene.view.binding,
  request_id: id(99),
  players: [],
}))
declare global {
  interface Window {
    messagesScreen: typeof scene
  }
}
function Surface() {
  const commands = useCommands(null)
  const session = {
    model: scene.model,
    view: scene.view,
    commands,
    universeName: 'Andromeda',
    logout: async () => {},
  }
  useEffect(() => {
    window.messagesScreen = scene
    return () => {
      scene.release()
      Reflect.deleteProperty(window, 'messagesScreen')
    }
  }, [])
  return (
    <SessionContext.Provider value={session}>
      <ScreenContext.Provider
        value={{
          ...session,
          body,
          route: {
            page: 'messages',
            body: body.id,
            item: null,
            available: true,
            reason: '',
          },
          prepareDispatch: () => {
            throw Error('Unexpected Dispatch')
          },
        }}
      >
        <PlayerProfilesContext.Provider value={profiles}>
          <main>
            <MessagesScreen />
          </main>
        </PlayerProfilesContext.Provider>
      </ScreenContext.Provider>
    </SessionContext.Provider>
  )
}
export function MessagesScenario() {
  const [router] = useState(() => {
    const root = createRootRoute({ component: Surface })
    return createRouter({
      routeTree: root.addChildren([
        createRoute({
          getParentRoute: () => root,
          path: '/u/$universe/b/$body/messages',
        }),
      ]),
      history: createMemoryHistory({
        initialEntries: [
          `/u/andromeda/b/${body.id}/messages${new URLSearchParams(location.search).has('list') ? '' : '?player=' + peer}`,
        ],
      }),
    })
  })
  return <RouterProvider router={router} />
}
