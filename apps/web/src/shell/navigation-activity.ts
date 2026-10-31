import type { GameState } from '../client-model/game-store'
import {
  pendingConstruction,
  pendingWork,
} from '../client-model/game-projection'
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

/** Categories wholly blocked by other work, rather than individual locked items. */
export function developmentBlockers(state: GameState, body?: string) {
  const blocked = new Map<Page, string>()
  const view = state.view
  if (!view) return blocked
  const constructions = [
    ...view.constructions,
    ...view.bodies.flatMap((planet) => {
      const pending = pendingConstruction(state, planet.id)
      return pending ? [pending] : []
    }),
  ]
  if (
    view.protocol !== 2 &&
    constructions.some((work) => work.building === 'ResearchLab')
  )
    blocked.set(
      'research',
      'Blocked while a research lab is under construction',
    )
  const construction = constructions.find((work) => work.body === body)
  if (!construction) return blocked
  const page = catalogPage({ kind: 'Building', id: construction.building })
  blocked.set(
    page === 'resources' ? 'facilities' : 'resources',
    page === 'resources'
      ? 'Blocked while a resource building is under construction'
      : 'Blocked while a facility is under construction',
  )
  if (view.protocol !== 2 && construction.building === 'Shipyard') {
    const reason = 'Blocked while the shipyard is under construction'
    blocked.set('shipyard', reason)
    blocked.set('defense', reason)
  }
  return blocked
}
