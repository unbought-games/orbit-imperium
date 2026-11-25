import type { components } from '../contracts'
import {
  allocateRaidLoot,
  requiredRaidCapacity,
} from '../client-model/raid-loot'
import { resourceNames } from '../client-model/resources'
type S = components['schemas']

export function observedLootPlan(
  resources: S['Resources'],
  freeCapacity?: bigint | null,
) {
  const caps = resourceNames.map((r) => BigInt(resources[r]) / 2000000n)
  const total = caps.reduce((sum, n) => sum + n, 0n)
  const capacity =
    freeCapacity == null ? null : freeCapacity < 0n ? 0n : freeCapacity
  const required = requiredRaidCapacity(caps)
  return {
    loot: Object.fromEntries(
      resourceNames.map((r, i) => [r, String(caps[i] * 1000000n)]),
    ) as S['Resources'],
    total,
    required,
    capacity,
    shortfall:
      capacity !== null && capacity < required ? required - capacity : null,
    carried:
      capacity === null
        ? null
        : allocateRaidLoot(caps, capacity).reduce((sum, n) => sum + n, 0n),
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
