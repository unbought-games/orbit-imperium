import type { components } from '../../contracts'
type S = components['schemas']
export type ShipEntry = S['CatalogEntry3']
export type Research = S['BoundView3']['research']
export type StatMode = 'base' | 'current'

/** Match engine integer arithmetic. Missing knowledge is never level zero. */
export function researchedValue(
  base: string | undefined,
  coefficient: string[] | undefined,
  level: number | undefined,
  exact = false,
): string | undefined {
  if (
    !base ||
    !/^\d+$/.test(base) ||
    !coefficient ||
    coefficient.length !== 2 ||
    !coefficient.every((v) => /^\d+$/.test(v)) ||
    level === undefined ||
    !Number.isSafeInteger(level) ||
    level < 0
  )
    return undefined
  const [n, d] = coefficient.map(BigInt)
  if (d === 0n) return undefined
  const value = BigInt(base) * (d + n * BigInt(level))
  if (exact && value % d !== 0n) return undefined
  return String(value / d)
}

export function comparisonStats(
  entry: ShipEntry,
  research: Research,
  mode: StatMode,
) {
  const stats = entry.enabled ? entry.ship_statistics : undefined
  const p = stats?.propulsion
  const c = stats?.combat
  const level = (id: string) => research.find((r) => r.research === id)?.level
  const impulse = level('ImpulseDrive')
  const knownProfile =
    mode === 'base' || !p?.impulse_upgrade || impulse !== undefined
  const upgraded =
    mode === 'current' &&
    p?.impulse_upgrade &&
    impulse !== undefined &&
    impulse >= p.impulse_upgrade.minimum_level
  const profile = upgraded ? p.impulse_upgrade : p
  const drive = knownProfile
    ? upgraded
      ? 'ImpulseDrive'
      : p?.drive
    : undefined
  return {
    stationary: entry.key.id === 'SolarSatellite' && !entry.mobile,
    cost: stats?.cost,
    cargo: p?.cargo_capacity,
    drive,
    speed:
      mode === 'base'
        ? p?.base_speed
        : knownProfile
          ? researchedValue(
              profile?.base_speed,
              profile?.drive_coefficient,
              drive ? level(drive) : undefined,
            )
          : undefined,
    fuel: knownProfile ? profile?.fuel_consumption : undefined,
    attack:
      mode === 'base'
        ? c?.attack_ticks
        : researchedValue(
            c?.attack_ticks,
            c?.technology_bonus,
            level('WeaponsTechnology'),
            true,
          ),
    shield:
      mode === 'base'
        ? c?.shield_ticks
        : researchedValue(
            c?.shield_ticks,
            c?.technology_bonus,
            level('ShieldingTechnology'),
            true,
          ),
    hull:
      mode === 'base'
        ? c?.hull_ticks
        : researchedValue(
            c?.hull_ticks,
            c?.technology_bonus,
            level('ArmourTechnology'),
            true,
          ),
    against: c?.rapid_fire_against,
    from: c?.rapid_fire_from,
  }
}
