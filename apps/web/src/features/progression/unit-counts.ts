import type { ProgressionProps } from './shared'
import type { components } from '../../contracts'
/** Confirmed counts only. Pending orders retain their own status in the shared queue. */
export function unitCounts(
  view: ProgressionProps['view'],
  body: ProgressionProps['body'],
  entry: components['schemas']['CatalogEntry3'],
) {
  const same = (item: { kind: string; id: string }) =>
    item.kind === entry.key.kind && item.id === entry.key.id
  const stationed = body.inventories.find((x) => same(x.item))?.count ?? '0'
  const ordered = view.progression.manufacturing
    .filter((x) => x.body === body.id && same(x.item))
    .reduce((sum, x) => sum + BigInt(x.remaining), 0n)
    .toString()
  // Protocol 3 exposes only legacy cargo manifests, not every ship type.
  const flying =
    entry.key.kind !== 'Ship' || !entry.mobile
      ? null
      : view.protocol === 4
        ? view.missions.fleets
            .filter((x) => x.intent.origin === body.id)
            .flatMap((x) => x.ships)
            .filter((x) => x.ship_type === entry.key.id)
            .reduce((sum, x) => sum + BigInt(x.count), 0n)
            .toString()
        : entry.key.id === 'SmallCargo'
          ? view.fleets
              .filter((x) => x.origin === body.id && x.status !== 'Completed')
              .flatMap((x) => x.ships)
              .reduce((sum, x) => sum + BigInt(x.count), 0n)
              .toString()
          : null
  return { stationed, ordered, flying }
}
