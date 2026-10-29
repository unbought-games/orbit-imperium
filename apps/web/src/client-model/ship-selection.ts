import type { components } from '../contracts'
type Inventory = components['schemas']['BodyV3']['inventories']

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
