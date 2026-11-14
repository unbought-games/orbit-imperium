import { useRef, useState } from 'react'
import { useStore } from 'zustand'
import type { Coordinator } from '../client-model/coordinator'
import { canonical, attemptKey } from '../client-model/commands'
import {
  canSubmitQuote,
  currentServerTime,
  projectGameView,
} from '../client-model/game-projection'
import { dispatchFailure } from '../client-model/dispatch-validation'
import type { components } from '../contracts'
import { jumpSelection, jumpShips, pendingJump } from './jump-gate-model'
type S = components['schemas']
export function useJumpGate(model: Coordinator, sourceId: string) {
  const state = useStore(model.store)
  const [destinationId, setDestination] = useState('')
  const [quantities, setQuantities] = useState<Record<string, string>>({})
  const [quote, setQuote] = useState<S['JumpQuote4'] | null>(null)
  const [commandId, setCommandId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  const view = projectGameView(state)
  const source =
    view?.protocol === 4
      ? view.bodies.find((b) => b.id === sourceId)
      : undefined
  const destinations =
    view?.protocol === 4
      ? view.bodies.filter((b) => b.kind === 'Moon' && b.id !== sourceId)
      : []
  const destination = destinations.find((b) => b.id === destinationId)
  const ships =
    source && view?.protocol === 4 ? jumpShips(source, view.catalog) : []
  const intent =
    source && view?.protocol === 4
      ? jumpSelection(
          source,
          destinationId,
          view.binding.player,
          quantities,
          view.catalog,
        )
      : null
  const pending =
    pendingJump(state, sourceId) ??
    (destinationId ? pendingJump(state, destinationId) : undefined)
  const attempt =
    commandId && state.binding
      ? state.attempts.get(attemptKey(state.binding, commandId))
      : undefined
  const now = currentServerTime(state)
  const blocker = !source?.levels.JumpGate
    ? 'Complete Jump Gate level 1 on this moon first.'
    : !source.jump_gate
      ? 'Jump Gates are unavailable in this universe.'
      : source.jump_gate.ready_at > now
        ? 'This gate is cooling down.'
        : !destinations.length
          ? 'Build a Jump Gate on another moon to connect your empire.'
          : !destination
            ? 'Choose a destination moon.'
            : !destination.levels.JumpGate
              ? 'Complete a Jump Gate on the destination moon.'
              : !destination.jump_gate
                ? 'Destination gate status is unavailable.'
                : destination.jump_gate.ready_at > now
                  ? 'The destination gate is cooling down.'
                  : view?.protocol === 4 && view.vacation?.active
                    ? 'Leave vacation mode before jumping.'
                    : !ships.length
                      ? 'Station mobile ships on this moon to transfer them.'
                      : null
  const context = useRef('')
  context.current = canonical({
    intent,
    binding: state.binding,
    profile: view?.profile_hash,
  })
  const current =
    quote &&
    canonical(quote.intent) === canonical(intent) &&
    quote.profile_hash === view?.profile_hash
      ? quote
      : null
  const command = current
    ? {
        type: 'World' as const,
        action: {
          type: 'JumpShips' as const,
          intent: current.intent,
          expected_terms_hash: current.terms_hash,
        },
      }
    : null
  async function perform() {
    if (lock.current || pending || blocker || !intent) return
    lock.current = true
    setBusy(true)
    setError('')
    const captured = context.current
    try {
      if (!current) {
        setCommandId(null)
        const result = await model.world({ type: 'JumpQuote', intent })
        if (context.current !== captured) return
        if (!result || !('cooldown_ms' in result))
          throw Error('Unable to review this jump. Refresh and try again.')
        setQuote(result)
      } else if (
        command &&
        canSubmitQuote(model.store.getState(), command, current)
      ) {
        const id = await model.send(command, current)
        if (!id)
          throw Error(
            model.store.getState().message || 'Unable to submit jump.',
          )
        setCommandId(id)
        setQuote(null)
      }
    } catch (e) {
      if (context.current === captured) setError(dispatchFailure(e))
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return {
    source,
    destination,
    destinations,
    destinationId,
    setDestination,
    quantities,
    setQuantity: (id: string, value: string) =>
      setQuantities((q) => ({ ...q, [id]: value })),
    selectAll: () =>
      setQuantities(
        Object.fromEntries(ships.map((s) => [s.ship_type, s.count])),
      ),
    ships,
    now,
    quote: current,
    blocker,
    busy: busy || !!pending,
    valid: !!intent,
    canSubmit:
      !command || (!!current && canSubmitQuote(state, command, current)),
    perform,
    error:
      attempt?.receipt?.status === 'Rejected'
        ? dispatchFailure(attempt.receipt.code)
        : error,
    committed: attempt?.status === 'committed',
    uncertain: pending?.status === 'uncertain',
    recover: () => pending && model.recover(pending.envelope.command_id),
  }
}
