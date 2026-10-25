import { expect, it } from 'vitest'
import {
  buildPages,
  fleetPages,
  navigationAnchor,
  navigationGroups,
} from './navigation-model'
it('keeps the same four anchor meanings across every implemented route', () => {
  expect(navigationAnchor('overview')).toBe('Empire')
  for (const page of buildPages) expect(navigationAnchor(page)).toBe('Build')
  for (const page of ['galaxy', 'dispatch', 'fleets'] as const)
    expect(navigationAnchor(page)).toBe('Fleet')
  for (const page of [
    'reports',
    'settings',
    'resource-settings',
    'high-scores',
    'alliance',
  ] as const)
    expect(navigationAnchor(page)).toBe('Menu')
  expect(buildPages[0]).toBe('resources')
})
it('orders Fleet destinations as Galaxy, Dispatch, Fleets in the submenu and grouped menu', () => {
  expect(fleetPages).toEqual(['galaxy', 'dispatch', 'fleets'])
  expect(
    navigationGroups.find((group) => group.title === 'Fleet & intelligence')
      ?.pages,
  ).toEqual(['galaxy', 'dispatch', 'fleets', 'reports'])
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
    ].sort(),
  )
})
