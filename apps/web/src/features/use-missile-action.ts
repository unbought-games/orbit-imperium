import { useRef, useState } from 'react'
import { useStore } from 'zustand'
import type { Coordinator } from '../client-model/coordinator'
import { attemptKey, canonical } from '../client-model/commands'
import { dispatchFailure } from '../client-model/dispatch-validation'
import type { components } from '../contracts'
type S = components['schemas']
export function useMissileAction(
  model: Coordinator,
  origin: string,
  target?: S['MissileTarget4'],
) {
  const state = useStore(model.store)
  const [count, setCount] = useState('1')
  const [primary, setPrimary] = useState<S['MissileIntent4']['primary']>(null)
  const [quote, setQuote] = useState<S['MissileTerms4'] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [commandId, setCommandId] = useState<string | null>(null)
  const lock = useRef(false)
  const context = useRef('')
  const intent = target ? { origin, target, count, primary } : null
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
  const valid =
    /^[1-9][0-9]{0,18}$/.test(count) && BigInt(count) <= 9223372036854775807n
  const currentQuote =
    quote &&
    !(
      attempt?.receipt?.status === 'Rejected' &&
      attempt.receipt.code === 'QuoteChanged'
    ) &&
    canonical(quote.intent) === canonical(intent) &&
    quote.profile_hash === state.view?.profile_hash
      ? quote
      : null
  async function perform(action: 'review' | 'launch' | S['MissileId']) {
    if (lock.current || pending || committed || !valid) return
    const captured = context.current
    lock.current = true
    setBusy(true)
    setError('')
    try {
      if (action === 'review' && intent) {
        setCommandId(null)
        const result = await model.world({ type: 'MissileQuote', intent })
        if (captured !== context.current) return
        if (!result || !('interceptor_body' in result))
          throw Error('Unable to quote this launch. Refresh and try again.')
        setQuote(result)
      } else {
        const id =
          action === 'launch'
            ? currentQuote &&
              (await model.send(
                {
                  type: 'World',
                  action: {
                    type: 'LaunchMissiles',
                    intent: currentQuote.intent,
                    expected_terms_hash: currentQuote.terms_hash,
                  },
                },
                currentQuote,
              ))
            : action !== 'review' &&
              (await model.send({
                type: 'World',
                action: {
                  type: 'ScrapMissiles',
                  body: origin,
                  item: action,
                  count,
                },
              }))
        if (!id)
          throw Error(
            model.store.getState().message || 'Unable to submit this action.',
          )
        setCommandId(id)
      }
    } catch (failure) {
      if (captured === context.current) setError(dispatchFailure(failure))
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return {
    state,
    count,
    setCount,
    primary,
    setPrimary,
    quote: currentQuote,
    valid,
    busy: busy || pending,
    committed,
    error:
      attempt?.receipt?.status === 'Rejected'
        ? dispatchFailure(attempt.receipt.code)
        : error,
    uncertain: attempt?.status === 'uncertain',
    recover: () => commandId && model.recover(commandId),
    reset: () => {
      if (!pending && !busy) {
        setCommandId(null)
        setQuote(null)
        setError('')
      }
    },
    perform,
  }
}
