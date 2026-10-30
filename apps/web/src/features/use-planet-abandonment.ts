import { useRef, useState } from 'react'
import { useStore } from 'zustand'
import type { Coordinator } from '../client-model/coordinator'
import type { components } from '../contracts'
import { activeAttempt } from '../client-model/game-projection'
import { actionMessage } from '../ui/action-announcements'

export function usePlanetAbandonment(model: Coordinator, body: string) {
  const state = useStore(model.store)
  const [quote, setQuote] = useState<
    components['schemas']['AbandonmentQuote4'] | null
  >(null)
  const [reviewedAfter, setReviewedAfter] = useState<string>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const request = useRef(0)
  const attempt = [...state.attempts.values()].reverse().find((a) => {
    const c = a.envelope.command
    return (
      c.type === 'World' &&
      c.action.type === 'AbandonPlanet' &&
      c.action.body === body
    )
  })
  const pending = !!attempt && activeAttempt(attempt, state.view)
  const rejected = attempt?.status === 'rejected'
  const currentQuote =
    rejected &&
    attempt.envelope.command_id !== reviewedAfter &&
    attempt.envelope.command.type === 'World' &&
    attempt.envelope.command.action.type === 'AbandonPlanet' &&
    attempt.envelope.command.action.expected_terms_hash === quote?.terms_hash
      ? null
      : quote
  async function review() {
    const serial = ++request.current
    setQuote(null)
    setError('')
    setBusy(true)
    try {
      const result = await model.world({ type: 'AbandonmentQuote', body })
      if (serial !== request.current) return
      if (!result || !('losses' in result) || result.body !== body)
        throw Error('Unable to load the losses. Try again.')
      setReviewedAfter(attempt?.envelope.command_id)
      setQuote(result)
    } catch {
      if (serial === request.current)
        setError('Unable to load the losses. Try again.')
    } finally {
      if (serial === request.current) setBusy(false)
    }
  }
  async function abandon() {
    if (
      lock.current ||
      pending ||
      !currentQuote ||
      currentQuote.blockers.length ||
      !model.ready
    )
      return
    lock.current = true
    setBusy(true)
    setError('')
    try {
      const id = await model.send({
        type: 'World',
        action: {
          type: 'AbandonPlanet',
          body,
          expected_terms_hash: currentQuote.terms_hash,
        },
      })
      if (!id)
        setError(
          'Unable to submit abandonment. Check your connection and try again.',
        )
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return {
    quote: currentQuote,
    error,
    busy,
    pending,
    ready: model.ready,
    status: attempt ? actionMessage(attempt) : '',
    review,
    abandon,
  }
}
