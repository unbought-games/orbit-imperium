import { withFixtureResponse } from './fixtures/responses'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { test, expect } from './fixtures/test'
import { shellFixture, binding, body, id } from './fixtures/game'
import type { components } from '../src/contracts'

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

test('compact report tools combine filters and preserve their controls at 1280px', async ({page}) => {
  const width = 1280
  await page.setViewportSize({width, height: 900})
  await page.emulateMedia({reducedMotion: 'reduce'})
  const now = new Date('2026-10-30T12:00:00Z').getTime()
  await page.clock.setFixedTime(now)
  await shellFixture(page, {protocol: 4, sampledAt: now, extraCapabilities: ['Reports'], missions: {fleets: [], incoming: [], score_value_micro: '0', fleet_slots: '1'}})
  const items: components['schemas']['ReportHeader4'][] = [
    {id: id(70), kind: 'Returned', observed_at: now - 120000, read: false, hidden: false, preview: {kind: 'Returned', origin_coordinates: {galaxy: 1, system: 19, position: 6}, ships: [{ship_type: 'SmallCargo', count: '25000000'}, {ship_type: 'Cruiser', count: '535000'}], cargo: {metal: '125000000000', crystal: '80000000000', deuterium: '12000000000'}}},
    {id: id(71), kind: 'Espionage', observed_at: now - 600000, read: false, hidden: false},
    {id: id(72), kind: 'Espionage', observed_at: now - 3600000, read: true, hidden: false},
    {id: id(73), kind: 'Delivered', observed_at: now - 10 * 86400000, read: true, hidden: false},
    {id: id(74), kind: 'Returned', observed_at: now - 10 * 86400000, read: true, hidden: false, starred: true},
  ]
  await page.route('**/api/**/reports', async route => {
    const {context} = route.request().postDataJSON()
    await route.fulfill({json: {protocol: 4, binding, request_id: context.request_id, viewer_revision: '1', sampled_at: now, as_of_ms: now, data: {items, has_more: false, next_cursor: null, as_of_ms: now}}})
  })
  await withFixtureResponse(
    page, response => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/reports'),
    () => page.goto(`/u/andromeda/b/${body.id}/reports`),
  )
  const rows = page.locator('main article')
  await expect(rows).toHaveCount(5)
  const tools = page.getByRole('group', {name: 'Report tools'})
  const originalTools = await tools.elementHandle()
  await expect(tools.getByRole('button')).toHaveCount(3)
  await expect(rows.getByRole('checkbox')).toHaveCount(5)
  await expect(page.getByText('Known sort values only')).toHaveCount(0)
  await diagnosticScreenshot(page, {path: `test-results/report-tools-default-${width}x900.png`})
  await diagnosticScreenshot(page.locator('main section').filter({has: page.getByRole('heading', {name: 'Reports', exact: true, level: 2})}), {path: `test-results/reports-default-section-${width}x900.png`})

  await page.getByRole('button', {name: 'Sort reports', exact: true}).click()
  await expect(page.getByRole('menuitemradio')).toHaveCount(5)
  await diagnosticScreenshot(page, {path: `test-results/report-tools-sort-${width}x900.png`})
  await page.getByRole('menuitemradio', {name: 'Oldest first', exact: true}).click()
  await expect(page.getByRole('menu', {name: 'Sort reports'})).toHaveCount(0)
  await expect(rows.first()).toContainText('Fleet Returned')
  await expect(rows.first()).toContainText('10 days ago')

  const filterButton = page.getByRole('button', {name: 'Filter reports', exact: true})
  await filterButton.click()
  const filter = page.getByRole('dialog', {name: 'Filter reports', exact: true})
  // Wait for the desktop popover's initial focus before exercising native
  // selects; otherwise its focus manager can overwrite the test's focus().
  await expect(filter.getByRole('button', {name: 'Dismiss popover'})).toBeFocused()
  const panel = filter
  const initialBounds = await panel.boundingBox()
  for (const name of ['Report type', 'Status']) {
    const dropdown = filter.getByRole('combobox', {name, exact: true})
    // selectOption alone does not focus native selects in WebKit. Exercise
    // the focus event delivered when an iOS user opens the native picker.
    await dropdown.focus()
    await expect(dropdown).toBeFocused()
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    await diagnosticScreenshot(page, {path: `test-results/report-filter-${name === 'Status' ? 'status' : 'type'}-focused-${width}x900.png`})
    expect(await panel.boundingBox()).toEqual(initialBounds)
  }
  await filter.getByRole('combobox', {name: 'Report type'}).selectOption('Espionage')
  await filter.getByRole('combobox', {name: 'Status', exact: true}).selectOption('unread')
  expect(await panel.boundingBox()).toEqual(initialBounds)
  await diagnosticScreenshot(page, {path: `test-results/report-tools-filter-${width}x900.png`})
  await filter.getByRole('button', {name: /Dismiss (sheet|popover)/}).click()
  await expect(filter).toBeHidden()
  await expect(filterButton).toBeFocused()
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('Espionage')
  const filters = page.getByRole('group', {name: 'Active report filters'})
  await expect(filters.getByRole('button')).toHaveCount(2)
  await diagnosticScreenshot(page, {path: `test-results/report-tools-filtered-${width}x900.png`})
  await page.getByRole('button', {name: 'Remove unread filter', exact: true}).click()
  await expect(rows).toHaveCount(2)
  await page.getByRole('button', {name: 'Remove Espionage filter', exact: true}).click()
  await expect(rows).toHaveCount(5)

  const selection = page.getByRole('group', {name: 'Report selection'})
  await expect(selection).toContainText('0 selected')
  await expect(selection.getByRole('button', {name: /Archive selected/})).toHaveCount(0)
  await selection.getByRole('button', {name: 'Select loaded reports (5)'}).click()
  await expect(selection).toContainText('5 selected')
  await expect(selection.getByRole('button', {name: 'Archive selected (4)'})).toBeEnabled()
  await diagnosticScreenshot(page, {path: `test-results/report-tools-selection-${width}x900.png`})
  await selection.getByRole('button', {name: 'Cancel selection'}).click()
  await expect(selection).toContainText('0 selected')

  await page.getByRole('button', {name: 'More report actions'}).click()
  await page.getByRole('menuitem', {name: 'Archive…', exact: true}).click()
  const cleanup = page.getByRole('dialog', {name: 'Archive reports', exact: true})
  await expect(cleanup.getByRole('button', {name: 'Archive 1 report', exact: true})).toBeEnabled()
  await expect(cleanup).toContainText('Entire Inbox · Starred reports stay.')
  await diagnosticScreenshot(page, {path: `test-results/report-tools-cleanup-${width}x900.png`})
  await cleanup.getByRole('combobox', {name: 'Older than'}).selectOption('custom')
  await cleanup.getByRole('spinbutton', {name: 'Hours', exact: true}).fill('-1')
  await expect(cleanup.getByRole('button', {name: /Archive \d+ reports?/})).toBeDisabled()
  await cleanup.getByRole('spinbutton', {name: 'Hours', exact: true}).fill('48')
  await expect(cleanup.getByRole('button', {name: 'Archive 1 report', exact: true})).toBeEnabled()
  await page.setViewportSize({width: 390, height: 900})
  await expect(cleanup.getByRole('spinbutton', {name: 'Hours', exact: true})).toHaveValue('48')
  await cleanup.getByRole('button', {name: /Dismiss (sheet|popover)/}).click()
  await expect(cleanup).toBeHidden()
  await page.setViewportSize({width, height: 900})
  expect(await originalTools!.evaluate(el => el.isConnected)).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
})
