import type { components } from '../../contracts'
type S = components['schemas']

/** Inspection stays available even when the catalog cannot offer construction. */
export function buildingUnavailableReason(
  entry: S['CatalogEntry3'] | undefined,
  body: S['BodyV3'],
  buildingId: string | undefined = entry?.key.id,
): string | undefined {
  if (entry && !entry.enabled) return 'Unavailable in this universe.'
  if (entry && !entry.body_kinds.includes(body.kind))
    return `Unavailable on this ${body.kind.toLowerCase()}.`
  if (body.levels[buildingId as keyof typeof body.levels] === undefined)
    return 'Building level unavailable on this body.'
  return undefined
}
