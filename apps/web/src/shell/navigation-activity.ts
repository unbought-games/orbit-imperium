import type { GameState } from '../client-model/game-store'
import { pendingWork } from '../client-model/game-projection'
import { manufacturingQueue } from '../client-model/manufacturing-queue'
import { catalogPage } from './catalog-routes'
import type { Page } from './routes'

/** Derive badges from current work, including unresolved submitted orders. */
export function developmentActivity(state: GameState, body?: string) {
  const active = new Set<Page>()
  const view = state.view
  if (!view) return active
  const pending = pendingWork(state, body ?? '')
  if (
    view.protocol !== 2 &&
    (view.progression.research_operation || pending.research)
  )
    active.add('research')
  if (!body) return active
  const construction =
    view.constructions.find((work) => work.body === body) ??
    pending.construction
  if (construction)
    active.add(catalogPage({ kind: 'Building', id: construction.building }))
  for (const batch of manufacturingQueue(view, body, pending.manufacturing)) {
    if (BigInt(batch.remaining) <= 0n) continue
    if (batch.item.kind === 'Ship') active.add('shipyard')
    else if (batch.item.kind === 'Defense') active.add('defense')
  }
  return active
}
