import type { GameState } from './game-store'
import { pendingConstruction, pendingCommand } from './game-projection'
import { remaining, formatRemaining } from './clock'
import { pendingCancellation, progressStatus } from './progress-status'

/** Presentation derived from the session's confirmed work, submitted intents, and clock. */
export function buildingProgress(state: GameState, body: string) {
  const view = state.view
  const planet = view?.bodies.find((entry) => entry.id === body)
  if (!view || !planet) return null
  const confirmed = view.constructions.find((work) => work.body === body)
  const optimistic = confirmed ? null : pendingConstruction(state, body)
  const work = confirmed ?? optimistic
  if (!work) return null
  const operation = confirmed?.id ?? optimistic?.operationId
  const cancelling = pendingCancellation(state, 'CancelConstruction', operation)
  const seconds = remaining(
    work.due_at,
    view.sampled_at,
    state.receivedAt,
    state.now,
  )
  const countdown = formatRemaining(seconds)
  return {
    operationId: operation ?? null,
    paid: work.paid,
    canCancel:
      !!operation &&
      !pendingCommand(state, { type: 'CancelConstruction', operation }),
    building: work.building,
    targetLevel: work.target_level,
    direction:
      work.target_level <
      (planet.levels[work.building as keyof typeof planet.levels] ?? 0)
        ? ('down' as const)
        : ('up' as const),
    countdown,
    secondsRemaining: seconds,
    dueAt: work.due_at,
    status: progressStatus({
      cancelling,
      confirmed: !!confirmed,
      pendingStatus: optimistic?.status,
    }),
  }
}
