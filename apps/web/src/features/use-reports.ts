import { useLayoutEffect, useReducer, useRef, useState } from 'react'
import { useStore } from 'zustand'
import type { Coordinator } from '../client-model/coordinator'
import { bindingKey } from '../client-model/commands'
import { projectedReportHeader } from '../client-model/report-state'
import type { GameState } from '../client-model/game-store'
import { pendingReportVisibility } from './report-visibility'
import {
  emptyReports,
  reportsReducer,
  type ReportsRequest,
} from './reports-state'

export function reportRequestScope(state: GameState) {
  return JSON.stringify([
    state.binding && bindingKey(state.binding),
    state.ready,
    state.view?.viewer_revision,
    pendingReportVisibility(state.attempts.values())?.envelope.command_id,
  ])
}

type ReportsSource = Pick<
  Coordinator,
  'store' | 'reportPage' | 'reportDetail' | 'send'
>

export function useReports(
  model: ReportsSource,
  item: string | null,
  all = false,
  holdInbox = false,
) {
  const headers = useStore(model.store, (s) => s.reportHeaders)
  const attempts = useStore(model.store, (s) => s.attempts)
  const scope = useStore(model.store, reportRequestScope)
  const binding = useStore(
    model.store,
    (s) => s.binding && bindingKey(s.binding),
  )
  const changingVisibility = useStore(
    model.store,
    (s) => !!pendingReportVisibility(s.attempts.values()),
  )
  const [state, dispatch] = useReducer(reportsReducer, emptyReports)
  const [refresh, setRefresh] = useState(0)
  const owner = useRef({ model, binding })
  const active = useRef<ReportsRequest | null>(null)
  const sequence = useRef(0)
  // One read gesture per opened report, including across server refreshes.
  const readRequested = useRef<string | null>(null)
  useLayoutEffect(() => {
    readRequested.current = null
  }, [model, binding, item])

  function invalidate() {
    active.current = null
    dispatch({ type: 'invalidate' })
  }

  async function load(
    kind: ReportsRequest['kind'],
    cursor: string | null = null,
  ) {
    const request: ReportsRequest = {
      id: ++sequence.current,
      kind,
      item,
      cursor,
    }
    active.current = request
    dispatch({ type: 'start', request })
    // Read the store as well as the token: store changes can precede React's
    // next commit, especially when a binding or visibility command changes.
    const current = () =>
      active.current === request &&
      reportRequestScope(model.store.getState()) === scope
    try {
      const result =
        kind === 'detail' && item
          ? await model.reportDetail(item)
          : await model.reportPage(cursor, false)
      if (!current()) return
      if (!result || ('header' in result && result.header.id !== item)) {
        active.current = null
        dispatch({
          type: 'failure',
          request,
          error: 'Unable to confirm this report response. Try again.',
        })
        return
      }
      active.current = null
      if ('header' in result) {
        dispatch({ type: 'detail', request, detail: result })
        if (!result.header.read && readRequested.current !== item) {
          readRequested.current = item
          dispatch({ type: 'invalidate' })
          void model.send({
            type: 'World',
            action: { type: 'MarkReportRead', report: result.header.id },
          })
        }
      } else dispatch({ type: 'page', request, page: result })
    } catch (error) {
      if (!current()) return
      active.current = null
      dispatch({ type: 'failure', request, error })
    }
  }

  useLayoutEffect(() => {
    active.current = null
    const rebound =
      owner.current.model !== model || owner.current.binding !== binding
    owner.current = { model, binding }
    dispatch(rebound ? { type: 'reset' } : { type: 'navigate', item })
    // A pending preference blocks pagination, not access to an uncached inbox
    // or detail (including recovery after an uncertain command).
    const retainInbox =
      !rebound &&
      !item &&
      state.page &&
      ((state.retainPages && !all) || changingVisibility || holdInbox)
    if (!retainInbox) void load(item ? 'detail' : 'initial')
    return () => {
      active.current = null
    }
    // A bulk cleanup retains IDs through intermediate receipts; its completion
    // releases the hold and reloads the complete inbox once.
    // Cached pages are intentionally retained across view revisions/navigation.
    // Only request context changes trigger loading, not request completions.
  }, [model, binding, item, scope, refresh, changingVisibility, all, holdInbox])

  useLayoutEffect(() => {
    if (
      all &&
      !holdInbox &&
      !item &&
      !active.current &&
      !state.request &&
      !state.error &&
      !changingVisibility &&
      state.page?.has_more &&
      state.page.next_cursor
    ) {
      void load('more', state.page.next_cursor)
    }
  }, [
    all,
    holdInbox,
    item,
    state.page,
    state.request,
    state.error,
    changingVisibility,
  ])

  const detailHeader =
    state.detail &&
    projectedReportHeader(headers, attempts.values(), state.detail.report)
  return {
    page: state.page && {
      ...state.page,
      items: state.page.items.flatMap((id) => {
        const header = projectedReportHeader(headers, attempts.values(), id)
        return header && !header.hidden ? [header] : []
      }),
    },
    detail:
      state.detail && detailHeader
        ? { ...state.detail, header: detailHeader }
        : null,
    error: state.error,
    loading: !!state.request && state.request.kind !== 'more',
    loadingMore: state.request?.kind === 'more',
    changingVisibility,
    invalidate,
    retry: () => {
      invalidate()
      setRefresh((n) => n + 1)
    },
    more: () => {
      if (
        item ||
        active.current ||
        changingVisibility ||
        reportRequestScope(model.store.getState()) !== scope ||
        !state.page?.has_more ||
        !state.page.next_cursor
      )
        return
      void load('more', state.page.next_cursor)
    },
  }
}
