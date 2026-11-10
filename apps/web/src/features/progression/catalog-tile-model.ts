import type { components } from '../../contracts'
import { canAfford } from '../../client-model/resources'
import type { ProgressionProps } from './shared'
import type { ProgressionRequest } from './options'

/** Progress, restrictions and disabled content suppress cost inspection. */
export function catalogCostRequest(
  request: ProgressionRequest | null,
  tile: { disabled?: boolean; locked?: boolean; progress?: unknown },
) {
  return tile.disabled || tile.locked || tile.progress ? null : request
}

export function catalogTileBody(
  view: ProgressionProps['view'],
  request: ProgressionRequest | null,
) {
  return request
    ? view.bodies.find(
        (body) =>
          body.id ===
          (request.type === 'Research' ? request.host : request.body),
      )
    : undefined
}

export function catalogUnaffordable(
  view: ProgressionProps['view'],
  request: ProgressionRequest | null,
  cost: components['schemas']['Resources'] | null,
) {
  const body = catalogTileBody(view, request)
  return !!cost && !!body && !canAfford(cost, body.amounts)
}
