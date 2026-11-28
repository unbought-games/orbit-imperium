import { describe, it, expect } from 'vitest'
import {
  SocialController,
  emptySocialView,
  mergeMessages,
  conversationUnread,
  type SocialView,
  type SocialRequest,
  type SocialQuery,
} from './social'
const binding = { universe: 'u', epoch: 'e', account: 'a', player: 'me' }
const msg = (n: number) => ({
  id: `m${n}`,
  sequence: String(n),
  sender: 'peer',
  body: `Message ${n}`,
  sent_at: n,
})
const view = (patch: Partial<SocialView> = {}): SocialView => ({
  binding,
  request_id: 'r',
  ...emptySocialView(),
  ...patch,
})
function defer<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}
describe('social controller', () => {
  it('merges overlap in sequence order beyond JavaScript integer precision', () => {
    const huge = { ...msg(3), sequence: '9007199254740993' }
    expect(mergeMessages([huge, msg(1)], [msg(2), msg(1)])).toEqual([
      msg(1),
      msg(2),
      huge,
    ])
  })
  it('keeps command identity through an uncertain send and clears it only after confirmation', async () => {
    const requests: SocialRequest[] = []
    let fail = true
    const c = new SocialController({
      read: async () => view(),
      newId: () => 'stable',
      command: async (r) => {
        requests.push(r)
        if (fail) throw Error('network')
        return { command_id: r.command_id, message: 'm' }
      },
    })
    expect(await c.run({ type: 'Send', player: 'peer', body: 'hello' })).toBe(
      false,
    )
    expect(c.store.getState().pending?.command_id).toBe('stable')
    expect(
      await c.run({ type: 'Send', player: 'peer', body: 'duplicate' }),
    ).toBe(false)
    fail = false
    expect(await c.retry()).toBe(true)
    expect(requests).toHaveLength(2)
    expect(requests[0]).toEqual(requests[1])
    expect(c.store.getState().pending).toBeNull()
  })
  it('drains incremental pages without gaps and preserves the older-history cursor', async () => {
    const queries: SocialQuery[] = []
    const c = new SocialController({
      newId: () => 'id',
      command: async () => null,
      read: async (q) => {
        queries.push(q)
        if (q.type !== 'Messages') return view()
        if (q.after === 'm50')
          return view({ messages: [msg(51), msg(52)], next_cursor: 'm52' })
        if (q.after === 'm52') return view({ messages: [msg(53)] })
        return view({ messages: [msg(49), msg(50)], next_cursor: 'm49' })
      },
    })
    await c.open('peer')
    await c.history('newer')
    expect(c.store.getState().history?.messages.map((m) => m.id)).toEqual([
      'm49',
      'm50',
      'm51',
      'm52',
      'm53',
    ])
    expect(c.store.getState().history?.next_cursor).toBe('m49')
    expect(queries).toHaveLength(3)
  })
  it('discards an old conversation response after switching players', async () => {
    const pending = defer<SocialView>()
    const c = new SocialController({
      newId: () => 'id',
      command: async () => null,
      read: async (q) =>
        q.type === 'Messages' && q.player === 'old'
          ? pending.promise
          : view({ messages: [msg(2)] }),
    })
    const old = c.open('old')
    await c.open('new')
    pending.resolve(view({ messages: [msg(1)] }))
    await old
    expect(c.store.getState().history?.messages).toEqual([msg(2)])
  })
  it('logout clears private history and ignores late commands and reads', async () => {
    const pending = defer<SocialView>()
    const c = new SocialController({
      newId: () => 'id',
      command: async () => null,
      read: () => pending.promise,
    })
    const load = c.open('peer')
    c.clear()
    pending.resolve(view({ messages: [msg(1)] }))
    await load
    expect(c.store.getState().history).toBeNull()
    expect(c.store.getState().pending).toBeNull()
  })
})
it('read acknowledgements never lock the composer or replace an uncertain send', async () => {
  const read = defer<{ command_id: string; message: null }>()
  const c = new SocialController({
    newId: () => 'id',
    read: async () => view(),
    command: async (r) =>
      r.action.type === 'Read'
        ? read.promise
        : Promise.reject(Error('network')),
  })
  const acknowledgement = c.markRead('peer', 'm1')
  expect(c.store.getState().busy).toBe(false)
  await c.run({ type: 'Send', player: 'peer', body: 'hello' })
  expect(c.store.getState().pending?.action.type).toBe('Send')
  read.resolve({ command_id: 'id', message: null })
  expect(await acknowledgement).toBe(true)
  expect(c.store.getState().pending?.action.type).toBe('Send')
})
it('queues the post-send refresh behind an older-history page instead of dropping it', async () => {
  const older = defer<SocialView>()
  const queried: SocialQuery[] = []
  const c = new SocialController({
    newId: () => 'send',
    command: async (r) => ({ command_id: r.command_id, message: 'm52' }),
    read: async (q) => {
      queried.push(q)
      if (q.type !== 'Messages') return view()
      if (q.before) return older.promise
      if (q.after) return view({ messages: [msg(52)] })
      return view({ messages: [msg(50), msg(51)], next_cursor: 'm50' })
    },
  })
  await c.open('peer')
  const page = c.history('older')
  await c.run({ type: 'Send', player: 'peer', body: 'Message 52' })
  expect(queried.some((q) => q.type === 'Messages' && q.after)).toBe(false)
  older.resolve(view({ messages: [msg(49)] }))
  await page
  expect(queried.some((q) => q.type === 'Messages' && q.after === 'm51')).toBe(
    true,
  )
  expect(queried.filter((q) => q.type === 'Messages')).toEqual([
    { type: 'Messages', player: 'peer', before: null, after: null, limit: 50 },
    { type: 'Messages', player: 'peer', before: 'm50', after: null, limit: 50 },
    { type: 'Messages', player: 'peer', before: null, after: 'm51', limit: 50 },
  ])
  expect(c.store.getState().history?.messages.map((m) => m.id)).toEqual([
    'm49',
    'm50',
    'm51',
    'm52',
  ])
})
it('confirmed read positions clear stale paged inbox badges without hiding newer unread messages', async () => {
  const contact = {
    player: 'peer',
    username: 'Peer',
    blocked: false,
    request: null,
    requested_by: null,
    accepted: false,
  }
  const conversation = { contact, latest: msg(2), unread: true }
  const c = new SocialController({
    newId: () => 'read',
    command: async (r) => ({ command_id: r.command_id, message: null }),
    read: async (q) =>
      q.type === 'Messages'
        ? view({ contact, messages: [msg(1), msg(2)] })
        : view({ conversations: [conversation], next_cursor: 'older' }),
  })
  await c.list()
  await c.moreList()
  await c.open('peer')
  await c.markRead('peer', 'm2')
  expect(
    conversationUnread(conversation, c.store.getState().readPositions),
  ).toBe(false)
  await c.markRead('peer', 'm1')
  expect(c.store.getState().readPositions.peer).toBe('2')
  expect(
    conversationUnread(
      { ...conversation, latest: msg(3) },
      c.store.getState().readPositions,
    ),
  ).toBe(true)
  // A late inbox response contains the pre-read projection; the confirmed source
  // marker still takes precedence without dropping the user's loaded pages.
  await c.list()
  expect(
    conversationUnread(
      c.store.getState().list!.conversations[0],
      c.store.getState().readPositions,
    ),
  ).toBe(false)
  c.clear()
  expect(c.store.getState().readPositions).toEqual({})
})

it.each([false, true])(
  'queues older history behind a passive poll (poll fails: %s)',
  async (fail) => {
    const poll = defer<SocialView>()
    const older = defer<SocialView>()
    const olderStarted = defer<void>()
    const queries: SocialQuery[] = []
    const c = new SocialController({
      newId: () => 'id',
      command: async () => null,
      read: async (q) => {
        queries.push(q)
        if (q.type !== 'Messages') return view()
        if (q.before) {
          olderStarted.resolve(undefined)
          return older.promise
        }
        if (q.after === 'm52') return view({ messages: [msg(53)] })
        if (q.after) {
          await poll.promise
          if (fail) throw Error('offline')
          return view({ messages: [msg(52)], next_cursor: 'm52' })
        }
        return view({ messages: [msg(50), msg(51)], next_cursor: 'm50' })
      },
    })
    await c.open('peer')
    const refresh = c.history('newer')
    expect(c.store.getState().historyRequest).toBe('newer')
    await c.history('older')
    await c.history('older')
    expect(c.store.getState().olderRequested).toBe(true)
    expect(queries).toHaveLength(2)
    poll.resolve(view())
    await olderStarted.promise
    expect(queries[2]).toMatchObject({ before: 'm50', after: null })
    expect(c.store.getState().historyRequest).toBe('older')
    older.resolve(view({ messages: [msg(49)] }))
    await refresh
    expect(c.store.getState().history?.messages.map((m) => m.id)).toEqual(
      fail ? ['m49', 'm50', 'm51'] : ['m49', 'm50', 'm51', 'm52', 'm53'],
    )
    expect(
      queries.filter((q) => q.type === 'Messages' && q.before),
    ).toHaveLength(1)
    expect(c.store.getState().historyRequest).toBeNull()
    expect(c.store.getState().olderRequested).toBe(false)
  },
)

it.each(['switch', 'clear'] as const)(
  'drops queued older intent on %s and ignores the late poll',
  async (action) => {
    const poll = defer<SocialView>()
    const queries: SocialQuery[] = []
    const c = new SocialController({
      newId: () => 'id',
      command: async () => null,
      read: async (q) => {
        queries.push(q)
        if (q.type === 'Messages' && q.after) return poll.promise
        return view({
          messages: [
            msg(q.type === 'Messages' && q.player === 'new' ? 99 : 50),
          ],
          next_cursor: 'm50',
        })
      },
    })
    await c.open('old')
    const refresh = c.history('newer')
    await c.history('older')
    if (action === 'clear') c.clear()
    else await c.open('new')
    poll.resolve(view({ messages: [msg(51)] }))
    await refresh
    expect(queries.some((q) => q.type === 'Messages' && q.before)).toBe(false)
    expect(c.store.getState().history?.messages ?? []).toEqual(
      action === 'clear' ? [] : [msg(99)],
    )
    expect(c.store.getState().olderRequested).toBe(false)
  },
)

it('a hidden conversation leaves the inbox but opening it again reads retained history', async () => {
  const contact = {
    player: 'peer',
    username: 'Nova',
    blocked: false,
    request: null,
    requested_by: null,
    accepted: false,
  }
  const commands: SocialRequest[] = []
  const controller = new SocialController({
    newId: () => 'hide',
    command: async (request) => {
      commands.push(request)
      return { command_id: request.command_id, message: null }
    },
    read: async (q) =>
      q.type === 'Messages'
        ? view({ contact, messages: [msg(1), msg(2)] })
        : view({
            conversations: commands.length
              ? []
              : [{ contact, latest: msg(2), unread: false }],
          }),
  })
  await controller.list()
  await controller.open('peer')
  expect(
    await controller.run({ type: 'Hide', player: 'peer', message: 'm2' }),
  ).toBe(true)
  expect(controller.store.getState().list?.conversations).toEqual([])
  await controller.open(null)
  await controller.open('peer')
  expect(
    controller.store
      .getState()
      .history?.messages.map((message) => message.body),
  ).toEqual(['Message 1', 'Message 2'])
  expect(commands.map((request) => request.action)).toEqual([
    { type: 'Hide', player: 'peer', message: 'm2' },
  ])
})

it('disposal fences a deferred social read and send without clearing a newer allocation', async () => {
  const before = defer<string>(),
    after = defer<string>()
  const requests: SocialRequest[] = []
  let clock = before.promise
  const c = new SocialController({
    newId: () => clock,
    read: async () => view(),
    command: async (request) => {
      requests.push(request)
      return { command_id: request.command_id, message: null }
    },
  })
  const read = c.markRead('peer', 'm1')
  const first = c.run({ type: 'Send', player: 'peer', body: 'earlier' })
  c.clear()
  clock = after.promise
  const second = c.run({ type: 'Send', player: 'peer', body: 'current' })
  before.resolve('old')
  expect(await read).toBe(false)
  expect(await first).toBe(false)
  expect(c.store.getState().busy).toBe(true)
  after.resolve('new')
  expect(await second).toBe(true)
  expect(requests).toEqual([
    {
      command_id: 'new',
      action: { type: 'Send', player: 'peer', body: 'current' },
    },
  ])
})

it('a mutation refresh supersedes an initial inbox read without allowing its late result to restore stale data', async () => {
  const pending = defer<SocialView>()
  let reads = 0
  const c = new SocialController({
    read: () =>
      ++reads === 1
        ? pending.promise
        : Promise.resolve(view({ next_cursor: 'fresh-cursor' })),
    command: async () => null,
    newId: () => 'id',
  })
  const initial = c.list()
  expect(c.store.getState().loading).toBe(true)
  await c.refreshList()
  expect(c.store.getState().list?.next_cursor).toBe('fresh-cursor')
  pending.resolve(view())
  await initial
  expect(c.store.getState().list?.next_cursor).toBe('fresh-cursor')
  expect(reads).toBe(2)
})

it.each(['success', 'error'] as const)(
  'a late alliance %s cannot overwrite the membership refreshed after recovery',
  async (outcome) => {
    const fresh: NonNullable<
      ReturnType<SocialController['store']['getState']>['alliance']
    > = {
      summary: {
        id: 'alliance',
        universe: 'u',
        name: 'Fresh membership',
        tag: 'NEW',
        member_count: 1,
        recruitment: 'Open',
      },
      public_text: '',
      revision: 2,
      leader: 'me',
      permissions: [],
      grantable_permissions: [],
    }
    let resolve!: (value: typeof fresh | null) => void
    let reject!: (error: Error) => void
    const held = new Promise<typeof fresh | null>((yes, no) => {
      resolve = yes
      reject = no
    })
    let reads = 0
    const c = new SocialController({
      read: async () => view(),
      command: async () => null,
      newId: () => 'id',
      readAlliance: () => (++reads === 1 ? held : Promise.resolve(fresh)),
    })
    const initial = c.loadAlliance()
    await c.loadAlliance()
    expect(c.store.getState().alliance?.summary.name).toBe('Fresh membership')
    if (outcome === 'success') resolve(null)
    else reject(Error('old read failed'))
    await initial
    expect(c.store.getState().alliance?.summary.name).toBe('Fresh membership')
    c.clear()
    expect(c.store.getState().alliance).toBeNull()
  },
)
