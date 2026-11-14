import { readFileSync } from 'node:fs'
import { test, expect } from './fixtures/test'
import { installGameFixture, body, id } from './fixtures/game'
import { withFixtureResponse } from './fixtures/responses'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import type { components } from '../src/contracts'

type S = components['schemas']
const now = 1793667600000
const zero = {metal: '0', crystal: '0', deuterium: '0'}
const moon: S['BodyV3'] = {
  ...body, id: id(80), kind: 'Moon', amounts: zero, fields: 1, fields_used: 0, fields_reserved: 0,
  levels: Object.fromEntries(Object.keys(body.levels).map(k => [k, 0])), inventories: [],
  energy: {supply: '0', demand: '0', utilization: '1000000'},
  diameter_km: 8366, moon: {parent: body.id, created_at: now},
}
const catalog = JSON.parse(readFileSync('rules/mvp-v1-slice-13.json', 'utf8')).catalog as S['CatalogEntry3'][]
const bootstrap = (response: import('@playwright/test').Response) => response.url().endsWith('/bootstrap')

for (const width of [1440, 390]) {
  test.describe(`moon creation at ${width}px`, () => {
    test.use({viewport: {width, height: 900}, hasTouch: width < 600, reducedMotion: 'reduce'})
    // Regression: a moon sharing its planet's coordinates must remain selectable
    // without exposing planet mutations or sending construction requests.
    test('selects a moon and inspects buildings while lunar construction stays unavailable', async ({page}) => {
      await installGameFixture(page, {protocol: 4, bodies: [body, moon], catalog, sampledAt: now, missions: {fleets: [], incoming: [], score_value_micro: '0', fleet_slots: '1'}, extraCapabilities: ['Attack', 'Espionage', 'Reports']})
      const mutations: string[] = []
      page.on('request', request => {
        if (/\/progression-options(?:\/bulk)?$/.test(request.url())) mutations.push(request.url())
        if (request.url().endsWith('/commands')) {
          const payload = request.postDataJSON()
          const command = payload.gameplay?.command ?? payload.command
          if (command?.action?.type !== 'RecordForegroundPresence') mutations.push(request.url())
        }
      })
      await withFixtureResponse(page, bootstrap, () => page.goto(`/u/andromeda/b/${body.id}/overview`))
      await page.getByRole('combobox', {name: 'Selected body'}).click()
      await page.getByRole('option', {name: /Moon/}).click()
      await expect(page).toHaveURL(new RegExp(`/b/${moon.id}/overview`))
      const dossier = page.getByRole('article', {name: `Moon [1:371:12] dossier`})
      await expect(dossier).toContainText('8,366 km diameter')
      await expect(dossier).toContainText('0/1 fields')
      await expect(dossier.getByRole('button', {name: /Rename planet|Planet actions/i})).toHaveCount(0)
      await diagnosticScreenshot(page, {path: `test-results/moon-overview-${width}x900.png`, fullPage: true})
      await withFixtureResponse(page, bootstrap, () => page.goto(`/u/andromeda/b/${moon.id}/facilities`))
      const tile = page.getByRole('link', {name: 'Upgrade Lunar Base', exact: true})
      await expect(tile).toBeVisible()
      await expect(page.getByRole('button', {name: 'Build Lunar Base', exact: true})).toBeDisabled()
      await expect(page.getByRole('link', {name: 'Upgrade Research Lab', exact: true})).toHaveCount(0)
      await diagnosticScreenshot(page, {path: `test-results/moon-buildings-${width}x900.png`, fullPage: true})
      await tile.click()
      const detail = page.getByRole('region', {name: 'Progression quote'})
      await expect(detail).toContainText('Unavailable in this universe.')
      await expect(detail.getByRole('button', {name: /Confirm upgrade/})).toHaveCount(0)
      await diagnosticScreenshot(page, {path: `test-results/moon-building-detail-${width}x900.png`, fullPage: true})
      await withFixtureResponse(page, bootstrap, () => page.goto(`/u/andromeda/b/${moon.id}/dispatch`))
      await expect(page.locator('main h1')).toHaveText('Dispatch')
      await expect(page.getByRole('status').filter({hasText: 'No ships available here.'})).toBeVisible()
      await expect(page.getByRole('button', {name: 'Add all ships', exact: true})).toBeDisabled()
      await expect(page.getByRole('button', {name: 'Review fleet', exact: true})).toBeDisabled()
      await diagnosticScreenshot(page, {path: `test-results/moon-dispatch-${width}x900.png`, fullPage: true})
      // Extra screenshots are optional visual evidence, not test readiness.
      if (process.env.ORBIT_TEST_SCREENSHOTS === '1') {
        for (const destination of ['resources', 'research', 'shipyard', 'defense', 'resource-settings']) {
          await withFixtureResponse(page, bootstrap, () => page.goto(`/u/andromeda/b/${moon.id}/${destination}`))
          await expect(page.locator('main')).toContainText(destination === 'resource-settings' ? 'Moons have no resource production.' : destination === 'research' ? 'Research cannot be conducted on moons.' : 'not available yet')
          await diagnosticScreenshot(page, {path: `test-results/moon-${destination}-${width}x900.png`, fullPage: true})
        }
      }
      // Same-coordinate moon targeting remains distinct from the planet.
      await withFixtureResponse(page, bootstrap, () => page.goto(`/u/andromeda/b/${body.id}/dispatch?galaxy=1&system=371&position=12&target=moon&mission=Transport`))
      await expect(page.getByLabel('Destination preview')).toContainText('Your moon')
      await expect(page.getByRole('button', {name: 'Review fleet', exact: true})).toBeDisabled()
      expect(mutations).toEqual([])
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    })

  })
}
