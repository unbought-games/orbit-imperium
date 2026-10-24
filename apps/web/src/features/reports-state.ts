import type { components } from '../contracts'

type S = components['schemas']
export type ReportsPage = S['ReportsPage4']
export type ReportDetail = S['ReportDetail4']
export type ReportsRequest = {
  id: number
  kind: 'initial' | 'detail' | 'more'
  item: string | null
  cursor: string | null
}
export type ReportsState = {
  page: ReportsPage | null
  detail: ReportDetail | null
  error: unknown
  retainPages: boolean
  request: ReportsRequest | null
}
export const emptyReports: ReportsState = {
  page: null,
  detail: null,
  error: null,
  retainPages: false,
  request: null,
}

// Keep reconciled headers when adjacent pages overlap; append each new ID once.
export function mergeReportPages(old: ReportsPage | null, next: ReportsPage) {
  const rows = new Map(old?.items.map((row) => [row.id, row]))
  for (const row of next.items) if (!rows.has(row.id)) rows.set(row.id, row)
  return { ...next, items: [...rows.values()].filter((row) => !row.hidden) }
}

export function reconcileReportHeader(
  page: ReportsPage | null,
  header: ReportDetail['header'],
): ReportsPage | null {
  return page
    ? {
        ...page,
        items: page.items
          .map((row) => (row.id === header.id ? header : row))
          .filter((row) => !row.hidden),
      }
    : null
}

type ReportsAction =
  | { type: 'reset' }
  | { type: 'navigate'; item: string | null }
  | { type: 'invalidate' }
  | { type: 'start'; request: ReportsRequest }
  | { type: 'page'; request: ReportsRequest; page: ReportsPage }
  | { type: 'detail'; request: ReportsRequest; detail: ReportDetail }
  | { type: 'failure'; request: ReportsRequest; error: unknown }

export function reportsReducer(
  state: ReportsState,
  action: ReportsAction,
): ReportsState {
  switch (action.type) {
    case 'reset':
      return emptyReports
    case 'navigate':
      return {
        ...state,
        detail: state.detail?.header.id === action.item ? state.detail : null,
        request: null,
        error: null,
      }
    case 'invalidate':
      return { ...state, retainPages: false, request: null }
    case 'start':
      return { ...state, request: action.request, error: null }
    default:
      // A late completion must not change data, errors, or a newer busy state.
      if (state.request !== action.request) return state
      if (action.type === 'failure')
        return { ...state, request: null, error: action.error }
      if (action.type === 'detail')
        return {
          ...state,
          request: null,
          detail: action.detail,
          page: reconcileReportHeader(state.page, action.detail.header),
        }
      return {
        ...state,
        request: null,
        page:
          action.request.kind === 'more'
            ? mergeReportPages(state.page, action.page)
            : {
                ...action.page,
                items: action.page.items.filter((r) => !r.hidden),
              },
        retainPages: action.request.kind === 'more',
      }
  }
}
