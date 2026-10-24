import type { BoundView } from './commands'

/** Decode per-hour rates without applying stock limits or elapsed time. */
export function rawResourceRates(
  view: BoundView,
  body: BoundView['bodies'][number],
) {
  if ('production' in body) return body.production
  if (view.protocol === 2) return null
  const production = view.progression.production.find(
    (entry) => entry.body === body.id,
  )
  return production
    ? {
        ...production.gross_per_hour,
        deuterium: `${production.net_deuterium_per_hour.sign === 'Negative' ? '-' : ''}${production.net_deuterium_per_hour.magnitude}`,
      }
    : null
}
