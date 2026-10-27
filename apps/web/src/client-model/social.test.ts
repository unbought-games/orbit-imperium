import { describe, it, expect } from 'vitest'
import {
  SocialController,
  emptySocialView,
  mergeMessages,
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
