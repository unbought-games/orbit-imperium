export function resourceDecision(cost: string, available: string) {
  const after = BigInt(available) - BigInt(cost)
  return {
    after: after.toString(),
    shortfall: after < 0n ? (-after).toString() : null,
  }
}

export function resourceShortfalls(
  cost: Record<'metal' | 'crystal' | 'deuterium', string>,
  available: Record<'metal' | 'crystal' | 'deuterium', string>,
) {
  return (['metal', 'crystal', 'deuterium'] as const).flatMap((resource) => {
    const { shortfall } = resourceDecision(cost[resource], available[resource])
    return shortfall === null ? [] : [{ resource, amount: shortfall }]
  })
}
