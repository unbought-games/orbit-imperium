import type { components } from '../contracts'
import { dispatchQuantity } from './dispatch-validation'
import { rawResourceRates } from './production-rates'
import { resourceNames } from './resources'

type S = components['schemas']

export function dispatchCargoOrigin(view: S['BoundView4'], id: string) {
  const body = view.bodies.find((body) => body.id === id)
  if (!body) return
  const rate = BigInt(rawResourceRates(view, body)?.deuterium ?? '0')
  // Keep one minute of net consumption on the planet during review and launch.
  const reviewReserve = rate < 0n ? (-rate + 59n) / 60n : 0n
  return { amounts: body.amounts, reviewReserve }
}

type Resource = (typeof resourceNames)[number]

/** Advisory whole-unit space from the current server estimate, never ship rules. */
export function dispatchCargoCapacity(
  terms:
    | Pick<
        components['schemas']['FleetEstimate4'],
        'capacity' | 'maximum_payload'
      >
    | undefined,
  current: string[],
) {
  if (!terms) return null
  const capacity = BigInt(terms.capacity) / 1000000n
  const payload = BigInt(terms.maximum_payload) / 1000000n
  let loaded: bigint
  try {
    loaded = resourceNames.reduce(
      (sum, _, i) => sum + BigInt(dispatchQuantity(current[i])),
      0n,
    )
  } catch {
    return { capacity, payload, loaded: null, remaining: null }
  }
  return { capacity, payload, loaded, remaining: payload - loaded }
}

function cargoSpace(
  available: components['schemas']['Resources'],
  maximumPayload: string,
  fuel: string,
  current: string[],
  reviewReserve: bigint,
) {
  const balances = resourceNames.map((resource) => {
    const balance =
      BigInt(available[resource]) -
      (resource === 'deuterium' ? BigInt(fuel) : 0n)
    return balance > 0n ? balance : 0n
  })
  const loaded = resourceNames.map((_, i) =>
    BigInt(dispatchQuantity(current[i])),
  )
  const remaining =
    BigInt(maximumPayload) / 1000000n -
    loaded.reduce((sum, amount) => sum + amount, 0n)
  if (loaded.some((amount, i) => amount * 1000000n > balances[i]))
    throw Error(
      'Entered cargo exceeds available resources after reserving fuel.',
    )
  if (remaining < 0n)
    throw Error('Entered cargo exceeds this fleet’s capacity.')
  const amounts = balances.map((balance, i) => {
    if (resourceNames[i] !== 'deuterium') return balance / 1000000n
    const afterReserve = (balance - reviewReserve) / 1000000n
    // A manual entry may use the reserve. Auto-fill only adds to it.
    return afterReserve > loaded[i] ? afterReserve : loaded[i]
  })
  return { amounts, loaded, remaining }
}

/** Preserve entered cargo and share spare space equally, redistributing shortages. */
export function allDispatchCargo(
  available: components['schemas']['Resources'],
  maximumPayload: string,
  fuel: string,
  current: string[] = [],
  reviewReserve = 0n,
): string[] {
  const space = cargoSpace(
    available,
    maximumPayload,
    fuel,
    current,
    reviewReserve,
  )
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
  reviewReserve = 0n,
): string[] {
  const index = resourceNames.indexOf(resource)
  const { amounts, loaded, remaining } = cargoSpace(
    available,
    maximumPayload,
    fuel,
    resourceNames.map((_, i) => (i === index ? '0' : current[i])),
    reviewReserve,
  )
  loaded[index] = amounts[index] < remaining ? amounts[index] : remaining
  return loaded.map(String)
}
