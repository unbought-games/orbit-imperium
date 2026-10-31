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
  all = false,
  holdInbox = false,
  includeHidden = false,
) {
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
      void model.reports.ensureInbox().catch(() => {})
    }
    return () => {
      active = false
    }
  }, [model, binding, item, scope, retryKey, holdInbox])

  // Opening cleanup explicitly requests a fresh complete archive. Releasing
  // a submitted batch uses ensureInbox above, joining any existing refresh.
  useLayoutEffect(() => {
    if (all) void model.reports.refreshInbox().catch(() => {})
  }, [model, all])

  const inboxLoad = reportLoad(state)
  const load = reportLoad(state, item)
  const canLoadMore =
    !item &&
    !inboxLoad.pending &&
    !changingVisibility &&
    !!state.reportInbox?.has_more
  useLayoutEffect(() => {
    if (all && !holdInbox && canLoadMore && !inboxLoad.error)
      void model.reports.refreshInbox(true).catch(() => {})
  }, [model, all, holdInbox, canLoadMore, inboxLoad.error, state.reportInbox])

  return {
    page: projectedReportInbox(state, includeHidden),
    detail: item ? projectedReportDetail(state, item) : null,
    error: load.error,
    loading: load.pending && load.kind !== 'more',
    loadingMore: !item && inboxLoad.pending && inboxLoad.kind === 'more',
    changingVisibility,
    canLoadMore,
    retry: () => {
      if (item) setRetryKey((n) => n + 1)
      else void model.reports.refreshInbox().catch(() => {})
    },
    more: () => {
      if (!canLoadMore || reportRequestScope(model.store.getState()) !== scope)
        return false
      void model.reports.refreshInbox(true).catch(() => {})
      return true
    },
  }
}
