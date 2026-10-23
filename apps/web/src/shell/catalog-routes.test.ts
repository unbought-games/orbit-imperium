import { expect, it } from 'vitest'
import { catalogPage, catalogSlug, resolveCatalogItem } from './catalog-routes'
import { readyFixture } from '../test-support/bootstrap'
import type { BoundView } from '../client-model/commands'

it('uses readable stable item slugs and routes each catalog kind to its category', () => {
  expect(catalogSlug('ImpulseDrive')).toBe('impulse-drive')
  expect(catalogSlug('SmallShieldDome')).toBe('small-shield-dome')
  expect(catalogSlug('metal-mine')).toBe('metal-mine')
  for (const [key, page] of [
    [{ kind: 'Building', id: 'MetalMine' }, 'resources'],
    [{ kind: 'Building', id: 'ResearchLab' }, 'facilities'],
    [{ kind: 'Building', id: 'LunarBase' }, 'facilities'],
    [{ kind: 'Research', id: 'ImpulseDrive' }, 'research'],
    [{ kind: 'Ship', id: 'SolarSatellite' }, 'shipyard'],
    [{ kind: 'Defense', id: 'LightLaser' }, 'defense'],
  ] as const)
    expect(catalogPage(key)).toBe(page)
})
it('validates catalog identity and category without hiding disabled items', () => {
  const view = readyFixture(4).snapshot.view as BoundView
  view.catalog = [
    {
      key: { kind: 'Research', id: 'ImpulseDrive' },
      enabled: false,
      body_kinds: ['Planet'],
      requirements: [],
      mobile: false,
    },
  ]
  expect(resolveCatalogItem('research', 'impulse-drive', view)).toBe(
    'ImpulseDrive',
  )
  expect(resolveCatalogItem('resources', 'impulse-drive', view)).toBeNull()
  expect(resolveCatalogItem('research', 'invented-technology', view)).toBeNull()
  expect(resolveCatalogItem('resources', 'metal-mine', view)).toBe('MetalMine')
})
