import { useEffect, useState } from 'react'
import { canonical } from '../../client-model/commands'
import {
  currentInspection,
  inspectProgressionOptions,
  type ProgressionInspection,
} from './progression-inspection'
import type { Coordinator } from '../../client-model/coordinator'
import type { ProgressionProps } from './shared'
import {
  currentProgressionOptions,
  progressionContext,
  catalogCostContext,
  currentCatalogCost,
  type ProgressionRequest,
} from './options'

function useServerProgressionOptions(
  model: Coordinator,
  request: ProgressionRequest | null,
  context: string,
) {
  const [response, setResponse] = useState<ProgressionInspection | null>(null)
  const [attempt, setAttempt] = useState(0)
  const requestKey = canonical(request)
  const key = canonical([requestKey, context, attempt])
  useEffect(() => {
    const captured = JSON.parse(requestKey) as ProgressionRequest | null
    if (!captured) return
    return inspectProgressionOptions(model, captured, key, setResponse).cancel
  }, [model, requestKey, key])
  return {
    ...currentInspection(request, key, response),
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
