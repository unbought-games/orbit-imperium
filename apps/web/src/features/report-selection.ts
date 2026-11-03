import type { Coordinator } from '../client-model/coordinator'
import { projectedReportHeader } from '../client-model/report-state'

/** Apply a range in display order, retaining selections outside that range. */
export function toggleReportSelection(
  selected: ReadonlySet<string>,
  visible: string[],
  id: string,
  checked: boolean,
  anchor: string | null,
) {
  const next = new Set(selected)
  const start = anchor === null ? -1 : visible.indexOf(anchor)
  const end = visible.indexOf(id)
  const range =
    start < 0 || end < 0
      ? [id]
      : visible.slice(Math.min(start, end), Math.max(start, end) + 1)
  for (const report of range) {
    if (checked) next.add(report)
    else next.delete(report)
  }
  return next
}

/** Submit all eligible unread reports as one durable, atomic action. */
export async function markReportSelectionRead(
  model: Pick<Coordinator, 'store' | 'send'>,
  reports: string[],
) {
  const state = model.store.getState()
  if (!state.binding || !state.ready) throw new Error('Report context changed')
  const eligible = [...new Set(reports)].filter((report) => {
    const current = projectedReportHeader(
      state.reportHeaders,
      state.attempts.values(),
      report,
    )
    return current && !current.read
  })
  if (!eligible.length) return
  const submitted = await model.send({
    type: 'World',
    action: { type: 'MarkReportsRead', reports: eligible },
  })
  if (!submitted) throw new Error('Read change was not submitted')
  const attempt = [...model.store.getState().attempts.values()].find(
    (a) => a.envelope.command_id === submitted,
  )
  if (attempt?.status === 'uncertain' || attempt?.status === 'rejected')
    throw new Error('Read change was not confirmed')
}
