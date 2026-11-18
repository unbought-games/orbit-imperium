import type { Coordinator } from '../client-model/coordinator'
import { sameBinding } from '../client-model/commands'
export { pendingReportVisibility } from '../client-model/report-state'

/** Observe this gesture's receipt before successful attempts are pruned. */
export function observeReportVisibilityCommit(
  store: Coordinator['store'],
  key: string,
  committed: () => void,
) {
  const initial = store.getState()
  const stop = store.subscribe((state) => {
    const attempt = state.attempts.get(key)
    if (
      !attempt ||
      !initial.binding ||
      !state.binding ||
      !sameBinding(initial.binding, state.binding) ||
      attempt.receipt?.status === 'Rejected'
    ) {
      stop()
    } else if (attempt.receipt?.status === 'Committed') {
      stop()
      committed()
    }
  })
  return stop
}
