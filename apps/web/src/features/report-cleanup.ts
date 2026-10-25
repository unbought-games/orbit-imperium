import type { Coordinator } from '../client-model/coordinator'
import { bindingKey } from '../client-model/commands'
import { projectedReportHeader } from '../client-model/report-state'

/** Recheck ownership and protection before each durable, reversible deletion. */
export async function deleteReportSelection(
  model: Pick<Coordinator, 'store' | 'send'>,
  reports: string[],
) {
  const binding = model.store.getState().binding
  const key = binding && bindingKey(binding)
  for (const report of reports) {
    const state = model.store.getState()
    if (!state.binding || bindingKey(state.binding) !== key || !state.ready)
      throw new Error('Report context changed')
    const current = projectedReportHeader(
      state.reportHeaders,
      state.attempts.values(),
      report,
    )
    if (!current || current.starred || current.hidden) continue
    const submitted = await model.send({
      type: 'World',
      action: { type: 'SetReportHidden', report, hidden: true },
    })
    // Offline/ledger-limit refusals do not create an attempt. Do not silently
    // clear the selection or claim the entire cleanup was submitted.
    if (!submitted) throw new Error('Deletion was not submitted')
    const attempt = [...model.store.getState().attempts.values()].find(
      (a) => a.envelope.command_id === submitted,
    )
    if (attempt?.status === 'uncertain')
      throw new Error('Deletion is uncertain')
  }
}
