import { expect, it } from 'vitest'
import {
  buildPages,
  fleetPages,
  navigationAnchor,
  navigationGroups,
} from './navigation-model'
it('keeps the same four anchor meanings across every implemented route', () => {
  expect(navigationAnchor('overview')).toBe('World')
  for (const page of buildPages) expect(navigationAnchor(page)).toBe('Build')
  for (const page of ['fleets', 'galaxy', 'dispatch'] as const)
    expect(navigationAnchor(page)).toBe('Fleet')
  for (const page of ['reports', 'settings'] as const)
    expect(navigationAnchor(page)).toBe('Menu')
  expect(buildPages[0]).toBe('resources')
})
it('places Galaxy between Fleets and Dispatch in the Fleet submenu and grouped menu', () => {
  expect(fleetPages).toEqual(['fleets', 'galaxy', 'dispatch'])
  expect(
    navigationGroups.find((group) => group.title === 'Fleet & intelligence')
      ?.pages,
  ).toEqual(['fleets', 'galaxy', 'dispatch', 'reports'])
  expect(
    navigationGroups.find((group) => group.title === 'World')?.pages,
  ).toEqual(['overview'])
})
it('places every real destination exactly once in the grouped menu', () => {
  const pages = navigationGroups.flatMap((group) => group.pages)
  expect(new Set(pages).size).toBe(pages.length)
  expect(pages.sort()).toEqual(
    [
      'overview',
      'resources',
      'facilities',
      'research',
      'shipyard',
      'defense',
      'fleets',
      'dispatch',
      'galaxy',
      'reports',
      'settings',
    ].sort(),
  )
})
