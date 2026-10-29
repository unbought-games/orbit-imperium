import { useEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'
import type { Coordinator } from '../client-model/coordinator'
import type { components } from '../contracts'
import { sendGalaxyProbe } from '../client-model/send-galaxy-probe'
import { probeAvailability } from '../client-model/galaxy-fleets'
import { attemptKey } from '../client-model/commands'
import { dispatchFailure } from '../client-model/dispatch-validation'

export function useGalaxyEspionage(model: Coordinator, origin: string) {
  const state = useStore(model.store)
  const context = useRef({})
  const lock = useRef(false)
  const [sending, setSending] = useState<string | null>(null)
  const [lastCommand, setLastCommand] = useState<{
    id: string
    target: string
  } | null>(null)
  const [error, setError] = useState<{
    target: string
    message: string
  } | null>(null)
  useEffect(() => {
    context.current = {}
    lock.current = false
    setSending(null)
    setError(null)
    setLastCommand(null)
    return () => {
      context.current = {}
    }
  }, [model, origin])
  const send = async (
    target: NonNullable<components['schemas']['GalaxyPosition4']['body']>,
  ) => {
    if (lock.current) return
    const token = context.current
    lock.current = true
    setSending(target.id)
    setError(null)
    setLastCommand(null)
    try {
      const id = await sendGalaxyProbe(
        model,
        origin,
        target,
        () => context.current === token,
      )
      if (id && context.current === token)
        setLastCommand({ id, target: target.id })
    } catch (failure) {
      if (context.current === token)
        setError({
          target: target.id,
          message:
            failure instanceof Error
              ? failure.message
              : 'Unable to send the probe.',
        })
    } finally {
      if (context.current === token) {
        lock.current = false
        setSending(null)
      }
    }
  }
  const attempt =
    lastCommand && state.binding
      ? state.attempts.get(attemptKey(state.binding, lastCommand.id))
      : undefined
  const rejection =
    lastCommand &&
    attempt?.status === 'rejected' &&
    attempt.receipt?.status === 'Rejected'
      ? {
          target: lastCommand.target,
          message: dispatchFailure(attempt.receipt.code),
        }
      : null
  return {
    state,
    sending,
    error: rejection ?? error,
    localError: error,
    reason: probeAvailability(state, origin),
    send,
  }
}
