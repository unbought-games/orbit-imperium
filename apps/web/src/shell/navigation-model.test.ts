import { expect, it } from 'vitest'
import {
  buildPages,
  fleetPages,
  navigationAnchor,
  navigationGroups,
} from './navigation-model'

it('keeps primary destinations and their details under the same mobile tabs', () => {
  expect(navigationAnchor('overview')).toBe('Empire')
  expect(navigationAnchor('briefing')).toBe('Menu')
  for (const page of [...buildPages, 'resource-settings'] as const)
    expect(navigationAnchor(page)).toBe('Develop')
  for (const page of fleetPages) expect(navigationAnchor(page)).toBe('Fleets')
  expect(navigationAnchor('galaxy')).toBe('Galaxy')
  expect(navigationAnchor('menu')).toBe('Menu')
  for (const page of navigationGroups.flatMap((group) => group.pages))
    expect(navigationAnchor(page)).toBe('Menu')
})

it('keeps secondary destinations discoverable without repeating primary navigation', () => {
  expect(navigationGroups).toEqual([
    { title: 'Community', pages: ['messages', 'alliance', 'high-scores'] },
    { title: 'Tools', pages: ['reports', 'combat-simulator'] },
    { title: 'Settings', pages: ['settings'] },
  ])
  const pages = navigationGroups.flatMap((group) => group.pages)
  expect(new Set(pages).size).toBe(pages.length)
  for (const page of [
    'overview',
    ...buildPages,
    ...fleetPages,
    'resource-settings',
    'galaxy',
    'menu',
  ])
    expect(pages).not.toContain(page)
})
