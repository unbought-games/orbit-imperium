import type { StoreApi } from 'zustand/vanilla'
import type { GameState } from './game-store'
import type { BoundReport, BoundReports } from './commands'
import { bindingKey } from './commands'
import { extendReportInbox, readReportInbox } from './report-inbox'
import {
  mergeReportHeaders,
  pendingReportPreferences,
  projectedReportDetail,
  reportRevision,
} from './report-state'

export type ReportLoad = {
  scope: string
  kind: 'refresh' | 'more' | 'detail'
  pending: boolean
  error: unknown | null
}
const idle = { pending: false, error: null, kind: 'refresh' as const }
export function reportRequestScope(state: GameState) {
  return JSON.stringify([
    state.binding && bindingKey(state.binding),
    state.ready,
    reportRevision(state),
    pendingReportPreferences(state.attempts.values())
      .map((a) => a.envelope.command_id)
      .sort(),
  ])
}
export function reportLoad(state: GameState, item?: string | null) {
  const load = item ? state.reportDetailLoads.get(item) : state.reportInboxLoad
  return load?.scope === reportRequestScope(state) ? load : idle
}

type Work<T> = { scope: string; promise: Promise<T> }
/** One archive and request owner for every report surface in a game session. */
export class ReportEngine {
  private inboxWork: Work<void> | null = null
  private detailWork = new Map<string, Work<BoundReport['data'] | null>>()
  constructor(
    private store: StoreApi<GameState>,
    private port: {
      page: (cursor: string | null) => Promise<BoundReports | null>
      detail: (id: string) => Promise<BoundReport | null>
    },
  ) {}
  invalidate() {
    this.inboxWork = null
    this.detailWork.clear()
  }
  ensureInbox() {
    const state = this.store.getState()
    const scope = reportRequestScope(state)
    if (this.inboxWork?.scope === scope) return this.inboxWork.promise
    if (
      state.reportInbox &&
      state.reportInboxLoad?.scope === scope &&
      !state.reportInboxLoad.error
    )
      return Promise.resolve()
    return this.refreshInbox()
  }
  refreshInbox(more = false): Promise<void> {
    const state = this.store.getState()
    const scope = reportRequestScope(state)
    if (!state.ready || !state.binding) return Promise.resolve()
    if (this.inboxWork?.scope === scope) return this.inboxWork.promise
    // Preferences project immediately. Keep membership stable until the command
    // settles; an uncached inbox remains readable during recovery.
    if (
      state.reportInbox &&
      pendingReportPreferences(state.attempts.values()).length
    )
      return Promise.resolve()
    if (more && state.reportInbox && !state.reportInbox.has_more)
      return Promise.resolve()
    const inbox = state.reportInbox
    const minimumRevision = BigInt(reportRevision(state))
    const observed: BoundReports[] = []
    const work: Work<void> = { scope, promise: Promise.resolve() }
    this.inboxWork = work
    const current = () =>
      this.inboxWork === work &&
      reportRequestScope(this.store.getState()) === scope
    const read = async (cursor: string | null) => {
      const response = current() ? await this.port.page(cursor) : null
      if (!current()) return null
      if (
        response &&
        (BigInt(response.viewer_revision) < minimumRevision ||
          (inbox && BigInt(response.viewer_revision) < BigInt(inbox.revision)))
      )
        throw new Error('Report response is out of date. Try again.')
      if (response) observed.push(response)
      return response
    }
    const kind = more ? 'more' : 'refresh'
    work.promise = (
      more && inbox
        ? extendReportInbox(read, inbox)
        : readReportInbox(read, inbox?.items.length ?? 0)
    )
      .then((reportInbox) => {
        if (!current()) return
        this.inboxWork = null
        this.store.setState({
          reportInbox,
          reportHeaders: observed.reduce(
            (headers, response) =>
              mergeReportHeaders(
                headers,
                response.data.items,
                response.viewer_revision,
              ),
            this.store.getState().reportHeaders,
          ),
          reportInboxLoad: { scope, kind, pending: false, error: null },
        })
      })
      .catch((error) => {
        if (current())
          this.store.setState({
            reportInboxLoad: { scope, kind, pending: false, error },
          })
        throw error
      })
      .finally(() => {
        if (this.inboxWork === work) this.inboxWork = null
      })
    this.store.setState({
      reportInboxLoad: { scope, kind, pending: true, error: null },
    })
    return work.promise
  }
  detail(id: string, retry = false): Promise<BoundReport['data'] | null> {
    const state = this.store.getState()
    const scope = reportRequestScope(state)
    if (!state.ready || !state.binding) return Promise.resolve(null)
    const pending = this.detailWork.get(id)
    if (pending?.scope === scope) return pending.promise
    const cached = projectedReportDetail(state, id)
    if (
      !retry &&
      cached &&
      state.reportDetailLoads.get(id)?.scope === scope &&
      !state.reportDetailLoads.get(id)?.error
    )
      return Promise.resolve(cached)
    const work: Work<BoundReport['data'] | null> = {
      scope,
      promise: Promise.resolve(null),
    }
    this.detailWork.set(id, work)
    const current = () =>
      this.detailWork.get(id) === work &&
      reportRequestScope(this.store.getState()) === scope
    const publishLoad = (pending: boolean, error: unknown | null) =>
      this.store.setState((s) => ({
        reportDetailLoads: new Map(s.reportDetailLoads).set(id, {
          scope,
          kind: 'detail',
          pending,
          error,
        }),
      }))
    work.promise = this.port
      .detail(id)
      .then((response) => {
        if (!current()) return null
        if (!response) {
          publishLoad(
            false,
            'Unable to confirm this report response. Try again.',
          )
          return null
        }
        if (response.data.header.id !== id)
          throw new Error('Unable to confirm this report response. Try again.')
        const { header, ...detail } = response.data
        this.store.setState((s) => ({
          reportHeaders: mergeReportHeaders(
            s.reportHeaders,
            [header],
            response.viewer_revision,
          ),
          reportDetails: new Map(s.reportDetails).set(id, {
            ...detail,
            report: id,
          }),
          reportDetailLoads: new Map(s.reportDetailLoads).set(id, {
            scope,
            kind: 'detail',
            pending: false,
            error: null,
          }),
        }))
        return projectedReportDetail(this.store.getState(), id)
      })
      .catch((error) => {
        if (current()) publishLoad(false, error)
        throw error
      })
      .finally(() => {
        if (this.detailWork.get(id) === work) this.detailWork.delete(id)
      })
    publishLoad(true, null)
    return work.promise
  }
}
