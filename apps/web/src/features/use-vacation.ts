import { useMemo } from 'react'
import { useStore } from 'zustand'
import type { Coordinator } from '../client-model/coordinator'
import { SettingsAction } from './settings-action'
import { vacationState, canSubmitVacation } from './settings-state'

export function useVacation(model: Coordinator) {
  const state = useStore(model.store)
  const submission = useMemo(
    () =>
      new SettingsAction(
        model,
        'Unable to submit this change. Reconnect and try again.',
      ),
    [model],
  )
  const local = useStore(submission.store)
  const action = vacationState(state)
  return {
    ...action,
    pending: local.submitting || action.pending,
    error: local.error,
    submit: (enter: boolean) =>
      submission.submit(
        {
          type: 'World',
          action: { type: enter ? 'EnterVacation' : 'ExitVacation' },
        },
        () => canSubmitVacation(model.store.getState(), enter),
      ),
  }
}
