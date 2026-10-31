import type { ReportFilter, ReportSort } from './report-triage'

export const reportSortOptions = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'total', label: 'Most resources' },
  { value: 'fleet', label: 'Fleet value' },
  { value: 'defenses', label: 'Defense value' },
] as const satisfies readonly { value: ReportSort; label: string }[]

export type ReportListOptions = {
  sort: (typeof reportSortOptions)[number]['value']
  status: Exclude<ReportFilter, 'espionage'>
  kind: string
}
export const defaultReportOptions: ReportListOptions = {
  sort: 'newest',
  status: 'all',
  kind: 'all',
}
export const reportTypes = [
  'Combat',
  'Espionage',
  'Returned',
  'Delivered',
  'Harvested',
  'Deployed',
  'Recalled',
  'SpyContact',
  'ContactLost',
  'MissionFailed',
  'Colonized',
  'ColonizationFailed',
  'MissileImpact',
  'PlanetAbandoned',
] as const
