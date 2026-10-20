import type { BoundView } from '../client-model/commands'
import { resourceNames } from '../client-model/resources'

export function currentResourceRates(
  view: BoundView,
  body: BoundView['bodies'][number],
) {
  const production =
    view.protocol !== 2
      ? view.progression.production.find((entry) => entry.body === body.id)
      : null
  const rates = production
    ? {
        ...production.gross_per_hour,
        deuterium: `${production.net_deuterium_per_hour.sign === 'Negative' ? '-' : ''}${production.net_deuterium_per_hour.magnitude}`,
      }
    : 'production' in body
      ? body.production
      : null
  if (!rates) return null
  return Object.fromEntries(
    resourceNames.map((name) => {
      const rate = BigInt(rates[name])
      const amount = BigInt(body.amounts[name])
      return [
        name,
        (rate > 0n && amount >= BigInt(body.capacity[name])) ||
        (rate < 0n && amount === 0n)
          ? '0'
          : rate.toString(),
      ]
    }),
  ) as typeof rates
}
