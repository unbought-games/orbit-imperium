import type { ComponentProps } from 'react'
import { ImageTile } from '../../ui/image-catalog'
import type { ProgressionProps } from './shared'
import type { ProgressionRequest } from './options'
import { useCatalogPreview } from './use-progression-options'
import { BuildingQuickBuild } from './building-quick-build'
import {
  catalogPreviewRequest,
  catalogTileBody,
  catalogUnaffordable,
} from './catalog-tile-model'

/** Keeps server cost inputs separate from affordability, which follows live balances. */
export function ProgressionTile({
  model,
  view,
  request,
  showDesktopCosts = false,
  ...tile
}: ComponentProps<typeof ImageTile> & {
  model: ProgressionProps['coordinator']
  view: ProgressionProps['view']
  request: ProgressionRequest | null
  showDesktopCosts?: boolean
}) {
  const { cost, energyDemand } = useCatalogPreview(
    model,
    view,
    catalogPreviewRequest(request, tile),
  )
  const body = catalogTileBody(view, request)
  const upgradeCost = tile.progress ? null : cost
  const unaffordable = catalogUnaffordable(view, request, upgradeCost)
  const props = {
    ...tile,
    inspectable: request?.type === 'Upgrade',
    unaffordable,
  }
  if (request?.type === 'Upgrade' && body)
    return (
      <BuildingQuickBuild
        key={`${request.body}:${request.building}`}
        model={model}
        view={view}
        request={request}
        tile={props}
        cost={upgradeCost}
        showDesktopCosts={showDesktopCosts}
        energyDemand={energyDemand}
        unavailable={
          tile.disabled ? (tile.disabledReason ?? 'Unavailable') : ''
        }
      />
    )
  return <ImageTile {...props} />
}
