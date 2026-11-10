import { useEffect, useState } from 'react'
import { useStore } from 'zustand'
import {
  SocialController,
  emptySocialView,
  type SocialView,
  type SocialRequest,
  type SocialQuery,
} from '../../src/client-model/social'
import { MessagesView } from '../../src/features/social/messages-view'
import type { MessageCategory } from '../../src/features/social/category-navigation'

const self = 'commander',
  peer = 'nova'
const message = (n: number) => ({
  id: `message-${n}`,
  sequence: String(n),
  sender: n % 2 ? peer : self,
  body: `Message ${n}`,
  sent_at: 1793456400000 + n * 60000,
})
const view = (patch: Partial<SocialView> = {}): SocialView => ({
  binding: {
    universe: 'universe',
    epoch: 'epoch',
    account: 'account',
    player: self,
  },
  request_id: 'prepared',
  ...emptySocialView(),
  ...patch,
})
function setup() {
  let contact = {
    player: peer,
    username: 'Nova',
    blocked: false,
    request: null as string | null,
    requested_by: null as string | null,
    accepted: false,
  }
  let messages = Array.from({ length: 65 }, (_, i) => message(i + 1))
  let hidden = false,
    failHistory = false,
    failSend = false
  let gate: Promise<void> | undefined, release: (() => void) | undefined
  let circulars: SocialView['circulars'] = []
  const commands: SocialRequest[] = [],
    queries: SocialQuery[] = []
  const controller = new SocialController({
    newId: () => `command-${commands.length}`,
    readAlliance: async () => ({
      summary: {
        id: 'alliance',
        universe: 'universe',
        name: 'Starlight',
        tag: 'STAR',
        member_count: 2,
        recruitment: 'Open',
      },
      public_text: '',
      revision: 1,
      leader: self,
      permissions: ['SendCircular'],
      grantable_permissions: [],
    }),
    read: async (q) => {
      queries.push(q)
      if (q.type === 'Messages') {
        const held = gate
        gate = undefined
        await held
        if (failHistory) {
          failHistory = false
          throw Error('History unavailable')
        }
        const index = q.before
          ? messages.findIndex((m) => m.id === q.before)
          : q.after
            ? messages.findIndex((m) => m.id === q.after)
            : -1
        const found = q.before
          ? messages.slice(0, index)
          : q.after
            ? messages.slice(index + 1)
            : messages
        const page = q.after ? found.slice(0, q.limit) : found.slice(-q.limit)
        return view({
          contact: { ...contact },
          messages: page,
          next_cursor:
            found.length > q.limit
              ? q.after
                ? page.at(-1)!.id
                : page[0].id
              : null,
        })
      }
      if (q.type === 'Conversations')
        return view({
          conversations: [
            ...(!hidden && messages.length
              ? [
                  {
                    contact: { ...contact },
                    latest: messages.at(-1)!,
                    unread: true,
                  },
                ]
              : []),
            ...['Orion', 'Lyra', 'Cassiopeia'].map((username, i) => ({
              contact: { ...contact, player: username.toLowerCase(), username },
              latest: { ...message(i + 1), body: 'Shipment arrived safely.' },
              unread: i === 0,
            })),
          ],
        })
      if (q.type === 'Contacts')
        return view({
          contacts: (
            q.kind === 'Blocks'
              ? contact.blocked
              : q.kind === 'Friends'
                ? contact.accepted
                : !!contact.request && !contact.accepted
          )
            ? [{ ...contact }]
            : [],
        })
      return view({ circulars })
    },
    command: async (request) => {
      commands.push(request)
      const a = request.action
      if (a.type === 'Send') {
        if (failSend) {
          failSend = false
          throw Error('Send unavailable')
        }
        messages = [
          ...messages,
          { ...message(messages.length + 1), body: a.body, sender: self },
        ]
        hidden = false
      }
      if (a.type === 'Hide') hidden = true
      if (a.type === 'RequestFriend')
        contact = { ...contact, request: 'request', requested_by: self }
      if (a.type === 'AcceptFriend') contact = { ...contact, accepted: true }
      if (a.type === 'RemoveFriend')
        contact = { ...contact, request: null, accepted: false }
      if (a.type === 'Block' || a.type === 'Unblock')
        contact = {
          ...contact,
          blocked: a.type === 'Block',
          accepted: false,
          request: null,
        }
      if (a.type === 'Circular')
        circulars = [
          {
            id: 'circular',
            alliance: 'alliance',
            alliance_name: 'Starlight',
            alliance_tag: 'STAR',
            sender: self,
            sender_name: 'Commander',
            body: a.body,
            sent_at: 1793456400000,
            read: true,
          },
        ]
      if (a.type === 'HideCircular') circulars = []
      return {
        command_id: request.command_id,
        message: a.type === 'Send' ? messages.at(-1)!.id : null,
      }
    },
  })
  return {
    controller,
    commands,
    queries,
    hold: () => {
      gate = new Promise<void>((resolve) => {
        release = resolve
      })
    },
    release: () => {
      release?.()
      release = undefined
    },
    poll: () => controller.history('newer'),
    incoming: () => {
      messages = [...messages, message(messages.length + 1)]
    },
    empty: () => {
      messages = []
    },
    failHistory: () => {
      failHistory = true
    },
    failSend: () => {
      failSend = true
    },
    invite: () => {
      contact = { ...contact, request: 'incoming', requested_by: peer }
    },
  }
}
declare global {
  interface Window {
    socialScenario: ReturnType<typeof setup>
  }
}
export function SocialStory() {
  const [scenario] = useState(setup)
  const [player, setPlayer] = useState<string>()
  const [tab, setTab] = useState<MessageCategory>('Conversations')
  const state = useStore(scenario.controller.store)
  useEffect(() => {
    window.socialScenario = scenario
    void scenario.controller.list()
    void scenario.controller.loadAlliance()
    return () => {
      scenario.release()
      scenario.controller.clear()
    }
  }, [scenario])
  const select = (next?: string) => {
    setPlayer(next)
    setTab('Conversations')
    void scenario.controller.open(next ?? null)
  }
  const changeTab = (next: MessageCategory) => {
    select()
    setTab(next)
    void scenario.controller.list(
      next === 'Conversations' || next === 'Circulars'
        ? { type: next, cursor: null, limit: 30 }
        : { type: 'Contacts', kind: next, cursor: null, limit: 30 },
    )
  }
  return (
    <main style={{ padding: 16 }}>
      <MessagesView
        controller={scenario.controller}
        state={state}
        self={self}
        player={player}
        tab={tab}
        select={select}
        changeTab={changeTab}
      />
    </main>
  )
}
