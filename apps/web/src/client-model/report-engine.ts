import {
  reportQueryKey,
  unreadReportQuery,
  type ReportQuery,
} from './report-query'
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
export function reportLoad(
  state: GameState,
  item?: string | null,
  queryKey?: string,
) {
  const load = item
    ? state.reportDetailLoads.get(item)
    : queryKey
      ? state.reportQueries.get(queryKey)?.load
      : state.reportInboxLoad
  return load?.scope === reportRequestScope(state) ? load : idle
}

type Work<T> = { scope: string; promise: Promise<T> }
/** One request owner per report query, with shared authoritative headers. */
export class ReportEngine {
  private queries = new Map<string, ReportEngine>()
  private inboxWork: Work<void> | null = null
  private detailWork = new Map<string, Work<BoundReport['data'] | null>>()
  constructor(
    private store: StoreApi<GameState>,
    private port: {
      page: (
        cursor: string | null,
        query: ReportQuery,
      ) => Promise<BoundReports | null>
      detail: (id: string) => Promise<BoundReport | null>
    },
    readonly query?: ReportQuery,
    private purpose = 'list',
  ) {}
  get queryKey() {
    return this.query
      ? `${this.purpose}:${reportQueryKey(this.query)}`
      : undefined
  }
  forQuery(query: ReportQuery, purpose = 'list') {
    const key = `${purpose}:${reportQueryKey(query)}`
    let engine = this.queries.get(key)
    if (!engine) {
      engine = new ReportEngine(this.store, this.port, query, purpose)
      this.queries.set(key, engine)
    }
    return engine
  }
  private inbox(state: GameState) {
    return this.queryKey
      ? (state.reportQueries.get(this.queryKey)?.inbox ?? null)
      : state.reportInbox
  }
  private load(state: GameState) {
    return this.queryKey
      ? state.reportQueries.get(this.queryKey)?.load
      : state.reportInboxLoad
  }
  private publish(update: Partial<GameState>) {
    const key = this.queryKey
    if (!key) {
      this.store.setState(update)
      return
    }
    this.store.setState((state) => {
      const previous = state.reportQueries.get(key)
      const { reportInbox, reportInboxLoad, ...other } = update
      return {
        ...other,
        reportQueries: new Map(state.reportQueries).set(key, {
          inbox:
            reportInbox === undefined ? (previous?.inbox ?? null) : reportInbox,
          load:
            reportInboxLoad === undefined
              ? (previous?.load ?? null)
              : reportInboxLoad,
        }),
      }
    })
  }
  invalidate() {
    this.inboxWork = null
    this.detailWork.clear()
    for (const engine of this.queries.values()) engine.invalidate()
    this.queries.clear()
  }
  ensureInbox() {
    const state = this.store.getState()
    const scope = reportRequestScope(state)
    if (this.inboxWork?.scope === scope) return this.inboxWork.promise
    if (
      this.inbox(state) &&
      this.load(state)?.scope === scope &&
      !this.load(state)?.error
    )
      return Promise.resolve()
    return this.refreshInbox()
  }
  refreshInbox(more = false, preserveWindow = false): Promise<void> {
    const state = this.store.getState()
    const scope = reportRequestScope(state)
    if (!state.ready || !state.binding) return Promise.resolve()
    if (this.inboxWork?.scope === scope) {
      const pending = this.inboxWork.promise
      if (more && this.load(state)?.kind === 'refresh')
        // A refresh cannot satisfy explicit pagination. Re-enter after its full
        // cleanup so another refresh started by a subscriber is waited out too.
        return pending
          .catch(() => {})
          .then(() => {
            const binding = this.store.getState().binding
            if (!binding || bindingKey(binding) !== bindingKey(state.binding!))
              return
            return this.refreshInbox(true)
          })
      return pending
    }
    // Preferences project immediately. Keep membership stable until the command
    // settles; an uncached inbox remains readable during recovery.
    if (
      this.inbox(state) &&
      pendingReportPreferences(state.attempts.values()).length
    )
      return Promise.resolve()
    if (more && this.inbox(state) && !this.inbox(state)?.has_more)
      return Promise.resolve()
    const inbox = this.inbox(state)
    const minimumRevision = BigInt(reportRevision(state))
    const observed: BoundReports[] = []
    const work: Work<void> = { scope, promise: Promise.resolve() }
    this.inboxWork = work
    const current = () =>
      this.inboxWork === work &&
      reportRequestScope(this.store.getState()) === scope
    const read = async (cursor: string | null) => {
      const response = current()
        ? await this.port.page(cursor, this.query ?? unreadReportQuery)
        : null
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
        : readReportInbox(
            read,
            // Only revalidate the history this surface actually displayed.
            // Passive HUD refreshes always request one unread page.
            this.query || preserveWindow ? (inbox?.items.length ?? 0) : 0,
          )
    )
      .then((reportInbox) => {
        if (!current()) return
        this.inboxWork = null
        this.publish({
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
          this.publish({
            reportInboxLoad: { scope, kind, pending: false, error },
          })
        throw error
      })
      .finally(() => {
        if (this.inboxWork === work) this.inboxWork = null
      })
    this.publish({
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
