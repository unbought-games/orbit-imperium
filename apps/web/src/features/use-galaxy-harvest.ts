import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'
import type { Coordinator } from '../client-model/coordinator'
import { attemptKey } from '../client-model/commands'
import {
  galaxyHarvest,
  harvestCountError,
  sendGalaxyHarvest,
  type HarvestPosition,
} from '../client-model/galaxy-harvest'
import { dispatchFailure } from '../client-model/dispatch-validation'

export function useGalaxyHarvest(
  model: Coordinator,
  origin: string,
  position: HarvestPosition,
  open: boolean,
  onClose: () => void,
) {
  const state = useStore(model.store)
  const [edit, setEdit] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [commandId, setCommandId] = useState<string | null>(null)
  const context = useRef({})
  const lock = useRef(false)
  useLayoutEffect(() => {
    context.current = {}
    return () => {
      context.current = {}
    }
  }, [open, origin, model, position.debris?.field_identity])
  const availability = galaxyHarvest(state, origin, position)
  const count = edit ?? availability.suggested
  const invalid = harvestCountError(count, availability.available)
  const attempt =
    commandId && state.binding
      ? state.attempts.get(attemptKey(state.binding, commandId))
      : undefined
  const completed = attempt?.status === 'committed'
  useEffect(() => {
    if (completed && open) onClose()
  }, [completed, open, onClose])
  const awaiting = !!commandId && attempt?.status !== 'rejected'
  const rejection =
    attempt?.status === 'rejected' && attempt.receipt?.status === 'Rejected'
      ? dispatchFailure(attempt.receipt.code)
      : ''
  async function send() {
    if (
      lock.current ||
      awaiting ||
      !open ||
      invalid ||
      availability.blockers.length
    )
      return
    const token = context.current
    lock.current = true
    setSending(true)
    setError('')
    setCommandId(null)
    try {
      const id = await sendGalaxyHarvest(
        model,
        origin,
        position,
        count,
        () => context.current === token,
      )
      if (id && context.current === token) setCommandId(id)
    } catch (failure) {
      if (context.current === token)
        setError(
          failure instanceof Error
            ? failure.message
            : 'Unable to send recyclers.',
        )
    } finally {
      lock.current = false
      if (context.current === token) setSending(false)
    }
  }
  return {
    ...availability,
    count,
    setEdit,
    invalid,
    send,
    error: rejection || error,
    busy: sending || awaiting,
    uncertain: attempt?.status === 'uncertain',
    commandId,
  }
}
