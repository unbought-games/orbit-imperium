import type { components } from '../contracts'
import { dispatchQuantity } from './dispatch-validation'
import { resourceNames } from './resources'

type Resource = (typeof resourceNames)[number]

function cargoSpace(
  available: components['schemas']['Resources'],
  maximumPayload: string,
  fuel: string,
  current: string[],
) {
  const amounts = resourceNames.map((resource) => {
    const balance =
      BigInt(available[resource]) -
      (resource === 'deuterium' ? BigInt(fuel) : 0n)
    return balance > 0n ? balance / 1000000n : 0n
  })
  const loaded = resourceNames.map((_, i) =>
    BigInt(dispatchQuantity(current[i])),
  )
  const remaining =
    BigInt(maximumPayload) / 1000000n -
    loaded.reduce((sum, amount) => sum + amount, 0n)
  if (loaded.some((amount, i) => amount > amounts[i]))
    throw Error(
      'Entered cargo exceeds available resources after reserving fuel.',
    )
  if (remaining < 0n)
    throw Error('Entered cargo exceeds this fleet’s capacity.')
  return { amounts, loaded, remaining }
}

/** Preserve entered cargo and share spare space equally, redistributing shortages. */
export function allDispatchCargo(
  available: components['schemas']['Resources'],
  maximumPayload: string,
  fuel: string,
  current: string[] = [],
): string[] {
  const space = cargoSpace(available, maximumPayload, fuel, current)
  const { amounts, loaded } = space
  let { remaining } = space
  while (remaining > 0n) {
    const candidates = loaded.flatMap((amount, i) =>
      amount < amounts[i] ? [i] : [],
    )
    if (!candidates.length) break
    const share = remaining / BigInt(candidates.length)
    // Whole-unit remainders use the stable metal/crystal/deuterium order.
    for (const i of candidates) {
      const room = amounts[i] - loaded[i]
      const portion = share > 0n ? share : 1n
      const added = room < portion ? room : portion
      loaded[i] += added
      remaining -= added
      if (remaining === 0n) break
    }
  }
  return loaded.map(String)
}

/** Max one resource without changing other cargo or spending reserved fuel. */
export function maxDispatchCargo(
  available: components['schemas']['Resources'],
  maximumPayload: string,
  fuel: string,
  current: string[],
  resource: Resource,
): string[] {
  const index = resourceNames.indexOf(resource)
  const { amounts, loaded, remaining } = cargoSpace(
    available,
    maximumPayload,
    fuel,
    resourceNames.map((_, i) => (i === index ? '0' : current[i])),
  )
  loaded[index] = amounts[index] < remaining ? amounts[index] : remaining
  return loaded.map(String)
}
