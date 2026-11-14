import type { components } from '../contracts'
import { incomingMovements, outgoingMovements } from './fleet-movements'

export type FleetTrafficScope = 'all' | 'own' | 'other'
export type FleetTrafficRow =
  | { side: 'own'; movement: ReturnType<typeof outgoingMovements>[number] }
  | { side: 'other'; movement: ReturnType<typeof incomingMovements>[number] }

/** Only the viewer's supplied intelligence: own missions plus detected approaches.
 * Incoming contacts are presentation, never an addition to owned ship totals. */
export function fleetTrafficModel(
  view: components['schemas']['BoundView4'],
  scope: FleetTrafficScope,
  item: string | null = null,
) {
  const own = outgoingMovements(view, item)
  const other = item ? [] : incomingMovements(view)
  const rows: FleetTrafficRow[] = [
    ...(item || scope !== 'other'
      ? own.map((movement) => ({ side: 'own' as const, movement }))
      : []),
    ...(scope !== 'own'
      ? other.map((movement) => ({ side: 'other' as const, movement }))
      : []),
  ]
  rows.sort((a, b) => a.movement.arrival - b.movement.arrival)
  return { rows, otherCount: other.length }
}
