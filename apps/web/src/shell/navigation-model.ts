import type { Page } from './routes'

export const buildPages: Page[] = [
  'resources',
  'facilities',
  'research',
  'shipyard',
  'defense',
]
export const fleetPages: Page[] = ['fleets', 'dispatch']
export const navigationGroups: { title: string; pages: Page[] }[] = [
  { title: 'Empire', pages: ['overview', 'resource-settings'] },
  { title: 'Develop', pages: buildPages },
  {
    title: 'Fleet & intelligence',
    pages: ['galaxy', ...fleetPages, 'reports'],
  },
  { title: 'Community', pages: ['high-scores', 'alliance', 'messages'] },
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
  'high-scores': 'High Scores',
  alliance: 'Alliance',
  messages: 'Messages',
}
export function navigationAnchor(page: Page) {
  if (page === 'overview') return 'Empire'
  if (page === 'resource-settings' || buildPages.includes(page))
    return 'Develop'
  if (page === 'galaxy') return 'Galaxy'
  if (fleetPages.includes(page)) return 'Fleets'
  return 'Menu'
}
