import type { GameState } from './game-store'
import { pendingProgression, pendingCommand } from './game-projection'
import { remaining, formatRemaining } from './clock'
import { pendingCancellation, progressStatus } from './progress-status'

/** Research work is derived from confirmed operations or the submitted quote. */
export function researchProgress(state: GameState) {
  const view = state.view
  if (!view || view.protocol === 2) return null
  const confirmed = view.progression.research_operation
  const optimistic = confirmed
    ? null
    : pendingProgression(state).find((entry) => entry.terms.type === 'Research')
  const terms = optimistic?.terms.type === 'Research' ? optimistic.terms : null
  const work = confirmed ?? terms
  if (!work) return null
  const operationId = confirmed?.id ?? optimistic?.operationId ?? null
  const cancelling = pendingCancellation(state, 'CancelResearch', operationId)
  const dueAt =
    confirmed?.due_at ?? optimistic!.submittedAt + terms!.duration_ms
  const seconds = remaining(dueAt, view.sampled_at, state.receivedAt, state.now)
  return {
    secondsRemaining: seconds,
    dueAt,
    research: work.research,
    targetLevel: work.target_level,
    paid: work.paid,
    operationId,
    canCancel:
      (confirmed ? confirmed.can_cancel : !!optimistic?.operationId) &&
      !!operationId &&
      !pendingCommand(state, {
        type: 'CancelResearch',
        operation: operationId,
      }),
    countdown: formatRemaining(seconds),
    status: progressStatus({
      cancelling,
      confirmed: !!confirmed,
      pendingStatus: optimistic?.status,
    }),
  }
}
