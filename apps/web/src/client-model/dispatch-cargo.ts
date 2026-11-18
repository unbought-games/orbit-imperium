import type { components } from '../contracts'
import { dispatchQuantity } from './dispatch-validation'
import { resourceNames } from './resources'

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

type S = components['schemas']
type Fill = S['FleetCargoFill4']
type Space = Pick<S['FleetEstimate4'], 'fuel' | 'maximum_payload'>
const kinds = ['Metal', 'Crystal', 'Deuterium'] as const

export type CargoDraft = { entered: string[]; groups: Fill['groups'] }
export const emptyCargoDraft = (): CargoDraft => ({
  entered: ['0', '0', '0'],
  groups: [],
})

export function editDispatchCargo(
  draft: CargoDraft,
  index: number,
  value: string,
): CargoDraft {
  return {
    entered: draft.entered.map((old, i) => (i === index ? value : old)),
    groups: draft.groups
      .map((group) => group.filter((kind) => kind !== kinds[index]))
      .filter((group) => group.length),
  }
}

export function selectDispatchCargo(
  draft: CargoDraft,
  fill: Resource | 'all',
): CargoDraft {
  if (fill === 'all') {
    const remaining = kinds.filter(
      (kind) => !draft.groups.some((group) => group.includes(kind)),
    )
    return remaining.length
      ? { ...draft, groups: [...draft.groups, remaining] }
      : draft
  }
  const index = resourceNames.indexOf(fill)
  // An already-maximized resource keeps its place in the player's allocation.
  if (
    draft.groups.some((group) => group.includes(kinds[index])) &&
    dispatchQuantity(draft.entered[index]) === '0'
  )
    return draft
  const next = editDispatchCargo(draft, index, '0')
  return { ...next, groups: [...next.groups, [kinds[index]]] }
}

export function cargoAmounts(values: string[]): S['Resources'] {
  const micro = (i: number) =>
    String(BigInt(dispatchQuantity(values[i])) * 1000000n)
  return { metal: micro(0), crystal: micro(1), deuterium: micro(2) }
}

export function cargoInstruction(draft: CargoDraft): Fill | undefined {
  return draft.groups.length
    ? { minimum: cargoAmounts(draft.entered), groups: draft.groups }
    : undefined
}

export function projectDispatchCargo(
  draft: CargoDraft,
  available: S['Resources'],
  terms: Space,
): string[] {
  const amounts = resourceNames.map((resource) => {
    const balance =
      BigInt(available[resource]) -
      (resource === 'deuterium' ? BigInt(terms.fuel) : 0n)
    return balance > 0n ? balance / 1000000n : 0n
  })
  const loaded = resourceNames.map((_, i) =>
    BigInt(dispatchQuantity(draft.entered[i])),
  )
  if (loaded.some((n, i) => n > amounts[i]))
    throw Error(
      'Entered cargo exceeds available resources after reserving fuel.',
    )
  let remaining =
    BigInt(terms.maximum_payload) / 1000000n -
    loaded.reduce((a, b) => a + b, 0n)
  if (remaining < 0n)
    throw Error('Entered cargo exceeds this fleet’s capacity.')
  for (const group of draft.groups) {
    const indices = group.map((kind) => kinds.indexOf(kind))
    while (remaining > 0n) {
      const candidates = indices.filter((i) => loaded[i] < amounts[i])
      if (!candidates.length) break
      const share = remaining / BigInt(candidates.length) || 1n
      for (const i of candidates) {
        const room = amounts[i] - loaded[i]
        const added = room < share ? room : share
        loaded[i] += added
        remaining -= added
        if (remaining === 0n) break
      }
    }
  }
  return loaded.map(String)
}

// Preserve unfinished text even when it prevents projecting the other fields.
export function displayedCargo(
  draft: CargoDraft,
  available: S['Resources'],
  terms?: Space,
) {
  if (!draft.groups.length || !terms) return draft.entered
  try {
    const filled = projectDispatchCargo(draft, available, terms)
    return draft.entered.map((text, i) =>
      draft.groups.some((group) => group.includes(kinds[i])) ? filled[i] : text,
    )
  } catch {
    return draft.entered
  }
}

export function materialCargoChanges(
  before: S['Resources'],
  after: S['Resources'],
) {
  return resourceNames.filter((resource) => {
    const old = BigInt(before[resource]),
      next = BigInt(after[resource])
    return old !== next && (old > next ? old - next : next - old) * 10n >= old
  })
}

export function matchesCargoInstruction(fill: Fill, loaded: S['Resources']) {
  return resourceNames.every((name, i) => {
    const fixed = BigInt(fill.minimum[name]),
      actual = BigInt(loaded[name])
    return fill.groups.some((group) => group.includes(kinds[i]))
      ? actual >= fixed
      : actual === fixed
  })
}
