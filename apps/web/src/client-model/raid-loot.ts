/** Whole-unit five-pass allocation. Keep the order in sync with the engine. */
export function allocateRaidLoot(caps: readonly bigint[], capacity: bigint) {
  const remaining = [...caps]
  let free = capacity
  for (const [i, divisor] of [
    [0, 3n],
    [1, 2n],
    [2, 1n],
    [0, 2n],
    [1, 1n],
  ] as const) {
    const amount = remaining[i] < free / divisor ? remaining[i] : free / divisor
    remaining[i] -= amount
    free -= amount
  }
  return caps.map((cap, i) => cap - remaining[i])
}

/** The target caps are already plunderable loot, in whole units. */
export function requiredRaidCapacity(caps: readonly bigint[]) {
  const total = caps.reduce((sum, n) => sum + n, 0n)
  let low = total
  let high = total * 3n
  while (low < high) {
    const middle = (low + high) / 2n
    if (allocateRaidLoot(caps, middle).every((n, i) => n === caps[i])) {
      high = middle
    } else {
      low = middle + 1n
    }
  }
  return low
}
