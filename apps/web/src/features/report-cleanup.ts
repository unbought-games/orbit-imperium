import type { Coordinator } from '../client-model/coordinator'
import { projectedReportHeader } from '../client-model/report-state'

/** Recheck live protection, then submit the entire selection as one durable action. */
export async function deleteReportSelection(
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
    return current && !current.starred && !current.hidden
  })
  if (!eligible.length) return
  const submitted = await model.send({
    type: 'World',
    action: { type: 'SetReportsHidden', reports: eligible, hidden: true },
  })
  if (!submitted) throw new Error('Deletion was not submitted')
  const attempt = [...model.store.getState().attempts.values()].find(
    (a) => a.envelope.command_id === submitted,
  )
  if (attempt?.status === 'uncertain') throw new Error('Deletion is uncertain')
  if (attempt?.status === 'rejected') throw new Error('Deletion was rejected')
}
