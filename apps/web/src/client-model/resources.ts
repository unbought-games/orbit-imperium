import type { components } from '../contracts'
type Resources = components['schemas']['Resources']
export const resourceNames = ['metal', 'crystal', 'deuterium'] as const

export function resourceShortfalls(cost: Resources, available: Resources) {
  return resourceNames
    .filter((name) => BigInt(available[name]) < BigInt(cost[name]))
    .map((name) => ({ name, required: cost[name], actual: available[name] }))
}

export function canAfford(cost: Resources, available: Resources) {
  return resourceNames.every(
    (name) => BigInt(available[name]) >= BigInt(cost[name]),
  )
}

export function canFundFleet(
  cargo: Resources,
  fuel: string,
  available: Resources,
) {
  return canAfford(
    {
      ...cargo,
      deuterium: (BigInt(cargo.deuterium) + BigInt(fuel)).toString(),
    },
    available,
  )
}
