import type { Page } from './routes'

export const buildPages: Page[] = [
  'resources',
  'facilities',
  'research',
  'shipyard',
  'defense',
]
export const fleetPages: Page[] = ['fleets', 'dispatch']
export const navigationGroups = [
  { title: 'Community', pages: ['messages', 'alliance', 'high-scores'] },
  { title: 'Tools', pages: ['reports', 'combat-simulator'] },
  { title: 'Settings', pages: ['settings'] },
] satisfies { title: string; pages: Page[] }[]
export const pageTitles: Record<Page, string> = {
  menu: 'Menu',
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
  'combat-simulator': 'Combat Simulator',
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
