import { describe, expect, it } from 'vitest'
import {
  emptyReports,
  mergeReportPages,
  reportsReducer,
  type ReportsPage,
  type ReportsRequest,
} from './reports-state'
import {
  mergeReportHeaders,
  projectedReportHeader,
} from '../client-model/report-state'
import { reportRequestScope } from './use-reports'
import { createGameStore } from '../client-model/game-store'
import { readyFixture } from '../test-support/bootstrap'

const header = (id: string, read = false, hidden = false) => ({
  id,
  read,
  hidden,
  kind: 'Espionage',
  observed_at: 100,
})
const page = (ids: string[], cursor: string | null = 'next'): ReportsPage => ({
  items: ids.map((id) => header(id)),
  next_cursor: cursor,
  has_more: cursor !== null,
  as_of_ms: 100,
})
const request = (
  id: number,
  kind: ReportsRequest['kind'] = 'initial',
): ReportsRequest => ({
  id,
  kind,
  item: kind === 'detail' ? 'a' : null,
  cursor: kind === 'more' ? 'next' : null,
})

const storedPage = (ids: string[], cursor: string | null = 'next') => ({
  ...page(ids, cursor),
  items: ids,
})

it('merges overlapping page IDs once while keeping next-page metadata', () => {
  const first = storedPage(['a', 'b'])
  const next = page(['b', 'c', 'c'], null)
  next.as_of_ms = 200
  expect(mergeReportPages(first, next)).toEqual({
    ...next,
    items: ['a', 'b', 'c'],
    player_names: {},
  })
  expect(first.items).toHaveLength(2)
  expect(next.items).toHaveLength(3)
})

it('reconciles read/hidden headers in the store without changing loaded page IDs', () => {
  const first = storedPage(['a', 'b'])
  let headers = mergeReportHeaders(new Map(), [header('a'), header('b')], '1')
  headers = mergeReportHeaders(
    headers,
    [header('b', true), header('c', true)],
    '2',
  )
  expect(projectedReportHeader(headers, [], 'b')?.read).toBe(true)
  headers = mergeReportHeaders(headers, [header('b', true, true)], '3')
  expect(
    first.items.filter((id) => !projectedReportHeader(headers, [], id)?.hidden),
  ).toEqual(['a'])
  expect(first.items).toEqual(['a', 'b'])
})

for (const kind of ['initial', 'detail', 'more'] as const) {
  describe(`late ${kind} responses`, () => {
    const old = request(1, kind)
    const started = reportsReducer(
      { ...emptyReports, page: storedPage(['a']) },
      { type: 'start', request: old },
    )
    for (const action of [
      { type: 'navigate', item: 'b' },
      { type: 'invalidate' },
      { type: 'reset' },
    ] as const) {
      it(`ignores success and failure after ${action.type}, including while a replacement is loading`, () => {
        const cancelled = reportsReducer(started, action)
        const current = reportsReducer(cancelled, {
          type: 'start',
          request: request(2),
        })
        for (const state of [cancelled, current]) {
          expect(
            reportsReducer(state, {
              type: 'page',
              request: old,
              page: page(['stale']),
            }),
          ).toBe(state)
          expect(
            reportsReducer(state, {
              type: 'failure',
              request: old,
              error: 'stale failure',
            }),
          ).toBe(state)
        }
      })
    }
  })
}

it('retains successful pagination through navigation, but not failed pagination or invalidation', () => {
  const more = request(2, 'more')
  const started = reportsReducer(
    { ...emptyReports, page: storedPage(['a']) },
    { type: 'start', request: more },
  )
  expect(started.retainPages).toBe(false)
  const failed = reportsReducer(started, {
    type: 'failure',
    request: more,
    error: 'offline',
  })
  expect(failed).toMatchObject({
    page: storedPage(['a']),
    retainPages: false,
    request: null,
    error: 'offline',
  })
  const loaded = reportsReducer(started, {
    type: 'page',
    request: more,
    page: page(['b'], null),
  })
  expect(loaded.retainPages).toBe(true)
  const opened = reportsReducer(loaded, { type: 'navigate', item: 'b' })
  const returned = reportsReducer(opened, { type: 'navigate', item: null })
  expect(returned.page?.items).toEqual(['a', 'b'])
  expect(returned.retainPages).toBe(true)
  expect(returned.request).toBeNull()
  expect(reportsReducer(returned, { type: 'invalidate' }).retainPages).toBe(
    false,
  )
  expect(reportsReducer(returned, { type: 'reset' })).toEqual(emptyReports)
})

it('request scope fences readiness, binding epoch and revision changes without depending on the clock', () => {
  const store = createGameStore()
  const {
    candidate: { binding },
    view,
  } = readyFixture(4).snapshot
  store.setState({ binding, view, ready: true })
  const scope = reportRequestScope(store.getState())
  store.setState({ now: 100 })
  expect(reportRequestScope(store.getState())).toBe(scope)
  store.setState({ view: { ...view, viewer_revision: '99' } })
  expect(reportRequestScope(store.getState())).not.toBe(scope)
  store.setState({ view, ready: false })
  expect(reportRequestScope(store.getState())).not.toBe(scope)
  store.setState({ ready: true, binding: { ...binding, epoch: 'new' } })
  expect(reportRequestScope(store.getState())).not.toBe(scope)
})

it('retains names from earlier pages and accepts refreshed public names', () => {
  const first = {
    ...storedPage(['a']),
    player_names: { one: 'Original', two: 'Earlier page' },
  }
  const next = {
    ...page(['b'], null),
    player_names: { one: 'Renamed', three: 'Next page' },
  }
  expect(mergeReportPages(first, next).player_names).toEqual({
    one: 'Renamed',
    two: 'Earlier page',
    three: 'Next page',
  })
  expect(mergeReportPages(first, page(['b'], null)).player_names).toEqual(
    first.player_names,
  )
})
