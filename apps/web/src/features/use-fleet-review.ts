import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { components } from '../contracts'
import type { Coordinator } from '../client-model/coordinator'
import { canonical } from '../client-model/commands'
import { materialCargoChanges } from '../client-model/dispatch-cargo'
import { dispatchFailure } from '../client-model/dispatch-validation'

type Terms = components['schemas']['FleetTerms4']
type Review = {
  reviewed: Terms
  latest: Terms
  refreshing: boolean
  problem: string
}

function flightConditions(quote: Terms) {
  return {
    ...quote,
    terms_hash: undefined,
    intent: { ...quote.intent, cargo: undefined },
  }
}

export function reviewDifferences(reviewed: Terms, latest: Terms) {
  const resources = materialCargoChanges(
    reviewed.intent.cargo,
    latest.intent.cargo,
  )
  const flightChanged =
    reviewed.terms_hash !== latest.terms_hash &&
    canonical(flightConditions(reviewed)) !==
      canonical(flightConditions(latest))
  return {
    resources,
    flightChanged,
    changed: !!resources.length || flightChanged,
  }
}

export function useFleetReview(model: Coordinator, revision: string) {
  const [state, setState] = useState<Review | null>(null)
  const generation = useRef(0)
  const open = useCallback((quote: Terms | null) => {
    generation.current++
    setState(
      quote && {
        reviewed: quote,
        latest: quote,
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
    if (!reviewed) return
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
  }, [reviewed, refresh])
  const lastRevision = useRef(revision)
  useEffect(() => {
    const changed = lastRevision.current !== revision
    lastRevision.current = revision
    if (changed && reviewed && document.visibilityState !== 'hidden')
      void refresh()
  }, [revision, reviewed, refresh])
  const latest = state?.latest
  const differences = useMemo(
    () => (reviewed && latest ? reviewDifferences(reviewed, latest) : null),
    [reviewed, latest],
  )
  // Minor refreshes never ratchet the baseline used by the launch transaction.
  const authorization = differences?.changed ? state?.latest : reviewed
  return { state, open, refresh, differences, authorization }
}
