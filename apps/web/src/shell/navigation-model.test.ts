import { expect, it } from 'vitest'
import {
  buildPages,
  fleetPages,
  navigationAnchor,
  navigationGroups,
} from './navigation-model'
it('keeps the same five anchor meanings across every implemented route', () => {
  expect(navigationAnchor('overview')).toBe('Empire')
  for (const page of buildPages) expect(navigationAnchor(page)).toBe('Develop')
  for (const page of ['dispatch', 'fleets'] as const)
    expect(navigationAnchor(page)).toBe('Fleets')
  for (const page of [
    'reports',
    'settings',
    'resource-settings',
    'high-scores',
    'alliance',
  ] as const)
    expect(navigationAnchor(page)).toBe('Menu')
  expect(navigationAnchor('galaxy')).toBe('Galaxy')
  expect(buildPages[0]).toBe('resources')
  expect(
    navigationGroups.find((group) => group.title === 'Develop')?.pages,
  ).toEqual(buildPages)
})
it('keeps Dispatch under Fleets and Galaxy independently accessible', () => {
  expect(fleetPages).toEqual(['fleets', 'dispatch'])
  expect(
    navigationGroups.find((group) => group.title === 'Fleet & intelligence')
      ?.pages,
  ).toEqual(['galaxy', 'fleets', 'dispatch', 'reports'])
  expect(
    navigationGroups.find((group) => group.title === 'Empire')?.pages,
  ).toEqual(['overview', 'resource-settings'])
})
it('places every real destination exactly once in the grouped menu', () => {
  const pages = navigationGroups.flatMap((group) => group.pages)
  expect(new Set(pages).size).toBe(pages.length)
  expect(pages.sort()).toEqual(
    [
      'overview',
      'resources',
      'resource-settings',
      'facilities',
      'research',
      'shipyard',
      'defense',
      'fleets',
      'dispatch',
      'galaxy',
      'reports',
      'settings',
      'high-scores',
      'alliance',
      'messages',
    ].sort(),
  )
})
