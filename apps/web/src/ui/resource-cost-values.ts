/** Exact micro-resource formatting for decisions, without a Number conversion. */
export function exactResource(value: string) {
  const amount = BigInt(value)
  const magnitude = amount < 0n ? -amount : amount
  const fraction = (magnitude % 1000000n)
    .toString()
    .padStart(6, '0')
    .replace(/0+$/, '')
  return `${amount < 0n ? '−' : ''}${(magnitude / 1000000n).toLocaleString('en-US')}${fraction ? `.${fraction}` : ''}`
}

export function resourceDecision(cost: string, available: string) {
  const after = BigInt(available) - BigInt(cost)
  return {
    after: after.toString(),
    shortfall: after < 0n ? (-after).toString() : null,
  }
}
