import type { ReportQuery } from '../client-model/report-query'
import { useLayoutEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'
import type { Coordinator } from '../client-model/coordinator'
import { bindingKey } from '../client-model/commands'
import {
  projectedReportDetail,
  projectedReportInbox,
} from '../client-model/report-state'
import { reportLoad, reportRequestScope } from '../client-model/report-engine'
import { pendingReportVisibility } from './report-visibility'

type ReportsSource = Pick<
  Coordinator,
  'store' | 'reports' | 'reportDetail' | 'send'
>

/** Surfaces own navigation/read gestures; the engine owns every report fact and request. */
export function useReports(
  model: ReportsSource,
  item: string | null,
  query?: ReportQuery,
  holdInbox = false,
  all = false,
) {
  const engine = query
    ? model.reports.forQuery(query, all ? 'cleanup' : 'list')
    : model.reports
  const state = useStore(model.store)
  const scope = reportRequestScope(state)
  const binding = state.binding && bindingKey(state.binding)
  const changingVisibility = !!pendingReportVisibility(state.attempts.values())
  const [retryKey, setRetryKey] = useState(0)
  const readRequested = useRef<string | null>(null)
  useLayoutEffect(() => {
    readRequested.current = null
  }, [model, binding, item])

  useLayoutEffect(() => {
    let active = true
    if (item) {
      void model
        .reportDetail(item, retryKey > 0)
        .then((detail) => {
          if (
            !active ||
            !detail ||
            reportRequestScope(model.store.getState()) !== scope
          )
            return
          if (!detail.header.read && readRequested.current !== item) {
            readRequested.current = item
            void model.send({
              type: 'World',
              action: { type: 'MarkReportRead', report: item },
            })
          }
        })
        .catch(() => {
          /* The shared request state exposes the error. */
        })
    } else if (!holdInbox) {
      void engine.ensureInbox().catch(() => {})
    }
    return () => {
      active = false
    }
  }, [model, engine, binding, item, scope, retryKey, holdInbox])

  // Opening cleanup explicitly requests a fresh complete archive. Releasing
  // a submitted batch uses ensureInbox above, joining any existing refresh.
  useLayoutEffect(() => {
    if (all && !holdInbox) void engine.refreshInbox().catch(() => {})
  }, [engine, all, holdInbox])

  const inboxLoad = reportLoad(state, null, engine.queryKey)
  const inbox = engine.queryKey
    ? state.reportQueries.get(engine.queryKey)?.inbox
    : state.reportInbox
  const load = reportLoad(state, item, engine.queryKey)
  const canLoadMore =
    !item && !inboxLoad.pending && !changingVisibility && !!inbox?.has_more
  useLayoutEffect(() => {
    if (all && !holdInbox && canLoadMore && !inboxLoad.error)
      void engine.refreshInbox(true).catch(() => {})
  }, [engine, all, holdInbox, canLoadMore, inboxLoad.error, inbox])

  return {
    page: projectedReportInbox(state, true, engine.queryKey),
    detail: item ? projectedReportDetail(state, item) : null,
    error: load.error,
    loading: load.pending && load.kind !== 'more',
    loadingMore: !item && inboxLoad.pending && inboxLoad.kind === 'more',
    changingVisibility,
    canLoadMore,
    retry: () => {
      if (item) setRetryKey((n) => n + 1)
      else void engine.refreshInbox().catch(() => {})
    },
    more: () => {
      if (!canLoadMore || reportRequestScope(model.store.getState()) !== scope)
        return false
      void engine.refreshInbox(true).catch(() => {})
      return true
    },
  }
}
