import { useRef, useState } from 'react'
import { useStore } from 'zustand'
import type { Coordinator } from '../client-model/coordinator'
import {
  activeAttempt,
  currentServerTime,
} from '../client-model/game-projection'
import { actionMessage } from '../ui/action-announcements'

export function useVacation(model: Coordinator) {
  const state = useStore(model.store)
  const lock = useRef(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const attempt = [...state.attempts.values()]
    .reverse()
    .find(
      ({ envelope }) =>
        envelope.command.type === 'World' &&
        (envelope.command.action.type === 'EnterVacation' ||
          envelope.command.action.type === 'ExitVacation'),
    )
  const pending =
    submitting || (!!attempt && activeAttempt(attempt, state.view))
  const vacation = state.view?.protocol === 4 ? state.view.vacation : undefined
  const canExit =
    !!vacation?.active &&
    (vacation.earliest_exit_at === null ||
      currentServerTime(state) >= vacation.earliest_exit_at)
  async function submit(enter: boolean) {
    if (lock.current || pending || !model.ready || !vacation) return
    if (enter ? vacation.active || vacation.blockers.length > 0 : !canExit)
      return
    lock.current = true
    setSubmitting(true)
    setError('')
    try {
      const id = await model.send({
        type: 'World',
        action: { type: enter ? 'EnterVacation' : 'ExitVacation' },
      })
      if (!id)
        setError(
          model.message ||
            'Unable to submit this change. Reconnect and try again.',
        )
    } catch {
      setError('Unable to submit this change. Reconnect and try again.')
    } finally {
      lock.current = false
      setSubmitting(false)
    }
  }
  return {
    pending,
    vacation,
    canExit,
    ready: state.ready,
    submit,
    error,
    failed: attempt?.status === 'rejected',
    message: attempt ? actionMessage(attempt) : '',
  }
}
