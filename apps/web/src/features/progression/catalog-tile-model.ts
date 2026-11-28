import type { components } from '../../contracts'
import type { BoundProgressionOptions } from '../../client-model/commands'
import { canAfford } from '../../client-model/resources'
import type { ProgressionProps } from './shared'
import { currentCatalogCost, type ProgressionRequest } from './options'
import { buildingDemandChange, mineProductionSettings } from './building-energy'

export function catalogPreviewRequest(
  request: ProgressionRequest | null,
  tile: {
    disabled?: boolean
    locked?: boolean
    level?: number | string
    progress?: { direction?: 'up' | 'down'; targetLevel?: number } | null
  },
) {
  if (tile.disabled || tile.locked) return null
  if (!tile.progress) return request
  // The running upgrade still has a demand estimate for its target level.
  return request?.type === 'Upgrade' &&
    mineProductionSettings[request.building] &&
    tile.progress.direction === 'up' &&
    tile.progress.targetLevel === Number(tile.level) + 1
    ? request
    : null
}

export function catalogPreview(
  view: ProgressionProps['view'],
  proposal: BoundProgressionOptions | null,
) {
  const cost = currentCatalogCost(proposal, view)
  const terms = proposal?.terms
  const energy = proposal?.building_energy
  if (!cost || terms?.type !== 'Building' || !energy)
    return { cost, energyDemand: null }
  const setting = mineProductionSettings[terms.building]
  if (
    !setting ||
    BigInt(energy.target_consumption) <= BigInt(energy.current_consumption)
  )
    return { cost, energyDemand: null }

  const production = view.progression.production.find(
    (entry) => entry.body === terms.body,
  )
  const percent = BigInt(production?.settings[setting] ?? 100)
  return { cost, energyDemand: buildingDemandChange(energy, percent) }
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
