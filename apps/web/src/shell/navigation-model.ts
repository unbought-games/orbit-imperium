import type { Page } from './routes'

export const buildPages: Page[] = [
  'resources',
  'facilities',
  'research',
  'shipyard',
  'defense',
]
export const fleetPages: Page[] = ['fleets', 'galaxy', 'dispatch']
export const navigationGroups: { title: string; pages: Page[] }[] = [
  { title: 'Empire', pages: ['overview', 'resource-settings'] },
  { title: 'Build', pages: buildPages },
  { title: 'Fleet & intelligence', pages: [...fleetPages, 'reports'] },
  { title: 'Account', pages: ['settings'] },
]
export const pageTitles: Record<Page, string> = {
  overview: 'Empire',
  resources: 'Resources',
  'resource-settings': 'Resource settings',
  facilities: 'Facilities',
  research: 'Research',
  shipyard: 'Shipyard',
  defense: 'Defense',
  fleets: 'Fleets',
  dispatch: 'Dispatch',
  galaxy: 'Galaxy',
  reports: 'Reports',
  settings: 'Settings',
}
export function navigationAnchor(page: Page) {
  if (page === 'overview') return 'Empire'
  if (buildPages.includes(page)) return 'Build'
  if (fleetPages.includes(page)) return 'Fleet'
  return 'Menu'
}
