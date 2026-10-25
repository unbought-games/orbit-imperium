import type { components } from '../../contracts'

type Entry = components['schemas']['CatalogEntry3']

/** Exact percentage formatting, including custom rules with nonterminating ratios. */
export function bonusPercent(fraction: string[], level = 1): string {
  const [numerator, denominator] = fraction
  if (
    !/^\d+$/.test(numerator ?? '') ||
    !/^[1-9]\d*$/.test(denominator ?? '') ||
    !Number.isSafeInteger(level) ||
    level < 0
  )
    return 'Unavailable'
  const n = BigInt(numerator) * 100n * BigInt(level)
  const d = BigInt(denominator)
  if (n % d === 0n) return `${n / d}%`
  if ((n * 100n) % d === 0n) {
    const scaled = (n * 100n) / d
    return `${scaled / 100n}.${String(scaled % 100n)
      .padStart(2, '0')
      .replace(/0$/, '')}%`
  }
  return `${n}/${d}%`
}

export function technicalUnlocks(
  entry: Entry,
  catalog: Entry[],
  bodyKind: string,
) {
  return catalog
    .flatMap((candidate) => {
      if (
        !candidate.enabled ||
        !candidate.body_kinds.includes(bodyKind as 'Planet' | 'Moon')
      )
        return []
      const requirement = candidate.requirements.find((requirement) =>
        requirement.type === 'BodyBuilding'
          ? entry.key.kind === 'Building' &&
            requirement.building === entry.key.id
          : entry.key.kind === 'Research' &&
            requirement.research === entry.key.id,
      )
      return requirement ? [{ entry: candidate, level: requirement.level }] : []
    })
    .sort(
      (a, b) =>
        a.level - b.level || a.entry.key.id.localeCompare(b.entry.key.id),
    )
}

export function storageResource(entry: Entry) {
  if (entry.key.kind !== 'Building') return null
  switch (entry.key.id) {
    case 'MetalStorage':
      return 'metal'
    case 'CrystalStorage':
      return 'crystal'
    case 'DeuteriumTank':
      return 'deuterium'
    default:
      return null
  }
}
