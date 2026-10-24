import type { components } from '../contracts'
import { resourceNames } from './resources'

/** Fill whole resource units proportionally, reserving fuel before loading. */
export function allDispatchCargo(
  available: components['schemas']['Resources'],
  maximumPayload: string,
  fuel: string,
): string[] {
  const amounts = resourceNames.map((resource) => {
    const balance =
      BigInt(available[resource]) -
      (resource === 'deuterium' ? BigInt(fuel) : 0n)
    return balance > 0n ? balance / 1000000n : 0n
  })
  const total = amounts.reduce((sum, amount) => sum + amount, 0n)
  const capacity = BigInt(maximumPayload) / 1000000n
  if (total <= capacity) return amounts.map(String)
  const loaded = amounts.map((amount) => (amount * capacity) / total)
  let remaining = capacity - loaded.reduce((sum, amount) => sum + amount, 0n)
  for (let i = 0; i < loaded.length && remaining > 0n; i++) {
    if (loaded[i] < amounts[i]) {
      loaded[i]++
      remaining--
    }
  }
  return loaded.map(String)
}
