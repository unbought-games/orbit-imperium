export type NumericValue = number | bigint | string

/** Floor at the display boundary; keep scaled integer values exact. */
export function formatWholeNumber(value: NumericValue, divisor = 1): string {
  if (!Number.isSafeInteger(divisor) || divisor <= 0)
    throw new RangeError('The display divisor must be a positive safe integer')
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 'Unknown'
    const whole = Math.floor(value / divisor)
    return (whole === 0 ? 0 : whole).toLocaleString('en-US')
  }
  const amount = BigInt(value)
  const scale = BigInt(divisor)
  const whole =
    amount / scale - (amount < 0n && amount % scale !== 0n ? 1n : 0n)
  return whole.toLocaleString('en-US')
}
