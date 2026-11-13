import { compareShips } from './ship-order'
import type { ProgressionProps } from './progression/shared'
import { unitCounts } from './progression/unit-counts'

export type FleetInventoryScope = 'world' | 'empire'

export function fleetInventoryRows(
  view: ProgressionProps['view'],
  body: ProgressionProps['body'],
  scope: FleetInventoryScope = 'world',
) {
  return view.catalog
    .filter((entry) => entry.key.kind === 'Ship')
    .sort(compareShips)
    .map((entry) => {
      const counts =
        scope === 'world'
          ? unitCounts(view, body, entry)
          : empireUnitCounts(view, entry)
      return {
        entry,
        counts: {
          ...counts,
          total:
            counts.flying === null && entry.mobile
              ? null
              : (
                  BigInt(counts.stationed) + BigInt(counts.flying ?? '0')
                ).toString(),
        },
      }
    })
    .filter(
      ({ entry, counts }) =>
        BigInt(counts.stationed) > 0n ||
        BigInt(counts.ordered) > 0n ||
        // Older protocols cannot establish zero flying ships for every type.
        (counts.flying === null ? entry.mobile : BigInt(counts.flying) > 0n),
    )
}

/** One confirmed snapshot: inventory plus current manifests, never launch intents,
 * legacy fleet mirrors, incoming contacts, depot mirrors or pending overlays. */
function empireUnitCounts(
  view: ProgressionProps['view'],
  entry: ProgressionProps['view']['catalog'][number],
) {
  const stationed = view.bodies
    .flatMap((body) => body.inventories)
    .filter(
      (item) => item.item.kind === 'Ship' && item.item.id === entry.key.id,
    )
    .reduce((sum, item) => sum + BigInt(item.count), 0n)
    .toString()
  const ordered = view.progression.manufacturing
    .filter(
      (batch) => batch.item.kind === 'Ship' && batch.item.id === entry.key.id,
    )
    .reduce((sum, batch) => sum + BigInt(batch.remaining), 0n)
    .toString()
  const flying = !entry.mobile
    ? null
    : view.protocol === 4
      ? view.missions.fleets
          .flatMap((fleet) => fleet.ships)
          .filter((ship) => ship.ship_type === entry.key.id)
          .reduce((sum, ship) => sum + BigInt(ship.count), 0n)
          .toString()
      : entry.key.id === 'SmallCargo'
        ? view.fleets
            .filter((fleet) => fleet.status !== 'Completed')
            .flatMap((fleet) => fleet.ships)
            .reduce((sum, ship) => sum + BigInt(ship.count), 0n)
            .toString()
        : null
  return { stationed, ordered, flying }
}
