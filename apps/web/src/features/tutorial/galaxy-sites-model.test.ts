import { expect, it } from 'vitest'
import { tutorialFixture } from '../../test-support/tutorial'
import {
  personalSiteStatus,
  siteDispatchDraft,
  siteLocation,
  sitesAtPosition,
} from './galaxy-sites-model'

it('groups private sites by their full coordinates and retains completed sites', () => {
  const data = tutorialFixture(true)
  const site = data.sites[0]
  const coordinates = site.site.destination.coordinates
  expect(sitesAtPosition(data, coordinates)).toContain(site)
  expect(
    sitesAtPosition(data, { ...coordinates, system: coordinates.system + 1 }),
  ).not.toContain(site)
  expect(sitesAtPosition(null, coordinates)).toEqual([])
  expect(siteLocation(site)).toEqual({
    ...coordinates,
    site: site.site.destination.selection.id,
  })
  expect(personalSiteStatus(site)).toBe('Completed')
  site.site.retired = false
  site.busy = true
  expect(personalSiteStatus(site)).toBe('Mission in progress')
  site.busy = false
  expect(personalSiteStatus(site)).toBe('Available')
})

it('prepares the exact private site and recommended ships without exposing unavailable attack actions', () => {
  const site = tutorialFixture(true).sites[0]
  site.site.retired = false
  site.busy = false
  expect(siteDispatchDraft(site, 'origin')).toEqual({
    origin: 'origin',
    mission: 'Attack',
    coordinates: site.site.destination.coordinates,
    target: { type: 'Site', selection: site.site.destination.selection },
    ships: Object.fromEntries(
      site.recommended_ships.map((ship) => [ship, '1']),
    ),
  })
  site.busy = true
  expect(siteDispatchDraft(site, 'origin')).toBeNull()
  site.busy = false
  site.site.retired = true
  expect(siteDispatchDraft(site, 'origin')).toBeNull()
})
