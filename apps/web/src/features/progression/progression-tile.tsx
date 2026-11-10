import type { ComponentProps } from 'react'
import { ImageTile } from '../../ui/image-catalog'
import type { ProgressionProps } from './shared'
import type { ProgressionRequest } from './options'
import { useCatalogCost } from './use-progression-options'
import { BuildingQuickBuild } from './building-quick-build'
import {
  catalogCostRequest,
  catalogTileBody,
  catalogUnaffordable,
} from './catalog-tile-model'

/** Keeps server cost inputs separate from affordability, which follows live balances. */
export function ProgressionTile({
  model,
  view,
  request,
  ...tile
}: ComponentProps<typeof ImageTile> & {
  model: ProgressionProps['coordinator']
  view: ProgressionProps['view']
  request: ProgressionRequest | null
}) {
  const cost = useCatalogCost(model, view, catalogCostRequest(request, tile))
  const body = catalogTileBody(view, request)
  const unaffordable = catalogUnaffordable(view, request, cost)
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
        unavailable={
          tile.disabled ? (tile.disabledReason ?? 'Unavailable') : ''
        }
      />
    )
  return <ImageTile {...props} />
}
