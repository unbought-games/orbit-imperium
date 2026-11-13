import type { components } from '../contracts'
import { resourceNames } from '../client-model/resources'
type S = components['schemas']

/** Match the engine's whole-unit, five-pass raid allocation; no combat prediction. */
export function observedLootPlan(resources: S['Resources']) {
  const caps = resourceNames.map((r) => BigInt(resources[r]) / 2000000n)
  const total = caps.reduce((sum, n) => sum + n, 0n)
  const fits = (capacity: bigint) => {
    const remaining = [...caps]
    let free = capacity
    for (const [i, divisor] of [
      [0, 3n],
      [1, 2n],
      [2, 1n],
      [0, 2n],
      [1, 1n],
    ] as const) {
      const amount =
        remaining[i] < free / divisor ? remaining[i] : free / divisor
      remaining[i] -= amount
      free -= amount
    }
    return remaining.every((n) => n === 0n)
  }
  let low = total,
    high = total * 3n
  while (low < high) {
    const middle = (low + high) / 2n
    if (fits(middle)) high = middle
    else low = middle + 1n
  }
  return {
    loot: Object.fromEntries(
      resourceNames.map((r, i) => [r, String(caps[i] * 1000000n)]),
    ) as S['Resources'],
    total,
    required: low,
  }
}

export function matchingResourceObservation(
  report: S['ReportHeader4'] | null,
  target: { id: string; owner: string; kind: 'Planet' | 'Moon' },
) {
  const preview = report?.preview
  return preview?.kind === 'Espionage' &&
    preview.target?.body === target.id &&
    preview.target.owner === target.owner &&
    preview.target.kind === target.kind &&
    preview.resources?.visibility === 'Known'
    ? { observedAt: report!.observed_at, resources: preview.resources.value }
    : null
}

export type DispatchLootRead = {
  model: object
  binding: string | null
  id: string
  report?: S['ReportHeader4'] | null
  error?: boolean
}

/** A failed refresh cannot erase historical evidence or borrow another source's. */
export function failedDispatchLootRead(
  previous: DispatchLootRead | null,
  source: Pick<DispatchLootRead, 'model' | 'binding' | 'id'>,
): DispatchLootRead {
  return {
    ...source,
    report:
      previous?.model === source.model &&
      previous.binding === source.binding &&
      previous.id === source.id
        ? previous.report
        : undefined,
    error: true,
  }
}
