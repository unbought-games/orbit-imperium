import type { components } from '../contracts'
type Header = components['schemas']['ReportHeader4']
export type ReportSort =
  | 'newest'
  | 'oldest'
  | 'metal'
  | 'crystal'
  | 'deuterium'
  | 'total'
  | 'fleet'
  | 'defenses'
export type ReportFilter = 'all' | 'espionage' | 'starred' | 'unread'
export function reportMetric(report: Header, sort: ReportSort): bigint | null {
  if (sort === 'newest' || sort === 'oldest') return BigInt(report.observed_at)
  if (sort === 'fleet' || sort === 'defenses') {
    const value =
      sort === 'fleet' ? report.fleet_investment : report.defense_investment
    return value == null ? null : BigInt(value)
  }
  const preview = report.preview
  if (
    preview?.kind !== 'Espionage' ||
    preview.resources?.visibility !== 'Known'
  )
    return null
  const resources = preview.resources.value
  return sort === 'total'
    ? Object.values(resources).reduce((sum, value) => sum + BigInt(value), 0n)
    : BigInt(resources[sort])
}
export function triageReports(
  reports: Header[],
  sort: ReportSort,
  ascending: boolean,
  filter: ReportFilter,
  knownOnly: boolean,
) {
  return reports
    .filter(
      (report) =>
        !report.hidden &&
        (filter !== 'espionage' || report.kind === 'Espionage') &&
        (filter !== 'starred' || report.starred) &&
        (filter !== 'unread' || !report.read) &&
        (!knownOnly || reportMetric(report, sort) !== null),
    )
    .sort((a, b) => {
      const av = reportMetric(a, sort),
        bv = reportMetric(b, sort)
      // Unknown observations stay last in either direction; never treat them as zero.
      if (av === null && bv !== null) return 1
      if (bv === null && av !== null) return -1
      if (av !== null && bv !== null && av !== bv) {
        const lowFirst = sort === 'oldest' || (sort !== 'newest' && ascending)
        return (av < bv ? -1 : 1) * (lowFirst ? 1 : -1)
      }
      return b.observed_at - a.observed_at || b.id.localeCompare(a.id)
    })
}
export function ageCutoff(hours: string, now: number): number | null {
  if (!/^\d+(\.\d+)?$/.test(hours.trim())) return null
  const duration = Number(hours) * 3_600_000
  const cutoff = now - duration
  return duration > 0 && Number.isSafeInteger(Math.floor(cutoff))
    ? cutoff
    : null
}
export function olderUnstarred(
  reports: Header[],
  hours: string,
  now: number,
): Header[] {
  const cutoff = ageCutoff(hours, now)
  return cutoff === null
    ? []
    : reports.filter((r) => !r.starred && !r.hidden && r.observed_at < cutoff)
}
