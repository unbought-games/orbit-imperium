import type { Attempt, Command } from './commands'
import type { GameState } from './game-store'
import { activeAttempt } from './game-projection'

type Cancellation = Extract<
  Command,
  { type: 'CancelConstruction' | 'CancelResearch' }
>

/** A matching cancellation controls presentation, independently of eligibility. */
export function pendingCancellation(
  state: GameState,
  type: Cancellation['type'],
  operationId: string | null | undefined,
) {
  return [...state.attempts.values()].some(
    (attempt) =>
      activeAttempt(attempt, state.view) &&
      attempt.envelope.command.type === type &&
      attempt.envelope.command.operation === operationId,
  )
}

export function progressStatus({
  cancelling,
  confirmed,
  pendingStatus,
}: {
  cancelling: boolean
  confirmed: boolean
  pendingStatus?: Attempt['status']
}) {
  if (cancelling) return 'Cancelling'
  if (confirmed) return 'In progress'
  if (pendingStatus === 'uncertain') return 'Awaiting confirmation'
  return 'Confirming'
}
