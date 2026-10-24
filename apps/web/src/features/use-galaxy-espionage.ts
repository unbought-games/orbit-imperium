import { useEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'
import type { Coordinator } from '../client-model/coordinator'
import type { components } from '../contracts'
import { sendGalaxyProbe } from '../client-model/send-galaxy-probe'
import { probeAvailability } from '../client-model/galaxy-fleets'

export function useGalaxyEspionage(model: Coordinator, origin: string) {
  const state = useStore(model.store)
  const context = useRef({})
  const lock = useRef(false)
  const [sending, setSending] = useState<string | null>(null)
  const [error, setError] = useState<{
    target: string
    message: string
  } | null>(null)
  useEffect(() => {
    context.current = {}
    lock.current = false
    setSending(null)
    setError(null)
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
    try {
      await sendGalaxyProbe(
        model,
        origin,
        target,
        () => context.current === token,
      )
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
  return {
    state,
    sending,
    error,
    reason: probeAvailability(state, origin),
    send,
  }
}
