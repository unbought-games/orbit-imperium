import type { components } from '../contracts'
import type {
  ReportPage as StoredPage,
  ReportDetail as StoredDetail,
} from '../client-model/report-state'

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
  page: StoredPage | null
  detail: StoredDetail | null
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

// The store owns headers; pagination retains only stable report IDs.
export function mergeReportPages(
  old: StoredPage | null,
  next: ReportsPage,
): StoredPage {
  return {
    ...next,
    player_names: { ...old?.player_names, ...next.player_names },
    items: [
      ...new Set([...(old?.items ?? []), ...next.items.map((row) => row.id)]),
    ],
  }
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
        detail: state.detail?.report === action.item ? state.detail : null,
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
          detail: {
            payload: action.detail.payload,
            player_names: action.detail.player_names,
            report: action.detail.header.id,
          },
        }
      return {
        ...state,
        request: null,
        page:
          action.request.kind === 'more'
            ? mergeReportPages(state.page, action.page)
            : {
                ...action.page,
                items: action.page.items.map((r) => r.id),
              },
        retainPages: action.request.kind === 'more',
      }
  }
}
