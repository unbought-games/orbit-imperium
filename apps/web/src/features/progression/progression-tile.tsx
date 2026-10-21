import type { ComponentProps } from 'react'
import { ImageTile } from '../../ui/image-catalog'
import type { ProgressionProps } from './shared'
import { progressionCommand, type ProgressionRequest } from './options'
import {
  useBuildingCost,
  useProgressionOptions,
} from './use-progression-options'
import { canAfford } from '../../client-model/resources'
import {
  canSubmitQuote,
  constructionPending,
} from '../../client-model/game-projection'

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
  const cost = useBuildingCost(
    model,
    view,
    tile.disabled || tile.progress ? null : request,
  )
  const body =
    request && 'body' in request
      ? view.bodies.find((body) => body.id === request.body)
      : null
  const unaffordable = !!cost && !!body && !canAfford(cost, body.amounts)
  const state = model.store.getState()
  const inspect =
    !!body &&
    !tile.disabled &&
    !tile.locked &&
    !tile.progress &&
    !model.stale &&
    !constructionPending(state, body.id) &&
    !view.constructions.some((work) => work.body === body.id)
  const { proposal } = useProgressionOptions(
    model,
    view,
    inspect ? request : null,
  )
  const command = progressionCommand(proposal)
  const canUpgrade =
    !!proposal &&
    !!command &&
    proposal.blockers.length === 0 &&
    canSubmitQuote(state, command, proposal)
  return (
    <ImageTile
      {...tile}
      inspectable={request?.type === 'Upgrade'}
      unaffordable={unaffordable}
      onQuickUpgrade={
        canUpgrade
          ? () => {
              if (command && proposal) void model.send(command, proposal)
            }
          : undefined
      }
    />
  )
}
