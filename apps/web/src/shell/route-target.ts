import { universeSlug } from '../client-model/universe-name'
import { linkOptions } from '@tanstack/react-router'
import { catalogSlug } from './catalog-routes'
import type { Page } from './routes'
export function routeTarget(
  universeName: string,
  page: Page,
  body?: string,
  item?: string,
) {
  const universe = universeSlug(universeName)
  const params = { universe }
  const search = body ? { body } : {}
  const planetParams = () => {
    if (!body) throw new Error('Planet routes require a planet.')
    return { universe, body }
  }
  switch (page) {
    case 'overview':
      return body
        ? linkOptions({
            to: '/u/$universe/b/$body/overview',
            params: { universe, body },
            search: {},
          })
        : linkOptions({ to: '/u/$universe/overview', params, search: {} })
    case 'resources':
      return item
        ? linkOptions({
            to: '/u/$universe/b/$body/resources/$item',
            params: { ...planetParams(), item: catalogSlug(item) },
            search: {},
          })
        : linkOptions({
            to: '/u/$universe/b/$body/resources',
            params: planetParams(),
            search: {},
          })
    case 'resource-settings':
      return linkOptions({
        to: '/u/$universe/b/$body/resource-settings',
        params: planetParams(),
        search: {},
      })
    case 'facilities':
      return item
        ? linkOptions({
            to: '/u/$universe/b/$body/facilities/$item',
            params: { ...planetParams(), item: catalogSlug(item) },
            search: {},
          })
        : linkOptions({
            to: '/u/$universe/b/$body/facilities',
            params: planetParams(),
            search: {},
          })
    case 'research':
      return item
        ? linkOptions({
            to: '/u/$universe/b/$body/research/$item',
            params: { ...planetParams(), item: catalogSlug(item) },
            search: {},
          })
        : linkOptions({
            to: '/u/$universe/b/$body/research',
            params: planetParams(),
            search: {},
          })
    case 'shipyard':
      return item
        ? linkOptions({
            to: '/u/$universe/b/$body/shipyard/$item',
            params: { ...planetParams(), item: catalogSlug(item) },
            search: {},
          })
        : linkOptions({
            to: '/u/$universe/b/$body/shipyard',
            params: planetParams(),
            search: {},
          })
    case 'defense':
      return item
        ? linkOptions({
            to: '/u/$universe/b/$body/defense/$item',
            params: { ...planetParams(), item: catalogSlug(item) },
            search: {},
          })
        : linkOptions({
            to: '/u/$universe/b/$body/defense',
            params: planetParams(),
            search: {},
          })
    case 'fleets':
      return item
        ? linkOptions({
            to: '/u/$universe/b/$body/fleets/$item',
            params: { ...planetParams(), item: item },
            search: {},
          })
        : linkOptions({
            to: '/u/$universe/b/$body/fleets',
            params: planetParams(),
            search: {},
          })
    case 'galaxy':
      return linkOptions({
        to: '/u/$universe/b/$body/galaxy',
        params: planetParams(),
        search: {},
      })
    case 'dispatch':
      return linkOptions({
        to: '/u/$universe/b/$body/dispatch',
        params: planetParams(),
        search: {},
      })
    case 'settings':
      return linkOptions({ to: '/u/$universe/settings', params, search })
    case 'reports':
      return item
        ? linkOptions({
            to: '/u/$universe/b/$body/reports/$item',
            params: { ...planetParams(), item },
            search: {},
          })
        : linkOptions({
            to: '/u/$universe/b/$body/reports',
            params: planetParams(),
            search: {},
          })
  }
}
