import type { Command } from '../client-model/commands'
import type { GameState } from '../client-model/game-store'
import {
  activeAttempt,
  currentServerTime,
} from '../client-model/game-projection'
import { actionMessage } from '../ui/action-announcements'

export function vacationState(state: GameState) {
  const attempt = [...state.attempts.values()]
    .reverse()
    .find(
      ({ envelope }) =>
        envelope.command.type === 'World' &&
        (envelope.command.action.type === 'EnterVacation' ||
          envelope.command.action.type === 'ExitVacation'),
    )
  const vacation = state.view?.protocol === 4 ? state.view.vacation : undefined
  return {
    vacation,
    pending: !!attempt && activeAttempt(attempt, state.view),
    canExit:
      !!vacation?.active &&
      (vacation.earliest_exit_at === null ||
        currentServerTime(state) >= vacation.earliest_exit_at),
    ready: state.ready,
    failed: attempt?.status === 'rejected',
    message: attempt ? actionMessage(attempt) : '',
  }
}

export function deletionState(state: GameState, presenceAttempt?: string) {
  const attempt = [...state.attempts.values()]
    .reverse()
    .find(
      ({ envelope }) =>
        envelope.command.type === 'World' &&
        (envelope.command_id === presenceAttempt ||
          envelope.command.action.type === 'RequestEmpireDeletion' ||
          envelope.command.action.type === 'CancelEmpireDeletion'),
    )
  return {
    pending: !!attempt && activeAttempt(attempt, state.view),
    ready: state.ready,
    failed: attempt?.status === 'rejected',
    message: attempt ? actionMessage(attempt) : '',
  }
}

export function canSubmitVacation(state: GameState, enter: boolean) {
  const current = vacationState(state)
  return (
    !current.pending &&
    !!current.vacation &&
    (enter
      ? !current.vacation.active && current.vacation.blockers.length === 0
      : current.canExit)
  )
}

export function empireDeletionCommand(
  mode: 'request' | 'cancel' | 'keep',
): Command {
  return {
    type: 'World',
    action:
      mode === 'keep'
        ? {
            type: 'RecordForegroundPresence',
            body: null,
            cause: 'AccountVisit',
            paired_command_id: null,
          }
        : {
            type:
              mode === 'cancel'
                ? 'CancelEmpireDeletion'
                : 'RequestEmpireDeletion',
          },
  }
}
