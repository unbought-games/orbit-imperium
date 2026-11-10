import { useMemo, useState } from 'react'
import { useStore } from 'zustand'
import type { Coordinator } from '../client-model/coordinator'
import { SettingsAction } from './settings-action'
import { deletionState, empireDeletionCommand } from './settings-state'

export function useEmpireDeletion(model: Coordinator) {
  const state = useStore(model.store)
  const [presenceAttempt, setPresenceAttempt] = useState<string>()
  const submission = useMemo(
    () =>
      new SettingsAction(
        model,
        'Unable to submit this change. Check your connection and try again.',
      ),
    [model],
  )
  const local = useStore(submission.store)
  const action = deletionState(state, presenceAttempt)
  async function submit(mode: 'request' | 'cancel' | 'keep') {
    const id = await submission.submit(
      empireDeletionCommand(mode),
      () => !deletionState(model.store.getState(), presenceAttempt).pending,
    )
    if (id && mode === 'keep') setPresenceAttempt(id)
  }
  return {
    ...action,
    pending: local.submitting || action.pending,
    error: local.error,
    submit,
  }
}
