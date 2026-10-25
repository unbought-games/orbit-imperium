/** Preserve sub-point combat values (including probes) and large exact integers. */
export function formatCombatStat(ticks: string): string {
  const value = BigInt(ticks)
  const whole = (value / 100000n).toLocaleString('en-US')
  const fraction = (value % 100000n)
    .toString()
    .padStart(5, '0')
    .replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : whole
}
