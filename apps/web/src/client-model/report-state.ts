import type { components } from '../contracts'
import type { Attempt, BoundReceipt, Command } from './commands'

type Header = components['schemas']['ReportHeader4']
export type ReportHeaders = Map<string, { header: Header; revision: string }>
export type ReportPage = Omit<
  components['schemas']['ReportsPage4'],
  'items'
> & {
  items: string[]
}
export type ReportDetail = Omit<
  components['schemas']['ReportDetail4'],
  'header'
> & {
  report: string
}

export function mergeReportHeaders(
  current: ReportHeaders,
  headers: Header[],
  revision: string,
): ReportHeaders {
  const next = new Map(current)
  for (const header of headers) {
    const previous = next.get(header.id)
    if (!previous || BigInt(revision) >= BigInt(previous.revision))
      next.set(header.id, { header, revision })
  }
  return next
}

export function reportPreference(command: Command) {
  if (command.type !== 'World') return
  const action = command.action
  if (
    action.type === 'SetReportHidden' ||
    action.type === 'SetReportsHidden' ||
    action.type === 'SetReportStarred' ||
    action.type === 'MarkReportRead'
  )
    return action
}

export function preferenceReports(
  action: NonNullable<ReturnType<typeof reportPreference>>,
) {
  return action.type === 'SetReportsHidden' ? action.reports : [action.report]
}

// A committed receipt is authoritative for every preference in the batch.
// Its revision prevents older list/detail responses undoing successful archiving.
export function acceptReportVisibility(
  headers: ReportHeaders,
  attempt: Attempt,
  receipt: BoundReceipt,
): ReportHeaders {
  const action = reportPreference(attempt.envelope.command)
  if (!action || receipt.status !== 'Committed') return headers
  const updated: Header[] = []
  for (const report of preferenceReports(action)) {
    const previous = headers.get(report)
    if (!previous) continue
    updated.push({
      ...previous.header,
      ...(action.type === 'MarkReportRead'
        ? { read: true }
        : action.type === 'SetReportStarred'
          ? { starred: action.starred }
          : {
              hidden: action.hidden,
            }),
    })
  }
  return updated.length
    ? mergeReportHeaders(headers, updated, receipt.minimum_viewer_revision)
    : headers
}

export function projectedReportHeader(
  headers: ReportHeaders,
  attempts: Iterable<Attempt>,
  report: string,
): Header | undefined {
  const source = headers.get(report)
  if (!source) return
  let hidden = source.header.hidden
  let starred = source.header.starred
  for (const attempt of attempts) {
    const action = reportPreference(attempt.envelope.command)
    if (
      !action ||
      action.type === 'MarkReportRead' ||
      !preferenceReports(action).includes(report)
    )
      continue
    if (
      attempt.status === 'submitting' ||
      attempt.status === 'pending' ||
      (attempt.receipt?.status === 'Committed' &&
        BigInt(attempt.receipt.minimum_viewer_revision) >
          BigInt(source.revision))
    ) {
      if (action.type === 'SetReportStarred') starred = action.starred
      else hidden = action.hidden
    }
  }
  return hidden === source.header.hidden && starred === source.header.starred
    ? source.header
    : { ...source.header, hidden, starred }
}

// A batch failure is superseded only after every affected preference succeeds.
export function supersededReportFailures(
  attempts: import('./commands').AttemptLedger,
) {
  const confirmed = new Set<string>()
  return [...attempts].reverse().filter(([, attempt]) => {
    const action = reportPreference(attempt.envelope.command)
    if (!action || action.type === 'MarkReportRead') return false
    const kind = action.type === 'SetReportStarred' ? 'starred' : 'hidden'
    const preferences = preferenceReports(action).map(
      (report) => `${kind}:${report}`,
    )
    if (attempt.status === 'committed' && attempt.reconciled)
      for (const preference of preferences) confirmed.add(preference)
    return (
      attempt.status === 'rejected' &&
      preferences.every((preference) => confirmed.has(preference))
    )
  })
}
