import { useRef, useState } from 'react'
import { useStore } from 'zustand'
import type { Coordinator } from '../client-model/coordinator'
import { attemptKey, canonical } from '../client-model/commands'
import { canSubmitQuote } from '../client-model/game-projection'
import { dispatchFailure } from '../client-model/dispatch-validation'
import type { components } from '../contracts'
type S = components['schemas']
export function useDepotSupply(
  model: Coordinator,
  body: string,
  fleet: string,
) {
  const state = useStore(model.store)
  const [amount, setAmount] = useState('1000')
  const [quote, setQuote] = useState<S['DepotSupplyQuote4'] | null>(null)
  const [commandId, setCommandId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  const valid =
    /^[1-9][0-9]{0,12}$/.test(amount) && BigInt(amount) <= 9223372036854n
  const intent = valid
    ? {
        source_planet: body,
        fleet,
        deuterium: (BigInt(amount) * 1000000n).toString(),
      }
    : null
  const context = useRef('')
  context.current = canonical({
    intent,
    binding: state.binding,
    profile: state.view?.profile_hash,
  })
  const attempt =
    commandId && state.binding
      ? state.attempts.get(attemptKey(state.binding, commandId))
      : undefined
  const pending =
    !!commandId &&
    attempt?.status !== 'rejected' &&
    attempt?.status !== 'committed'
  const committed = attempt?.status === 'committed'
  const current =
    quote &&
    canonical(quote.intent) === canonical(intent) &&
    quote.profile_hash === state.view?.profile_hash &&
    attempt?.status !== 'rejected'
      ? quote
      : null
  const command = current
    ? {
        type: 'World' as const,
        action: {
          type: 'SupplyHoldingFleet' as const,
          intent: current.intent,
          expected_terms_hash: current.terms_hash,
        },
      }
    : null
  async function perform() {
    if (lock.current || pending || committed || !intent) return
    lock.current = true
    setBusy(true)
    setError('')
    const captured = context.current
    try {
      if (!current) {
        setCommandId(null)
        const result = await model.world({ type: 'DepotSupplyQuote', intent })
        if (captured !== context.current) return
        if (!result || !('extension_ms' in result))
          throw Error('Unable to quote this supply. Refresh and try again.')
        setQuote(result)
      } else if (
        command &&
        canSubmitQuote(model.store.getState(), command, current)
      ) {
        const id = await model.send(command, current)
        if (!id)
          throw Error(
            model.store.getState().message || 'Unable to submit supply.',
          )
        setCommandId(id)
      }
    } catch (e) {
      if (captured === context.current) setError(dispatchFailure(e))
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return {
    amount,
    setAmount,
    quote: current,
    valid,
    busy: busy || pending,
    committed,
    canSubmit:
      !current || (!!command && canSubmitQuote(state, command, current)),
    error:
      attempt?.receipt?.status === 'Rejected'
        ? dispatchFailure(attempt.receipt.code)
        : error,
    perform,
    uncertain: attempt?.status === 'uncertain',
    recover: () => commandId && model.recover(commandId),
    reset: () => {
      if (!pending && !busy) {
        setCommandId(null)
        setQuote(null)
        setError('')
      }
    },
  }
}
