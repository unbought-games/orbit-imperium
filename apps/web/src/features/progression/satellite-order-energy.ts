// The engine floors the percentage-adjusted output of the whole satellite
// stack in micro-energy. Earlier batches finish before the proposed order.
export function satelliteOrderEnergy(
  unitEnergy: string,
  percent: number,
  stationed: string,
  queued: string,
  quantity: string,
) {
  const before = BigInt(stationed) + BigInt(queued)
  const supply = (count: bigint) =>
    (BigInt(unitEnergy) * count * BigInt(percent)) / 100n
  return supply(before + BigInt(quantity)) - supply(before)
}

export function formatEnergyGain(microEnergy: bigint) {
  const whole = (microEnergy / 1000000n).toLocaleString('en-US')
  const fraction = (microEnergy % 1000000n)
    .toString()
    .padStart(6, '0')
    .replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : whole
}
