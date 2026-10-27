import { useEffect, useState } from 'react'
import {
  canonical,
  type BoundProgressionOptions,
} from '../../client-model/commands'
import type { Coordinator } from '../../client-model/coordinator'
import type { ProgressionProps } from './shared'
import {
  currentProgressionOptions,
  progressionContext,
  catalogCostContext,
  currentCatalogCost,
  type ProgressionRequest,
} from './options'

type Response = {
  key: string
  proposal: BoundProgressionOptions | null
  error: string
}

function useServerProgressionOptions(
  model: Coordinator,
  request: ProgressionRequest | null,
  context: string,
) {
  const [response, setResponse] = useState<Response | null>(null)
  const [attempt, setAttempt] = useState(0)
  const requestKey = canonical(request)
  const key = canonical([requestKey, context, attempt])
  useEffect(() => {
    const captured = JSON.parse(requestKey) as ProgressionRequest | null
    if (!captured) return
    let active = true
    void model.options(captured).then(
      (proposal) => {
        if (active)
          setResponse({
            key,
            proposal,
            error: proposal
              ? ''
              : 'Construction is unavailable. Retry after reconnecting.',
          })
      },
      () => {
        if (active)
          setResponse({
            key,
            proposal: null,
            error:
              'Unable to inspect this action. Check your connection and try again.',
          })
      },
    )
    return () => {
      active = false
    }
  }, [model, requestKey, key])
  const current = request && response?.key === key ? response : null
  return {
    proposal: current?.proposal ?? null,
    loading: !!request && !current,
    error: current?.error ?? '',
    retry: () => setAttempt((value) => value + 1),
  }
}

export function useProgressionOptions(
  model: Coordinator,
  view: ProgressionProps['view'],
  request: ProgressionRequest | null,
) {
  // Server blockers describe confirmed state. An optimistic cancellation can
  // already look identical to its final snapshot, so it must not supply the
  // invalidation key. Affordability still follows the projected balances below.
  const confirmed = model.view
  const response = useServerProgressionOptions(
    model,
    request,
    progressionContext(
      confirmed && confirmed.protocol !== 2 ? confirmed : view,
    ),
  )
  return {
    ...response,
    proposal: response.proposal
      ? currentProgressionOptions(response.proposal, view)
      : null,
  }
}

/** Cost data is reusable across queue changes; action eligibility is not. */
export function useCatalogCost(
  model: Coordinator,
  view: ProgressionProps['view'],
  request: ProgressionRequest | null,
) {
  const priced = request?.type === 'Demolition' ? null : request
  const { proposal } = useServerProgressionOptions(
    model,
    priced,
    catalogCostContext(view, priced),
  )
  return currentCatalogCost(proposal, view)
}
