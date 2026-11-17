import type { components } from '../../contracts'
import { sameBinding } from '../../client-model/commands'
import type {
  ShipAppearanceState,
  ShipEquipment,
} from '../../client-model/ship-appearance-types'
import { resolveCatalogArt, type Artwork } from '../../ui/artwork'

type Binding = components['schemas']['Binding']
type CatalogKey = components['schemas']['CatalogKey3']

/** A design library is account-owned; equipped artwork belongs to this empire. */
export function shipAppearancesForOwner(
  snapshot: ShipAppearanceState | null,
  binding: Binding,
): ShipAppearanceState | null {
  return snapshot && sameBinding(snapshot.binding, binding) ? snapshot : null
}

export function canCustomizeShip(
  snapshot: ShipAppearanceState | null,
  target: string,
): boolean {
  return !!snapshot?.catalog.some(
    (skin) => skin.target === target && skin.available,
  )
}

/** The server supplies usable display artwork, even during a replacement render. */
export function resolveShipAppearanceArt(
  key: CatalogKey,
  equipment: readonly ShipEquipment[] | null | undefined,
): Artwork {
  const fallback = resolveCatalogArt(key)
  if (key.kind !== 'Ship') return fallback
  const artwork = equipment?.find((item) => item.target === key.id)?.artwork
  if (!artwork) return fallback
  const variants = artwork.variants
    .filter(
      (variant) =>
        variant.url &&
        Number.isFinite(variant.width) &&
        Number.isFinite(variant.height) &&
        variant.width > 0 &&
        variant.height > 0,
    )
    .sort((a, b) => a.width - b.width)
  const largest = variants.at(-1)
  if (!largest) return fallback
  return {
    key: `ship-appearance:${artwork.id}`,
    src: largest.url,
    srcSet: variants
      .map((variant) => `${variant.url} ${variant.width}w`)
      .join(', '),
    thumbnail: variants[0].url,
    width: largest.width,
    height: largest.height,
  }
}
