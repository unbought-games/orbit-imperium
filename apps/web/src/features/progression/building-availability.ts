import type { components } from '../../contracts'
type S = components['schemas']

// Retained rulesets tag these unimplemented placeholders as Planet. This is
// display classification only; enabled content still follows server metadata.
const moonOnlyPlaceholders = new Set(['LunarBase', 'SensorPhalanx', 'JumpGate'])

/** Inspection stays available even when the catalog cannot offer construction. */
export function buildingUnavailableReason(
  entry: S['CatalogEntry3'] | undefined,
  body: Pick<S['BodyV3'], 'kind' | 'levels'>,
  buildingId: string | undefined = entry?.key.id,
): string | undefined {
  if (entry && !entry.enabled) return 'Unavailable in this universe.'
  if (entry && !entry.body_kinds.includes(body.kind))
    return `Unavailable on this ${body.kind.toLowerCase()}.`
  if (body.levels[buildingId as keyof typeof body.levels] === undefined)
    return 'Building level unavailable on this body.'
  return undefined
}

export function visibleFacility(
  entry: S['CatalogEntry3'],
  body: Pick<S['BodyV3'], 'kind'>,
) {
  return !(
    body.kind === 'Planet' &&
    ((entry.body_kinds.length > 0 &&
      entry.body_kinds.every((kind) => kind === 'Moon')) ||
      (!entry.enabled &&
        entry.key.kind === 'Building' &&
        moonOnlyPlaceholders.has(entry.key.id)))
  )
}
