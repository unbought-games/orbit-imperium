import type { components } from '../contracts'
import type { Attempt, BoundReceipt } from './commands'

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

// A committed receipt is authoritative for this preference. Keep its revision
// so an older list/detail response cannot undo a successful deletion.
export function acceptReportVisibility(
  headers: ReportHeaders,
  attempt: Attempt,
  receipt: BoundReceipt,
): ReportHeaders {
  const command = attempt.envelope.command
  if (
    command.type !== 'World' ||
    (command.action.type !== 'SetReportHidden' &&
      command.action.type !== 'SetReportStarred') ||
    receipt.status !== 'Committed'
  )
    return headers
  const previous = headers.get(command.action.report)
  return previous
    ? mergeReportHeaders(
        headers,
        [
          {
            ...previous.header,
            ...(command.action.type === 'SetReportHidden'
              ? {
                  hidden: command.action.hidden,
                  ...(command.action.hidden && previous.header.shared
                    ? { shared: false }
                    : {}),
                }
              : { starred: command.action.starred }),
          },
        ],
        receipt.minimum_viewer_revision,
      )
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
    const command = attempt.envelope.command
    if (
      command.type !== 'World' ||
      (command.action.type !== 'SetReportHidden' &&
        command.action.type !== 'SetReportStarred') ||
      command.action.report !== report
    )
      continue
    if (
      attempt.status === 'submitting' ||
      attempt.status === 'pending' ||
      (attempt.receipt?.status === 'Committed' &&
        BigInt(attempt.receipt.minimum_viewer_revision) >
          BigInt(source.revision))
    ) {
      if (command.action.type === 'SetReportHidden')
        hidden = command.action.hidden
      else starred = command.action.starred
    }
  }
  return hidden === source.header.hidden && starred === source.header.starred
    ? source.header
    : { ...source.header, hidden, starred }
}

// Keep later failures and unresolved commands. Only a confirmed preference
// supersedes earlier rejections for that same report.
export function supersededReportFailures(
  attempts: import('./commands').AttemptLedger,
) {
  const confirmed = new Set<string>()
  return [...attempts].reverse().filter(([, attempt]) => {
    const command = attempt.envelope.command
    if (
      command.type !== 'World' ||
      (command.action.type !== 'SetReportHidden' &&
        command.action.type !== 'SetReportStarred')
    )
      return false
    const preference = `${command.action.type}:${command.action.report}`
    if (attempt.status === 'committed' && attempt.reconciled)
      confirmed.add(preference)
    return attempt.status === 'rejected' && confirmed.has(preference)
  })
}
