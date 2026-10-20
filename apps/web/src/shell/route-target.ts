import { linkOptions } from '@tanstack/react-router'
import type { Page } from './routes'
export function routeTarget(
  universe: string,
  page: Page,
  body?: string,
  item?: string,
) {
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
      return linkOptions({
        to: '/u/$universe/b/$body/resources',
        params: planetParams(),
        search: {},
      })
    case 'facilities':
      return linkOptions({
        to: '/u/$universe/b/$body/facilities',
        params: planetParams(),
        search: {},
      })
    case 'shipyard':
      return linkOptions({
        to: '/u/$universe/b/$body/shipyard',
        params: planetParams(),
        search: {},
      })
    case 'defense':
      return linkOptions({
        to: '/u/$universe/b/$body/defense',
        params: planetParams(),
        search: {},
      })
    case 'research':
      return linkOptions({ to: '/u/$universe/research', params, search })
    case 'settings':
      return linkOptions({ to: '/u/$universe/settings', params, search })
    case 'galaxy':
      return linkOptions({ to: '/u/$universe/galaxy', params, search })
    case 'dispatch':
      return linkOptions({ to: '/u/$universe/dispatch', params, search })
    case 'fleets':
      return item
        ? linkOptions({
            to: '/u/$universe/fleets/$item',
            params: { universe, item },
            search,
          })
        : linkOptions({ to: '/u/$universe/fleets', params, search })
    case 'reports':
      return item
        ? linkOptions({
            to: '/u/$universe/reports/$item',
            params: { universe, item },
            search,
          })
        : linkOptions({ to: '/u/$universe/reports', params, search })
  }
}
