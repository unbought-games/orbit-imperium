import type { components } from '../contracts'
import { dispatchQuantity } from './dispatch-validation'
type Inventory = components['schemas']['BodyV3']['inventories']

export function dispatchableShipTypes(
  catalog: components['schemas']['CatalogEntry3'][],
  inventories: Inventory,
) {
  return catalog.flatMap((entry) =>
    entry.key.kind === 'Ship' &&
    entry.mobile &&
    (entry.enabled ||
      inventories.some(
        (stack) =>
          stack.item.kind === 'Ship' &&
          stack.item.id === entry.key.id &&
          BigInt(stack.count) > 0n,
      ))
      ? [entry.key.id]
      : [],
  )
}

/** The dispatchable type list excludes stationary ships; keep exact counts. */
export function availableDispatchShips(
  types: readonly string[],
  inventories: Inventory,
): Record<string, string> {
  return Object.fromEntries(
    types.map((id) => [
      id,
      inventories.find(
        (stack) => stack.item.kind === 'Ship' && stack.item.id === id,
      )?.count ?? '0',
    ]),
  )
}

/** Keep edited counts visible if availability changes, including invalid edits. */
export function dispatchShipVisible(
  available: string,
  selected?: string,
): boolean {
  if (BigInt(available) > 0n) return true
  try {
    return dispatchQuantity(selected) !== '0'
  } catch {
    return true
  }
}
