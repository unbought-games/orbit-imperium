import type { Coordinator } from '../client-model/coordinator'
import { sameBinding } from '../client-model/commands'
export { pendingReportVisibility } from '../client-model/report-state'

/** Observe this gesture's receipt before successful attempts are pruned. */
export function observeReportVisibilityCommit(
  store: Coordinator['store'],
  report: string,
  hidden: boolean,
  committed: () => void,
) {
  const initial = store.getState()
  let commandId: string | undefined
  const stop = store.subscribe((state) => {
    if (
      !initial.binding ||
      !state.binding ||
      !sameBinding(initial.binding, state.binding)
    ) {
      stop()
      return
    }
    for (const [key, attempt] of state.attempts) {
      const command = attempt.envelope.command
      if (
        !commandId &&
        !initial.attempts.has(key) &&
        command.type === 'World' &&
        command.action.type === 'SetReportHidden' &&
        command.action.report === report &&
        command.action.hidden === hidden
      ) {
        commandId = attempt.envelope.command_id
      }
      if (attempt.envelope.command_id !== commandId) continue
      if (attempt.receipt?.status === 'Rejected') stop()
      if (attempt.receipt?.status === 'Committed') {
        stop()
        committed()
      }
    }
  })
  return stop
}
