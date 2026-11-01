import { useRef, useState } from 'react'
import { useStore } from 'zustand'
import type { Coordinator } from '../client-model/coordinator'
import type { components } from '../contracts'
import { pendingCommand } from '../client-model/game-projection'
import { dispatchFailure } from '../client-model/dispatch-validation'
export function useGroupCommand(
  model: Coordinator,
  action: components['schemas']['WorldAction4'],
) {
  const command = { type: 'World' as const, action }
  const pending = useStore(
    model.store,
    (state) => !!pendingCommand(state, command),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  async function send() {
    if (lock.current || pending) return
    lock.current = true
    setBusy(true)
    setError('')
    try {
      if (!(await model.send(command)))
        setError(model.store.getState().message || 'Unable to send this order.')
    } catch (e) {
      setError(dispatchFailure(e))
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return { pending: pending || busy, error, send }
}
