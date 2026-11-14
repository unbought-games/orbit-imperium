import type { components } from '../contracts'
import type { ReportListOptions } from '../features/report-list-options'

export type ReportQuery = {
  limit?: number
  kind: string | null
  filter: components['schemas']['ReportFilter4']
}
export const unreadReportQuery: ReportQuery = {
  kind: null,
  filter: {
    hidden: false,
    unread_only: true,
    starred_only: false,
    sort: 'newest',
  },
}
export function reportQuery(
  options: ReportListOptions,
  archived: boolean,
): ReportQuery {
  return {
    kind: options.kind === 'all' ? null : options.kind,
    filter: {
      hidden: archived,
      unread_only: options.status === 'unread',
      starred_only: options.status === 'starred',
      sort: options.sort,
    },
  }
}
export const reportQueryKey = (query: ReportQuery) =>
  JSON.stringify([
    query.kind,
    query.limit ?? 50,
    query.filter.target_body ?? null,
    query.filter.hidden ?? null,
    !!query.filter.unread_only,
    !!query.filter.starred_only,
    query.filter.sort ?? 'newest',
  ])
