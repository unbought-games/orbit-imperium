import type { components } from '../contracts'
import { label } from '../ui/format'

const units = [
  [1_000_000_000_000n, 'T'],
  [1_000_000_000n, 'B'],
  [1_000_000n, 'M'],
  [1_000n, 'K'],
] as const

/** Keep one decimal without rounding up or losing precision in large fleets. */
function compactCount(count: bigint): string {
  const unit = units.find(([size]) => count >= size)
  if (!unit) return count.toString()
  const [size, suffix] = unit
  const tenths = (count * 10n) / size
  const decimal = tenths % 10n
  return `${tenths / 10n}${decimal ? `.${decimal}` : ''}${suffix}`
}

/** A single ship type identifies the fleet; mixed fleets only need a total. */
export function reportFleetSummary(
  ships: components['schemas']['PublicShip4'][],
): string {
  const present = ships.filter((ship) => BigInt(ship.count) > 0n)
  if (!present.length) return 'No ships'
  const count = present.reduce((sum, ship) => sum + BigInt(ship.count), 0n)
  const name = present.length === 1 ? label(present[0].ship_type) : 'ships'
  return `${compactCount(count)} ${name}`
}
