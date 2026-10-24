import { describe, expect, it } from 'vitest'
import {
  emptyReports,
  mergeReportPages,
  reconcileReportHeader,
  reportsReducer,
  type ReportsPage,
  type ReportsRequest,
} from './reports-state'
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

it('merges overlapping pages once while keeping reconciled headers and next-page metadata', () => {
  const first = page(['a', 'b'])
  first.items[1] = header('b', true)
  const next = page(['b', 'c', 'c', 'hidden'], null)
  next.items[3].hidden = true
  next.as_of_ms = 200
  const merged = mergeReportPages(first, next)
  expect(merged).toEqual({
    ...next,
    items: [header('a'), header('b', true), header('c')],
  })
  expect(first.items).toHaveLength(2)
  expect(next.items).toHaveLength(4)
})

it('reconciles read/hidden headers without inserting reports outside the loaded inbox', () => {
  const first = page(['a', 'b'])
  expect(reconcileReportHeader(first, header('b', true))?.items[1].read).toBe(
    true,
  )
  expect(reconcileReportHeader(first, header('b', true, true))?.items).toEqual([
    header('a'),
  ])
  expect(reconcileReportHeader(first, header('c', true))).toEqual(first)
  expect(reconcileReportHeader(null, header('a'))).toBeNull()
})

for (const kind of ['initial', 'detail', 'more'] as const) {
  describe(`late ${kind} responses`, () => {
    const old = request(1, kind)
    const started = reportsReducer(
      { ...emptyReports, page: page(['a']) },
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
    { ...emptyReports, page: page(['a']) },
    { type: 'start', request: more },
  )
  expect(started.retainPages).toBe(false)
  const failed = reportsReducer(started, {
    type: 'failure',
    request: more,
    error: 'offline',
  })
  expect(failed).toMatchObject({
    page: page(['a']),
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
  expect(returned.page?.items.map((r) => r.id)).toEqual(['a', 'b'])
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
