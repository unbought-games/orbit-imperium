export function resourceDecision(cost: string, available: string) {
  const after = BigInt(available) - BigInt(cost)
  return {
    after: after.toString(),
    shortfall: after < 0n ? (-after).toString() : null,
  }
}
