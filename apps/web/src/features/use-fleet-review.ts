import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { components } from '../contracts'
import type { Coordinator } from '../client-model/coordinator'
import { reviewDifferences } from './dispatch-review-model'
import { dispatchFailure } from '../client-model/dispatch-validation'

type Terms = components['schemas']['FleetTerms4']
type Review = {
  reviewed: Terms
  latest: Terms
  refreshing: boolean
  problem: string
}

export function useFleetReview(
  model: Coordinator,
  revision: string,
  initial?: Terms,
  enabled = true,
) {
  const [state, setState] = useState<Review | null>(() =>
    initial
      ? { reviewed: initial, latest: initial, problem: '', refreshing: false }
      : null,
  )
  const generation = useRef(0)
  const open = useCallback((quote: Terms | null, latest = quote) => {
    generation.current++
    setState(
      quote &&
        latest && {
          reviewed: quote,
          latest,
          refreshing: false,
          problem: '',
        },
    )
  }, [])
  const reviewed = state?.reviewed
  const refresh = useCallback(async () => {
    if (!reviewed) return
    const request = ++generation.current
    setState((old) => old && { ...old, refreshing: true })
    try {
      const latest = await model.world({
        type: 'FleetQuote',
        intent: reviewed.intent,
      })
      if (request !== generation.current) return
      if (
        !latest ||
        !('terms_hash' in latest) ||
        !('maximum_payload' in latest)
      )
        throw Error('Unavailable')
      setState({ reviewed, latest, refreshing: false, problem: '' })
    } catch (e) {
      if (request === generation.current)
        setState(
          (old) =>
            old && {
              ...old,
              refreshing: false,
              problem: dispatchFailure(e, reviewed.intent),
            },
        )
    }
  }, [model, reviewed])

  useEffect(() => {
    if (!reviewed || !enabled) return
    const visible = () => {
      if (document.visibilityState !== 'hidden') void refresh()
    }
    window.addEventListener('focus', visible)
    document.addEventListener('visibilitychange', visible)
    const timer = window.setInterval(visible, 15 * 60 * 1000)
    return () => {
      generation.current++
      window.removeEventListener('focus', visible)
      document.removeEventListener('visibilitychange', visible)
      window.clearInterval(timer)
    }
  }, [reviewed, refresh, enabled])
  const lastRevision = useRef(revision)
  useEffect(() => {
    const changed = lastRevision.current !== revision
    lastRevision.current = revision
    if (changed && enabled && reviewed && document.visibilityState !== 'hidden')
      void refresh()
  }, [revision, reviewed, refresh, enabled])
  const latest = state?.latest
  const differences = useMemo(
    () => (reviewed && latest ? reviewDifferences(reviewed, latest) : null),
    [reviewed, latest],
  )
  // Minor refreshes never ratchet the baseline used by the launch transaction.
  const authorization = differences?.changed ? state?.latest : reviewed
  return { state, open, refresh, differences, authorization }
}
