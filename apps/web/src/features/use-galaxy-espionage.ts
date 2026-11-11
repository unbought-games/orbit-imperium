import { useEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'
import type { Coordinator } from '../client-model/coordinator'
import type { components } from '../contracts'
import { sendGalaxyProbe } from '../client-model/send-galaxy-probe'
import { pendingProbe, probeAvailability } from '../client-model/galaxy-fleets'
import { attemptKey } from '../client-model/commands'
import { dispatchFailure } from '../client-model/dispatch-validation'

type Target = NonNullable<components['schemas']['GalaxyPosition4']['body']>

function withEntry<V>(map: ReadonlyMap<string, V>, key: string, value: V) {
  return new Map(map).set(key, value)
}

function withoutEntry<V>(map: ReadonlyMap<string, V>, key: string) {
  const next = new Map(map)
  next.delete(key)
  return next
}

/** Probes to different targets are independent; only a repeat click on one target waits. */
export function useGalaxyEspionage(
  model: Coordinator,
  origin: string,
  count = '1',
  unavailable: string | null = null,
) {
  const state = useStore(model.store)
  const context = useRef({})
  const locks = useRef(new Set<string>())
  const [sending, setSending] = useState<ReadonlySet<string>>(new Set())
  const [commands, setCommands] = useState<ReadonlyMap<string, string>>(
    new Map(),
  )
  const [errors, setErrors] = useState<ReadonlyMap<string, string>>(new Map())
  useEffect(() => {
    context.current = {}
    locks.current = new Set()
    setSending(new Set())
    setErrors(new Map())
    setCommands(new Map())
    return () => {
      context.current = {}
    }
  }, [model, origin])
  const send = async (target: Target) => {
    if (unavailable || locks.current.has(target.id)) return
    const token = context.current
    const held = locks.current
    held.add(target.id)
    setSending((current) => new Set(current).add(target.id))
    setErrors((current) => withoutEntry(current, target.id))
    setCommands((current) => withoutEntry(current, target.id))
    try {
      const id = await sendGalaxyProbe(
        model,
        origin,
        target,
        () => context.current === token,
        count,
      )
      if (id && context.current === token)
        setCommands((current) => withEntry(current, target.id, id))
    } catch (failure) {
      if (context.current === token)
        setErrors((current) =>
          withEntry(
            current,
            target.id,
            failure instanceof Error
              ? failure.message
              : 'Unable to send the probe.',
          ),
        )
    } finally {
      held.delete(target.id)
      if (context.current === token)
        setSending((current) => {
          const next = new Set(current)
          next.delete(target.id)
          return next
        })
    }
  }
  const rejection = (target: string) => {
    const command = commands.get(target)
    const attempt =
      command && state.binding
        ? state.attempts.get(attemptKey(state.binding, command))
        : undefined
    return attempt?.status === 'rejected' &&
      attempt.receipt?.status === 'Rejected'
      ? dispatchFailure(attempt.receipt.code)
      : null
  }
  const reason = unavailable ?? probeAvailability(state, origin, count)
  return {
    state,
    forTarget: (target: Target) => ({
      send: () => void send(target),
      count,
      paused: state.rateLimited,
      busy: sending.has(target.id) || pendingProbe(state, origin, target.id),
      reason: sending.has(target.id)
        ? count === '1'
          ? 'Sending a probe…'
          : `Sending ${count} probes…`
        : reason,
      error: rejection(target.id) ?? errors.get(target.id) ?? null,
      notice: errors.get(target.id) ?? null,
    }),
  }
}
