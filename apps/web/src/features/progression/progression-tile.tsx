import type { ComponentProps } from 'react'
import { ImageTile } from '../../ui/image-catalog'
import type { ProgressionProps } from './shared'
import type { ProgressionRequest } from './options'
import { useCatalogCost } from './use-progression-options'
import { BuildingQuickBuild } from './building-quick-build'
import { canAfford } from '../../client-model/resources'

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
  const cost = useCatalogCost(
    model,
    view,
    tile.disabled || tile.locked || tile.progress ? null : request,
  )
  const body = request
    ? view.bodies.find(
        (body) =>
          body.id ===
          (request.type === 'Research' ? request.host : request.body),
      )
    : null
  const unaffordable = !!cost && !!body && !canAfford(cost, body.amounts)
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
        body={body}
        request={request}
        tile={props}
        unavailable={
          tile.disabled ? (tile.disabledReason ?? 'Unavailable') : ''
        }
        cost={cost}
      />
    )
  return <ImageTile {...props} />
}
