import type { Coordinator } from '../client-model/coordinator'
import { projectedReportHeader } from '../client-model/report-state'

/** Recheck live protection, then submit the entire selection as one durable action. */
export async function changeReportSelection(
  model: Pick<Coordinator, 'store' | 'send'>,
  reports: string[],
  hidden = true,
) {
  const state = model.store.getState()
  if (!state.binding || !state.ready) throw new Error('Report context changed')
  const eligible = [...new Set(reports)].filter((report) => {
    const current = projectedReportHeader(
      state.reportHeaders,
      state.attempts.values(),
      report,
    )
    return current && current.hidden !== hidden && (!hidden || !current.starred)
  })
  if (!eligible.length) return
  const submitted = await model.send({
    type: 'World',
    action: { type: 'SetReportsHidden', reports: eligible, hidden },
  })
  if (!submitted) throw new Error('Archive change was not submitted')
  const attempt = [...model.store.getState().attempts.values()].find(
    (a) => a.envelope.command_id === submitted,
  )
  if (attempt?.status === 'uncertain')
    throw new Error('Archive change is uncertain')
  if (attempt?.status === 'rejected')
    throw new Error('Archive change was rejected')
}
