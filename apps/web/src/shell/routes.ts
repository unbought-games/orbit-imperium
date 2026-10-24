import { catalogPages, resolveCatalogItem } from './catalog-routes'
import { universeSlug } from '../client-model/universe-name'
import type { BoundView } from '../client-model/commands'
export type Page =
  | 'overview'
  | 'resources'
  | 'resource-settings'
  | 'facilities'
  | 'research'
  | 'shipyard'
  | 'defense'
  | 'settings'
  | 'fleets'
  | 'dispatch'
  | 'reports'
  | 'galaxy'
  | 'high-scores'
export type Destination = {
  universe?: string
  page: Page | null
  body?: string
  item?: string
}
export type Route = {
  page: Page
  body: string | null
  item: string | null
  available: boolean
  reason: string
}
export const bodyPages: Page[] = [
  'overview',
  'resources',
  'resource-settings',
  'facilities',
  'shipyard',
  'defense',
  'research',
  'fleets',
  'galaxy',
  'dispatch',
  'reports',
]
export function validateBodySearch(search: Record<string, unknown>): {
  body?: string
} {
  if (search.body === undefined) return {}
  if (typeof search.body !== 'string' || !search.body.trim())
    throw new Error('This address contains an invalid funding planet.')
  return { body: search.body }
}
// These are domain checks against confirmed state. TanStack owns URL matching.
export function resolveDestination(
  destination: Destination,
  view: BoundView,
): Route {
  const unavailable = (reason: string): Route => ({
    page: 'overview',
    body: null,
    item: null,
    available: false,
    reason,
  })
  if (destination.universe !== view.binding.universe)
    return unavailable(
      'This universe is unavailable. Choose your current universe below.',
    )
  const { page, item } = destination
  if (!page)
    return unavailable('This destination is not available in this universe.')
  if (!destination.body && bodyPages.includes(page) && page !== 'overview')
    return unavailable('This destination requires an accessible planet.')
  const body = destination.body ?? view.bodies[0]?.id ?? null
  if (destination.body && !view.bodies.some((b) => b.id === destination.body))
    return unavailable(
      'Planet unavailable. This address does not identify a planet you can access.',
    )
  if (page === 'high-scores' && view.protocol !== 4)
    return unavailable('High Scores are unavailable in this universe.')
  if (page === 'facilities' && view.protocol === 2)
    return unavailable('This destination requires supported facilities.')
  if (
    page === 'resource-settings' &&
    (view.protocol === 2 ||
      !view.progression.production.some((entry) => entry.body === body))
  )
    return unavailable('Resource settings are unavailable for this planet.')
  const capability =
    page === 'galaxy'
      ? 'Galaxy'
      : page === 'research'
        ? 'Research'
        : ['shipyard', 'defense'].includes(page)
          ? 'Manufacturing'
          : ['fleets', 'dispatch', 'reports'].includes(page)
            ? 'Transport'
            : null
  if (
    capability &&
    !view.capabilities.some((c) => c.capability === capability && c.enabled)
  )
    return unavailable('This destination is not available in this universe.')
  const catalogItem =
    item && catalogPages.includes(page)
      ? resolveCatalogItem(page, item, view)
      : null
  if (item && catalogPages.includes(page) && !catalogItem)
    return unavailable('This catalog item is unavailable in this universe.')
  if (
    item &&
    !catalogPages.includes(page) &&
    !(view.protocol === 4
      ? page === 'reports'
        ? /^[0-9a-f-]{36}$/.test(item)
        : view.missions.fleets.some((f) => f.id === item)
      : (page === 'fleets' ? view.fleets : view.reports).some(
          (x) => x.id === item,
        ))
  )
    return unavailable(
      'This item is unavailable or outside the current authorized view.',
    )
  if (!body && page !== 'settings' && page !== 'high-scores')
    return unavailable('No planet is available for this membership.')
  return {
    page,
    body,
    item: catalogItem ?? item ?? null,
    available: true,
    reason: '',
  }
}

// Browser identity is a current name only; UUID and former-name URLs are invalid.
export function resolveNamedDestination(
  destination: Destination,
  view: BoundView,
  universeName: string,
): Route {
  return resolveDestination(
    {
      ...destination,
      universe:
        destination.universe === universeSlug(universeName)
          ? view.binding.universe
          : undefined,
    },
    view,
  )
}
