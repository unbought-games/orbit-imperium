import { useRef, useState } from 'react'
import { useStore } from 'zustand'
import type { Coordinator } from '../client-model/coordinator'
import { activeAttempt } from '../client-model/game-projection'
import { actionMessage } from '../ui/action-announcements'

export function useEmpireDeletion(model: Coordinator) {
  const state = useStore(model.store)
  const lock = useRef(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [presenceAttempt, setPresenceAttempt] = useState<string>()
  const attempt = [...state.attempts.values()]
    .reverse()
    .find(
      ({ envelope }) =>
        envelope.command.type === 'World' &&
        (envelope.command_id === presenceAttempt ||
          envelope.command.action.type === 'RequestEmpireDeletion' ||
          envelope.command.action.type === 'CancelEmpireDeletion'),
    )
  const pending =
    submitting || (!!attempt && activeAttempt(attempt, state.view))
  async function submit(mode: 'request' | 'cancel' | 'keep') {
    if (lock.current || pending || !model.ready) return
    lock.current = true
    setSubmitting(true)
    setError('')
    try {
      const id = await model.send({
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
      })
      if (id && mode === 'keep') setPresenceAttempt(id)
      if (!id)
        setError(
          model.message ||
            'Unable to submit this change. Check your connection and try again.',
        )
    } finally {
      lock.current = false
      setSubmitting(false)
    }
  }
  return {
    pending,
    failed: attempt?.status === 'rejected',
    ready: state.ready,
    error,
    message: attempt ? actionMessage(attempt) : '',
    submit,
  }
}
