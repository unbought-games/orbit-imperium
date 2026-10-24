import type { BoundView } from '../client-model/commands'
import { rawResourceRates } from '../client-model/production-rates'
import { resourceNames } from '../client-model/resources'

export function currentResourceRates(
  view: BoundView,
  body: BoundView['bodies'][number],
) {
  const rates = rawResourceRates(view, body)
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
