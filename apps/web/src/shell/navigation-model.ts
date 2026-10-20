import type { Page } from './routes'

export const buildPages: Page[] = [
  'resources',
  'facilities',
  'research',
  'shipyard',
  'defense',
]
export const navigationGroups: { title: string; pages: Page[] }[] = [
  { title: 'World', pages: ['overview', 'galaxy'] },
  { title: 'Build', pages: buildPages },
  { title: 'Fleet & intelligence', pages: ['fleets', 'dispatch', 'reports'] },
  { title: 'Account', pages: ['settings'] },
]
export const pageTitles: Record<Page, string> = {
  overview: 'Overview',
  resources: 'Resources',
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
  if (page === 'overview') return 'World'
  if (buildPages.includes(page)) return 'Build'
  if (page === 'fleets' || page === 'dispatch') return 'Fleet'
  return 'Menu'
}
