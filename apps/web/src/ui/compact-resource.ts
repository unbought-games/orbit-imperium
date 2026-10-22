import { formatWholeNumber } from './whole-number'

const units = [
  [1_000_000_000_000n, 'T'],
  [1_000_000_000n, 'B'],
  [1_000_000n, 'M'],
  [1_000n, 'K'],
] as const
const scale = 1_000_000n

/** Floor compact stock displays without converting scaled balances to floats. */
export function formatCompactResource(value: string | bigint): string {
  const amount = BigInt(value)
  const whole =
    amount / scale - (amount < 0n && amount % scale !== 0n ? 1n : 0n)
  const magnitude = (whole < 0n ? -whole : whole) * scale
  const unit = units.find(([size]) => magnitude >= size * scale)
  if (!unit) return formatWholeNumber(amount, Number(scale))
  const [size, suffix] = unit
  const precision = magnitude >= size * scale * 10n ? 1n : 10n
  const numerator = amount * precision
  const denominator = size * scale
  const rounded =
    numerator / denominator -
    (numerator < 0n && numerator % denominator !== 0n ? 1n : 0n)
  const absolute = rounded < 0n ? -rounded : rounded
  const decimal = absolute % precision
  return `${rounded < 0n ? '-' : ''}${absolute / precision}${decimal ? `.${decimal}` : ''}${suffix}`
}
