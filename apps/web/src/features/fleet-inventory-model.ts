import type { ProgressionProps } from './progression/shared'
import { unitCounts } from './progression/unit-counts'

export function fleetInventoryRows(
  view: ProgressionProps['view'],
  body: ProgressionProps['body'],
) {
  return view.catalog
    .filter((entry) => entry.key.kind === 'Ship')
    .map((entry) => ({ entry, counts: unitCounts(view, body, entry) }))
    .filter(
      ({ entry, counts }) =>
        BigInt(counts.stationed) > 0n ||
        BigInt(counts.ordered) > 0n ||
        // Older protocols cannot establish zero flying ships for every type.
        (counts.flying === null ? entry.mobile : BigInt(counts.flying) > 0n),
    )
}
