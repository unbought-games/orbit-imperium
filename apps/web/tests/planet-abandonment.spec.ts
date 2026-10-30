import { test, expect } from './fixtures/test'
import { body, binding, id, shellFixture } from './fixtures/game'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import type { components } from '../src/contracts'

for (const width of [1280, 390]) {
  test(`abandonment menu, losses, cancellation, blockers and removal at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const now = Date.UTC(2026, 9, 30, 14)
    await page.clock.setFixedTime(now)
    const colony = { ...body, id: id(90), name: 'Hesperia', coordinates: { galaxy: 1, system: 371, position: 8 } }
    const bodies = [{ ...body, name: 'Terra' }, colony]
    let revision = 1
    let blockers: string[] = []
    let submitted = 0
    const loss: components['schemas']['AbandonmentLoss4'] = {
      id: colony.id, name: colony.name, kind: 'Planet', coordinates: colony.coordinates,
      resources: { metal: '4823000000', crystal: '2100000000', deuterium: '750000000' },
      buildings: { MetalMine: 12, CrystalMine: 10, SolarPlant: 11 },
      inventory: [{ item: { kind: 'Ship', id: 'SmallCargo' }, count: '8' }, { item: { kind: 'Defense', id: 'RocketLauncher' }, count: '15' }],
      construction: [{ id: id(93), item: 'MetalMine level 13', quantity: '1', paid: { metal: '7784000000', crystal: '1946000000', deuterium: '0' } }], manufacturing: [],
    }
    const release = Date.UTC(2026, 10, 1)
    await shellFixture(page, { protocol: 4, bodies, homeworldId: body.id, viewerRevision: () => String(revision), sampledAt: now, missions: { fleets: [], incoming: [], fleet_slots: '1', score_value_micro: '0' }, extraCapabilities: ['Reports', 'Colonize'] })
    await page.route('**/world', async (route) => {
      const request = route.request().postDataJSON()
      let data: unknown
      if (request.type === 'AbandonmentQuote') {
        data = { body: request.body, terms_hash: 'abandon-review', release_at: release, blockers: request.body === body.id ? ['Your homeworld cannot be abandoned.'] : blockers, losses: [loss] }
      } else {
        data = { galaxy: 1, system: 371, observed_at: now, positions: Array.from({ length: 15 }, (_, index) => ({ coordinates: { galaxy: 1, system: 371, position: index + 1 }, body: null, debris: null, ...(index === 7 ? { abandoned_until: release } : {}) })) }
      }
      await route.fulfill({ json: { protocol: 4, binding, request_id: request.context.request_id, viewer_revision: String(revision), sampled_at: now, as_of_ms: now, data } })
    })
    await page.route('**/commands', async (route) => {
      const pair = route.request().postDataJSON()
      expect(pair.gameplay.command.action).toEqual({ type: 'AbandonPlanet', body: colony.id, expected_terms_hash: 'abandon-review' })
      expect(pair.presence.command.action.body).toBe(colony.id)
      submitted++
      bodies.splice(1, 1)
      revision++
      await route.fulfill({ json: { protocol: 4, binding, command_id: pair.gameplay.command_id, admitted_at: now, executed_at: now, status: 'Committed', result_ids: [], minimum_viewer_revision: String(revision) } })
    })
    await page.goto(`/u/andromeda/b/${colony.id}/overview`)
    const trigger = page.getByRole('button', { name: 'Planet actions [1:371:8]' })
    await trigger.click()
    const menu = page.getByRole('menuitem', { name: 'Abandon planet' })
    await expect(menu).toHaveCSS('color', 'rgb(255, 123, 123)')
    await diagnosticScreenshot(page, { path: `test-results/abandon-menu-${width}x900.png` })
    await menu.click()
    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toContainText('Abandon Hesperia?')
    await expect(dialog).toContainText('2026-11-01 00:00:00 UTC')
    await expect(dialog.getByRole('button', { name: 'Yes, abandon planet' })).toBeEnabled()
    await dialog.getByText('Buildings and stationed units', { exact: true }).click()
    await expect(dialog).toContainText('Small Cargo')
    await diagnosticScreenshot(page, { path: `test-results/abandon-confirmation-${width}x900.png` })
    await dialog.getByRole('button', { name: 'No, keep planet' }).click()
    await expect(trigger).toBeFocused()
    expect(submitted).toBe(0)
    blockers = ['This planet hosts or contributes a lab to active research. Finish or cancel that research first.']
    await trigger.click(); await menu.click()
    await expect(dialog.getByRole('button', { name: 'Yes, abandon planet' })).toBeDisabled()
    await expect(dialog).toContainText('active research')
    await diagnosticScreenshot(page, { path: `test-results/abandon-blocked-${width}x900.png` })
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
    blockers = []
    await trigger.click(); await menu.click()
    await dialog.getByRole('button', { name: 'Yes, abandon planet' }).click()
    await expect(page).toHaveURL(new RegExp(`/b/${body.id}/overview$`))
    await expect(page.getByRole('article', { name: 'Hesperia [1:371:8] dossier' })).toHaveCount(0)
    expect(submitted).toBe(1)
    await page.reload()
    await expect(page.getByRole('article', { name: 'Hesperia [1:371:8] dossier' })).toHaveCount(0)
    await expect(page.getByRole('article', { name: 'Terra [1:371:12] dossier' })).toBeVisible()
    await page.getByRole('article', { name: 'Terra [1:371:12] dossier' }).scrollIntoViewIfNeeded()
    await diagnosticScreenshot(page, { path: `test-results/abandon-removed-${width}x900.png` })
    await page.goto(`/u/andromeda/b/${body.id}/galaxy?galaxy=1&system=371&position=8`)
    await expect(page.getByText('Abandoned planet', { exact: true })).toBeVisible()
    const abandoned = page.getByText('Abandoned planet', { exact: true }).locator('xpath=ancestor::article')
    await expect(abandoned).not.toContainText('Available')
    await expect(abandoned.locator('img')).toHaveAttribute('src', '/art/atlas/planet-abandoned-96.webp')
    await expect(abandoned.locator('img')).toHaveJSProperty('complete', true)
    await expect(abandoned.locator('img')).not.toHaveJSProperty('naturalWidth', 0)
    await diagnosticScreenshot(page, { path: `test-results/abandon-galaxy-${width}x900.png` })
    const reportId = id(95)
    await page.route(`**/api/**/reports/${reportId}`, async (route) => {
      const request = route.request().postDataJSON()
      await route.fulfill({ json: { protocol: 4, binding, request_id: request.request_id, viewer_revision: String(revision), sampled_at: now, as_of_ms: now, data: { header: { id: reportId, kind: 'PlanetAbandoned', observed_at: now, read: true, hidden: false }, payload: { kind: 'PlanetAbandoned', abandonment: { body: colony.id, owner: binding.player, coordinates: colony.coordinates, removed_at: now, release_at: release, released: false, input: id(96), losses: [loss] } } } } })
    })
    await page.route('**/api/**/reports', async (route) => {
      const request = route.request().postDataJSON()
      await route.fulfill({ json: { protocol: 4, binding, request_id: request.context.request_id, viewer_revision: String(revision), sampled_at: now, as_of_ms: now, data: { items: [{ id: reportId, kind: 'PlanetAbandoned', observed_at: now, read: true, hidden: false, preview: { kind: 'PlanetAbandoned', coordinates: colony.coordinates, release_at: release } }], has_more: false, next_cursor: null, as_of_ms: now } } })
    })
    await page.goto(`/u/andromeda/b/${body.id}/reports`)
    await expect(page.getByRole('link', { name: 'Planet Abandoned', exact: true })).toBeVisible()
    await diagnosticScreenshot(page, { path: `test-results/abandon-report-list-${width}x900.png` })
    await page.getByRole('link', { name: 'Planet Abandoned', exact: true }).click()

    await expect(page.getByRole('heading', { name: 'Planet abandoned', exact: true })).toBeVisible()
    await diagnosticScreenshot(page, { path: `test-results/abandon-report-${width}x900.png` })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}
