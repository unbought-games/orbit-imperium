import type { GameState } from './game-store'
import {
  activeAttempt,
  pendingProgression,
  pendingCommand,
} from './game-projection'
import { remaining, formatRemaining } from './clock'

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
  const cancelling = [...state.attempts.values()].some(
    (attempt) =>
      activeAttempt(attempt, view) &&
      attempt.envelope.command.type === 'CancelResearch' &&
      attempt.envelope.command.operation === operationId,
  )
  const dueAt =
    confirmed?.due_at ?? optimistic!.submittedAt + terms!.duration_ms
  return {
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
    countdown: formatRemaining(
      remaining(dueAt, view.sampled_at, state.receivedAt, state.now),
    ),
    status: cancelling
      ? 'Cancelling'
      : confirmed
        ? 'In progress'
        : optimistic?.status === 'uncertain'
          ? 'Awaiting confirmation'
          : 'Confirming',
  }
}
