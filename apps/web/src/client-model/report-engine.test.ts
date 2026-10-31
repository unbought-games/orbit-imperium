import { expect, it, vi } from 'vitest'
import { createGameStore } from './game-store'
import { ReportEngine, reportLoad, reportRequestScope } from './report-engine'
import { projectedReportDetail, projectedReportInbox } from './report-state'
import { unreadBadgeCount } from '../features/command-hud/model'
import { readyFixture } from '../test-support/bootstrap'
import type { Attempt, BoundReport, BoundReports, Command } from './commands'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
const header = (id: string, read = false) => ({
  id,
  kind: 'ContactLost',
  read,
  hidden: false,
  observed_at: 1,
})
function fixture() {
  const store = createGameStore()
  const { snapshot } = readyFixture(4)
  store.setState({
    binding: snapshot.candidate.binding,
    view: snapshot.view,
    ready: true,
  })
  const pages: Array<
    ReturnType<typeof deferred<BoundReports | null>> & { cursor: string | null }
  > = []
  const details: Array<
    ReturnType<typeof deferred<BoundReport | null>> & { id: string }
  > = []
  const engine = new ReportEngine(store, {
    page: vi.fn((cursor) => {
      const call = { cursor, ...deferred<BoundReports | null>() }
      pages.push(call)
      return call.promise
    }),
    detail: vi.fn((id) => {
      const call = { id, ...deferred<BoundReport | null>() }
      details.push(call)
      return call.promise
    }),
  })
  const metadata = (
    revision = store.getState().view?.viewer_revision ?? '1',
  ) => ({
    protocol: 4 as const,
    binding: snapshot.candidate.binding,
    request_id: 'request',
    viewer_revision: revision,
    sampled_at: 1,
    as_of_ms: 1,
  })
  const page = (
    ids: string[],
    cursor: string | null = null,
    revision?: string,
  ): BoundReports => ({
    ...metadata(revision),
    data: {
      items: ids.map((id) => header(id)),
      has_more: cursor !== null,
      next_cursor: cursor,
      as_of_ms: 1,
    },
  })
  const detail = (id: string, read = false): BoundReport => ({
    ...metadata(),
    data: {
      header: header(id, read),
      payload: {
        kind: 'ContactLost',
        at: 1,
        target: { galaxy: 1, system: 1, position: 1 },
        own_lost_ships: [],
        own_cargo_loss: { metal: '0', crystal: '0', deuterium: '0' },
      },
    },
  })
  const revise = () =>
    store.setState((s) => ({
      view: {
        ...s.view!,
        viewer_revision: String(BigInt(s.view!.viewer_revision) + 1n),
      },
    }))
  const preference = () =>
    store.setState({
      attempts: new Map([
        [
          'hide',
          {
            envelope: {
              protocol: 4,
              binding: snapshot.candidate.binding,
              command_id: 'hide',
              presence: null,
              command: {
                type: 'World',
                action: { type: 'SetReportHidden', report: 'a', hidden: true },
              } as Command,
            },
            status: 'submitting',
            reconciled: false,
            receipt: null,
          },
        ],
      ]),
    })
  return { store, engine, pages, details, page, detail, revise, preference }
}
const hundred = Array.from({ length: 100 }, (_, i) => String(i))

it('deduplicates consumers and publishes one complete traversal for the tab, panel and badge', async () => {
  const h = fixture()
  const load = h.engine.ensureInbox()
  expect(h.engine.ensureInbox()).toBe(load)
  expect(h.engine.refreshInbox()).toBe(load)
  h.pages[0].resolve(h.page(['a', 'b'], 'next'))
  await vi.waitFor(() => expect(h.pages).toHaveLength(2))
  expect(h.store.getState().reportInbox).toBeNull()
  h.pages[1].resolve(h.page(['b', 'c']))
  await load
  expect(h.pages.map((p) => p.cursor)).toEqual([null, 'next'])
  expect(
    projectedReportInbox(h.store.getState())?.items.map((h) => h.id),
  ).toEqual(['a', 'b', 'c'])
  expect(unreadBadgeCount(h.store.getState())).toBe(3)
  await h.engine.ensureInbox()
  expect(h.pages).toHaveLength(2)
})

it('shares pagination, keeps earlier names, and deduplicates overlapping IDs', async () => {
  const h = fixture()
  const load = h.engine.ensureInbox()
  const first = h.page(hundred, 'next')
  first.data.player_names = { a: 'Original', b: 'Earlier' }
  h.pages[0].resolve(first)
  await load
  const more = h.engine.refreshInbox(true)
  expect(h.engine.refreshInbox(true)).toBe(more)
  const next = h.page(['99', 'last'])
  next.data.player_names = { a: 'Renamed', c: 'Later' }
  h.pages[1].resolve(next)
  await more
  expect(projectedReportInbox(h.store.getState())?.items).toHaveLength(101)
  expect(projectedReportInbox(h.store.getState())?.player_names).toEqual({
    a: 'Renamed',
    b: 'Earlier',
    c: 'Later',
  })
  await h.engine.ensureInbox()
  expect(h.pages).toHaveLength(2)
})

it('reconciles external deletion for all surfaces, retaining cached details outside membership', async () => {
  const h = fixture()
  let load = h.engine.ensureInbox()
  h.pages[0].resolve(h.page(['a', 'b']))
  await load
  const detail = h.engine.detail('b')
  h.details[0].resolve(h.detail('b'))
  await detail
  h.revise()
  load = h.engine.ensureInbox()
  h.pages[1].resolve(h.page(['a']))
  await load
  expect(
    projectedReportInbox(h.store.getState())?.items.map((h) => h.id),
  ).toEqual(['a'])
  expect(unreadBadgeCount(h.store.getState())).toBe(1)
  expect(projectedReportDetail(h.store.getState(), 'b')?.header.id).toBe('b')
})

it('retains the last good inbox on failure and exposes the same retry state to both surfaces', async () => {
  const h = fixture()
  const first = h.engine.ensureInbox()
  h.pages[0].resolve(h.page(['a']))
  await first
  const failed = h.engine.refreshInbox()
  const error = new Error('Unavailable')
  h.pages[1].reject(error)
  await expect(failed).rejects.toBe(error)
  expect(reportLoad(h.store.getState())).toMatchObject({
    pending: false,
    error,
  })
  expect(
    projectedReportInbox(h.store.getState())?.items.map((h) => h.id),
  ).toEqual(['a'])
  const retry = h.engine.refreshInbox()
  h.pages[2].resolve(h.page(['replacement']))
  await retry
  expect(reportLoad(h.store.getState())).toMatchObject({
    pending: false,
    error: null,
  })
  expect(
    projectedReportInbox(h.store.getState())?.items.map((h) => h.id),
  ).toEqual(['replacement'])
})

for (const fail of [false, true]) {
  it(`fences a late pagination ${fail ? 'failure' : 'success'} after a newer refresh`, async () => {
    const h = fixture()
    const initial = h.engine.ensureInbox()
    h.pages[0].resolve(h.page(hundred, 'next'))
    await initial
    const old = h.engine.refreshInbox(true).catch(() => {})
    h.revise()
    const fresh = h.engine.ensureInbox()
    const loading = reportLoad(h.store.getState())
    if (fail) h.pages[1].reject(Error('Old failure'))
    else h.pages[1].resolve(h.page(['stale'], null, '1'))
    await old
    expect(reportLoad(h.store.getState())).toBe(loading)
    h.pages[2].resolve(h.page(['fresh']))
    await fresh
    expect(
      projectedReportInbox(h.store.getState())?.items.map((h) => h.id),
    ).toEqual(['fresh'])
    expect(reportLoad(h.store.getState()).error).toBeNull()
  })
}

it('pauses shared refresh/pagination for preferences, then resumes without losing optimistic reconciliation', async () => {
  const h = fixture()
  const initial = h.engine.ensureInbox()
  h.pages[0].resolve(h.page(['a', ...hundred], 'next'))
  await initial
  h.preference()
  await h.engine.refreshInbox(true)
  await h.engine.ensureInbox()
  expect(h.pages).toHaveLength(1)
  expect(
    projectedReportInbox(h.store.getState())?.items.some((h) => h.id === 'a'),
  ).toBe(false)
  h.store.setState({ attempts: new Map() })
  h.revise()
  const settled = h.engine.ensureInbox()
  h.pages[1].resolve(h.page(['a']))
  await settled
  expect(
    projectedReportInbox(h.store.getState())?.items.map((h) => h.id),
  ).toEqual(['a'])
})

it('allows an uncached inbox and detail during recovery from an uncertain preference', async () => {
  const h = fixture()
  h.preference()
  const load = h.engine.ensureInbox()
  h.pages[0].resolve(h.page(['a']))
  await load
  expect(projectedReportInbox(h.store.getState())?.items).toEqual([])
  const detail = h.engine.detail('a')
  h.details[0].resolve(h.detail('a', true))
  expect((await detail)?.header.hidden).toBe(true)
})

it('shares detail data and in-flight requests across surfaces without reading a report as a fetch side effect', async () => {
  const h = fixture()
  const load = h.engine.detail('a')
  expect(h.engine.detail('a')).toBe(load)
  h.details[0].resolve(h.detail('a'))
  await load
  expect((await h.engine.detail('a'))?.header.read).toBe(false)
  expect(h.details).toHaveLength(1)
  expect(h.store.getState().attempts.size).toBe(0)
  expect(h.store.getState().reportDetails.get('a')).not.toHaveProperty('header')
  expect(unreadBadgeCount(h.store.getState())).toBe(0)
})

it('keeps detail failures scoped to their report and rejects a mismatched response', async () => {
  const h = fixture()
  const a = h.engine.detail('a')
  const b = h.engine.detail('b')
  h.details[0].resolve(h.detail('wrong'))
  h.details[1].resolve(h.detail('b'))
  await expect(a).rejects.toThrow('Unable to confirm')
  await b
  expect(projectedReportDetail(h.store.getState(), 'a')).toBeNull()
  expect(reportLoad(h.store.getState(), 'a').error).toBeTruthy()
  expect(reportLoad(h.store.getState(), 'b').error).toBeNull()
})

for (const fail of [false, true]) {
  it(`rejects a stale detail ${fail ? 'failure' : 'success'} after the viewer revision changes`, async () => {
    const h = fixture()
    const old = h.engine.detail('a').catch(() => null)
    h.revise()
    const fresh = h.engine.detail('a')
    if (fail) h.details[0].reject('Old failure')
    else h.details[0].resolve(h.detail('a'))
    await old
    expect(projectedReportDetail(h.store.getState(), 'a')).toBeNull()
    expect(reportLoad(h.store.getState(), 'a')).toMatchObject({
      pending: true,
      error: null,
    })
    h.details[1].resolve(h.detail('a', true))
    await fresh
    expect(projectedReportDetail(h.store.getState(), 'a')?.header.read).toBe(
      true,
    )
  })
}

it('invalidates inbox and detail publication when the session ends', async () => {
  const h = fixture()
  const inbox = h.engine.ensureInbox().catch(() => {})
  const detail = h.engine.detail('a')
  h.engine.invalidate()
  h.store.setState(createGameStore().getState())
  h.pages[0].resolve(h.page(['a']))
  h.details[0].resolve(h.detail('a'))
  await inbox
  expect(await detail).toBeNull()
  expect(h.store.getState().reportInbox).toBeNull()
  expect(h.store.getState().reportDetails.size).toBe(0)
  expect(h.store.getState().reportHeaders.size).toBe(0)
})

it('fences scope by readiness, binding, revision and pending preferences, not the clock', () => {
  const h = fixture()
  const state = h.store.getState()
  const scope = reportRequestScope(state)
  h.store.setState({ now: 100 })
  expect(reportRequestScope(h.store.getState())).toBe(scope)
  for (const change of [
    { ready: false },
    { binding: { ...state.binding!, epoch: 'other' } },
    { view: { ...state.view!, viewer_revision: '99' } },
  ])
    expect(reportRequestScope({ ...state, ...change })).not.toBe(scope)
  h.preference()
  expect(reportRequestScope(h.store.getState())).not.toBe(scope)
})

it('uses confirmed preference revisions before the game view catches up without fetching twice', async () => {
  const h = fixture()
  h.preference()
  h.store.setState((s) => ({
    attempts: new Map<string, Attempt>(
      [...s.attempts].map(([id, a]) => {
        if (a.envelope.protocol !== 4) throw new Error('Expected protocol 4')
        return [
          id,
          {
            ...a,
            envelope: a.envelope,
            status: 'committed',
            receipt: {
              protocol: 4,
              binding: s.binding!,
              command_id: 'hide',
              status: 'Committed',
              admitted_at: 1,
              executed_at: 1,
              result_ids: [],
              minimum_viewer_revision: '2',
            },
          },
        ]
      }),
    ),
  }))
  const scope = reportRequestScope(h.store.getState())
  const refresh = h.engine.ensureInbox()
  h.pages[0].resolve(h.page([], null, '2'))
  await refresh
  h.store.setState((s) => ({ view: { ...s.view!, viewer_revision: '2' } }))
  expect(reportRequestScope(h.store.getState())).toBe(scope)
  await h.engine.ensureInbox()
  expect(h.pages).toHaveLength(1)
})

it('rejects an inbox observation older than the known game revision even before first hydration', async () => {
  const h = fixture()
  h.revise()
  const stale = h.engine.ensureInbox()
  h.pages[0].resolve(h.page(['deleted'], null, '0'))
  await expect(stale).rejects.toThrow('out of date')
  expect(h.store.getState().reportInbox).toBeNull()
  expect(h.store.getState().reportHeaders.size).toBe(0)
  const retry = h.engine.ensureInbox()
  h.pages[1].resolve(h.page(['current']))
  await retry
  expect(
    projectedReportInbox(h.store.getState())?.items.map((h) => h.id),
  ).toEqual(['current'])
})

it('keeps one archive page chain while inbox and archived views select their own reports', async () => {
  const h = fixture()
  const initial = h.engine.ensureInbox()
  const first = h.page(hundred, 'older')
  first.data.items.push({ ...header('archived'), hidden: true })
  h.pages[0].resolve(first)
  await initial
  expect(projectedReportInbox(h.store.getState())?.items).toHaveLength(100)
  expect(
    projectedReportInbox(h.store.getState(), true)
      ?.items.filter((h) => h.hidden)
      .map((h) => h.id),
  ).toEqual(['archived'])
  expect(unreadBadgeCount(h.store.getState())).toBe(99)
  const more = h.engine.refreshInbox(true)
  const next = h.page(['older-archive'])
  next.data.items[0].hidden = true
  h.pages[1].resolve(next)
  await more
  expect(h.pages.map((p) => p.cursor)).toEqual([null, 'older'])
  expect(projectedReportInbox(h.store.getState())?.items).toHaveLength(100)
  expect(
    projectedReportInbox(h.store.getState(), true)
      ?.items.filter((h) => h.hidden)
      .map((h) => h.id),
  ).toEqual(['archived', 'older-archive'])
  await h.engine.ensureInbox()
  expect(h.pages).toHaveLength(2)
})
