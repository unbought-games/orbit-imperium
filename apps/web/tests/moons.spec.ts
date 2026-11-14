import { routeWorld } from './fixtures/game'
import { readFileSync } from 'node:fs'
import { test, expect } from './fixtures/test'
import { installGameFixture, body, binding, id } from './fixtures/game'
import { withFixtureResponse, withReportResponse } from './fixtures/responses'
import { withGalaxyResponse } from './fixtures/galaxy'
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
const bound = (request_id: string, data: unknown) => ({protocol: 4, binding, request_id, viewer_revision: '1', sampled_at: now, as_of_ms: now, data})
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
      await expect(page.getByRole('button', {name: 'Review fleet', exact: true})).toBeEnabled()
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
      await expect(page.getByRole('button', {name: 'Review fleet', exact: true})).toBeEnabled()
      expect(mutations).toEqual([])
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    })

    // Regression: galaxy formerly selected one arbitrary body at a coordinate,
    // and creation reports had no readable presentation or body navigation.
    test('shows planet and moon together and opens the creation notice and combat outcome', async ({page}) => {
      await installGameFixture(page, {protocol: 4, bodies: [body, moon], catalog, sampledAt: now, missions: {fleets: [], incoming: [], score_value_micro: '0', fleet_slots: '1'}, extraCapabilities: ['Reports']})
      await routeWorld(page, async route => {
        const request = route.request().postDataJSON()
        expect(request.type).toBe('Galaxy')
        const data: S['GalaxySystem4'] = {galaxy: 1, system: 371, observed_at: now, positions: [{coordinates: body.coordinates, body: {id: body.id, name: 'Nova Roma', kind: 'Planet', owner: binding.player, activity: {type: 'None'}, inactivity: 'Active', vacation: false, espionage_eligible: false}, moon: {id: moon.id, diameter_km: 8366}, debris: {field_identity: id(82), metal: '1500300', crystal: '500100', deuterium: '0'}}]}
        data.positions = Array.from({length: 15}, (_, index) => index === 11 ? data.positions[0] : {coordinates: {galaxy: 1, system: 371, position: index + 1}, body: null, debris: null})
        await route.fulfill({json: bound(request.context.request_id, data)})
      })
      await withGalaxyResponse(page, () => page.goto(`/u/andromeda/b/${body.id}/galaxy`))
      const positions = page.getByRole('region', {name: 'Galaxy positions'})
      await expect(positions).toContainText('Nova Roma')
      const moonControl = positions.getByRole('button', {name: 'Actions for moon [1:371:12]', exact: true})
      await expect(moonControl).toBeVisible()
      const row = positions.getByRole('listitem').nth(11)
      for (const viewport of [320, 600, 768, width]) {
        await page.setViewportSize({width: viewport, height: 900})
        await row.scrollIntoViewIfNeeded()
        const playerBox = (await row.getByText('Player 00000000', {exact: true}).boundingBox())!
        const moonBox = (await moonControl.boundingBox())!
        const debrisBox = (await row.getByLabel('large debris field', {exact: true}).boundingBox())!
        expect(moonBox.x).toBeGreaterThanOrEqual(playerBox.x + playerBox.width)
        expect(debrisBox.x).toBeGreaterThanOrEqual(moonBox.x + moonBox.width)
        expect(moonBox.width).toBeGreaterThanOrEqual(44)
        expect(moonBox.height).toBeGreaterThanOrEqual(44)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      }
      await expect(positions).not.toContainText('8,366 km')
      await diagnosticScreenshot(page, {path: `test-results/moon-galaxy-row-${width}x900.png`})
      const details = page.getByRole('menu', {name: 'Missions to moon [1:371:12]', exact: true})
      await moonControl.click()
      await expect(details).toContainText('Diameter: 8,366 km')
      await expect(details.getByRole('menuitem', {name: 'Transport', exact: true})).toBeEnabled()
      await diagnosticScreenshot(page, {path: `test-results/moon-galaxy-details-${width}x900.png`})
      await page.keyboard.press('Escape')
      await expect(details).toBeHidden()
      if (width >= 600) {
        await moonControl.focus()
        await page.keyboard.press('Enter')
        await expect(details).toBeVisible()
        await page.keyboard.press('Escape')
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

      const created = {kind: 'MoonCreated', at: now, body: moon.id, parent: body.id, coordinates: body.coordinates, diameter_km: 8366}
      const combat = {kind: 'Combat', at: now, target: body.coordinates, target_name: 'Nova Roma', target_kind: 'Planet', outcome: 'DefenderVictory', participants: [], rounds: [], survivors: [], gross_losses: [], recovered: [], debris: {metal: '1500300000000', crystal: '500100000000', deuterium: '0'}, loot: zero, moon_creation: {chance_percent: 20, moon: moon.id, diameter_km: 8366}}
      for (const [index, payload] of [created, combat].entries()) {
        const report = id(90 + index)
        await page.route(`**/api/v4/universes/*/reports/${report}`, async route => {
          const request = route.request().postDataJSON()
          await route.fulfill({json: bound(request.request_id, {header: {id: report, kind: payload.kind, observed_at: now, read: true, hidden: false}, payload})})
        })
        await withReportResponse(page, report, () => page.goto(`/u/andromeda/b/${body.id}/reports/${report}`))
        await expect(page.getByRole('region', {name: 'Report observation'})).toContainText('8,366 km')
        await diagnosticScreenshot(page, {path: `test-results/moon-${index ? 'combat' : 'notice'}-${width}x900.png`, fullPage: true})
        if (index === 0) {
          await page.getByRole('link', {name: 'Inspect moon buildings'}).click()
          await expect(page).toHaveURL(new RegExp(`/b/${moon.id}/facilities`))
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      }
    })
  })
}
