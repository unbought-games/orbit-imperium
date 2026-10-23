import type { components } from '../contracts'
import type { BoundView } from '../client-model/commands'
import type { Page } from './routes'

type Key = components['schemas']['CatalogKey3']
export const catalogPages: Page[] = [
  'resources',
  'facilities',
  'research',
  'shipyard',
  'defense',
]
const resources = [
  'MetalMine',
  'CrystalMine',
  'DeuteriumSynthesizer',
  'SolarPlant',
  'FusionReactor',
  'MetalStorage',
  'CrystalStorage',
  'DeuteriumTank',
]

export function catalogSlug(id: string) {
  return id.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}
export function catalogPage(key: Key): Page {
  if (key.kind === 'Research') return 'research'
  if (key.kind === 'Ship') return 'shipyard'
  if (key.kind === 'Defense') return 'defense'
  return resources.includes(key.id) ? 'resources' : 'facilities'
}
/** Resolve only known catalog identities, including disabled entries. */
export function resolveCatalogItem(
  page: Page,
  slug: string,
  view: BoundView,
): string | null {
  const key = view.catalog.find(
    (entry) =>
      catalogPage(entry.key) === page && catalogSlug(entry.key.id) === slug,
  )?.key
  if (key) return key.id
  // Resource catalogs also expose unavailable buildings for inspection in older worlds.
  if (page === 'resources')
    return (
      [...resources, 'SolarSatellite'].find((id) => catalogSlug(id) === slug) ??
      null
    )
  return null
}
