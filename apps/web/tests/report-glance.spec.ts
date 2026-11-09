import { withFixtureResponse } from './fixtures/responses'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { test, expect } from './fixtures/test'
import { shellFixture, binding, body, id } from './fixtures/game'

for (const width of [1440, 390]) {
  test(`delivered detail preserves recorded endpoint names at ${width}px`, async ({page}) => {
    await page.setViewportSize({width, height: 1000})
    await shellFixture(page, {protocol: 4, extraCapabilities: ['Reports'], missions: {fleets: [], incoming: [], score_value_micro: '0', fleet_slots: '1'}})
    await page.route('**/api/**/reports/**', async route => {
      const context = route.request().postDataJSON()
      await route.fulfill({json: {protocol: 4, binding, request_id: context.request_id, viewer_revision: '1', sampled_at: Date.now(), as_of_ms: Date.now(), data: {
        header: {id: id(74), kind: 'Delivered', observed_at: Date.now()-60000, read: true, hidden: false},
        payload: {kind: 'Delivered', at: Date.now()-60000, sender: binding.player, recipient: id(9), origin: {galaxy: 1, system: 2, position: 8}, target: {galaxy: 1, system: 1, position: 3}, origin_name: 'Nova Roma Historical Homeworld', target_name: 'Very Long Destination Colony Name', cargo: {metal: '1000000000', crystal: '2000000000', deuterium: '3000000000'}}
      }}})
    })
    await withFixtureResponse(
      page, response => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith(`/reports/${id(74)}`),
      () => page.goto(`/u/andromeda/b/${body.id}/reports/${id(74)}`),
    )
    const observation = page.getByRole('region', {name: 'Report observation'})
    await expect(observation).toContainText('Nova Roma Historical Homeworld')
    await expect(observation).toContainText('Very Long Destination Colony Name')
    await expect(observation).toContainText('[1:2:8]')
    await expect(observation).toContainText('[1:1:3]')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await diagnosticScreenshot(page, {path: `test-results/delivered-detail-${width}x1000.png`, fullPage: true})
  })
}
