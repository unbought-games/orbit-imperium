import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { test, expect } from './fixtures/test'
import { shellFixture, binding, body, id } from './fixtures/game'
import type { components } from '../src/contracts'

test('report glances expose historical mission facts in compact rows on desktop and phone', async ({ page }) => {
  const detailRequests: string[] = []
  page.on('request', request => {
    if (/\/reports\/[^/?]+(?:\?|$)/.test(request.url()) && request.url().includes('/api/')) detailRequests.push(request.url())
  })
  const now = Date.now()
  await page.clock.setFixedTime(now)
  await shellFixture(page, { protocol: 4, sampledAt: now })
  const items: components['schemas']['ReportHeader4'][] = [
    { id: id(70), kind: 'Returned', observed_at: now - 120000, read: false, hidden: false, preview: { kind: 'Returned', origin_coordinates: { galaxy: 1, system: 1, position: 5 }, ships: [{ ship_type: 'EspionageProbe', count: '1' }], cargo: { metal: '0', crystal: '0', deuterium: '0' } } },
    { id: id(71), kind: 'Espionage', observed_at: now - 134000, read: false, hidden: false, preview: { kind: 'Espionage', target: { body: id(80), owner: id(9), kind: 'Planet', name: 'Nova Roma', coordinates: { galaxy: 1, system: 1, position: 3 } }, resources: { visibility: 'Known', value: { metal: '125000000000', crystal: '80000000000', deuterium: '12000000000' } }, fleet: { visibility: 'Known', value: [{ item: { kind: 'Ship', id: 'SmallCargo' }, count: '3' }] }, defenses: { visibility: 'Unknown' } } },
    { id: id(72), kind: 'Combat', observed_at: now - 600000, read: true, hidden: false, preview: { kind: 'Combat', target_name: 'Luna', target_kind: 'Moon', target: { galaxy: 1, system: 2, position: 7 }, outcome: 'AttackerVictory', participants: [{ owner: binding.player, side: 'Attacker' }, { owner: id(9), side: 'Defender' }], debris: { metal: '5400000000', crystal: '1800000000', deuterium: '0' }, loot: { metal: '40000000000', crystal: '20000000000', deuterium: '5000000000' } } },
    { id: id(73), kind: 'Returned', observed_at: now - 900000, read: true, hidden: false, preview: { kind: 'Returned', origin_coordinates: { galaxy: 1, system: 1, position: 5 }, ships: [{ ship_type: 'LightFighter', count: '25000000' }, { ship_type: 'SmallCargo', count: '535000' }], cargo: { metal: '40000000000', crystal: '20000000000', deuterium: '5000000000' } } },
    { id: id(74), kind: 'Delivered', observed_at: now - 1800000, read: true, hidden: false, preview: { kind: 'Delivered', origin: { galaxy: 1, system: 2, position: 8 }, origin_name: 'Nova Roma Historical Homeworld', target_name: 'Very Long Destination Colony Name', target: { galaxy: 1, system: 1, position: 3 }, cargo: { metal: '1000000000', crystal: '2000000000', deuterium: '3000000000' } } },
  ]
  await page.route('**/api/**/reports', async route => {
    const { context } = route.request().postDataJSON()
    await route.fulfill({ json: { protocol: 4, binding, request_id: context.request_id, viewer_revision: '1', sampled_at: now, as_of_ms: now, data: { items, player_names: { [id(9)]: 'Commander Cassiopeia' }, has_more: false, next_cursor: null, as_of_ms: now } } })
  })
  await page.goto(`/u/andromeda/b/${body.id}/reports`)
  // Keep the original warm metal color in the HUD, its tooltip, and report previews.
  // Comparing only against the resource token would miss a regression in that token.
  const metalDetails = page.getByLabel('Current resources').getByRole('button', { name: 'Metal details' })
  await expect(metalDetails.locator('svg')).toHaveCSS('color', 'rgb(203, 182, 141)')
  await metalDetails.click()
  const metalTooltip = page.getByRole('dialog', { name: 'Metal', exact: true })
  const metalIcons = metalTooltip.locator('svg[data-resource="metal"]')
  await expect(metalTooltip).toContainText('Production +63 / hour')
  await expect(metalIcons).toHaveCount(3)
  for (const icon of await metalIcons.all()) {
    await expect(icon).toHaveCSS('color', 'rgb(203, 182, 141)')
  }
  await page.keyboard.press('Escape')
  await expect(metalTooltip).toBeHidden()
  // Keep the pointer off the resource trigger as viewport changes move the HUD.
  // Otherwise its hover popover can reopen at its previous desktop position.
  await page.mouse.move(0, 0)
  const rows = page.locator('main article')
  await expect(rows).toHaveCount(5)
  await expect(rows.last().getByRole('link', {name: 'Delivered · Nova Roma Historical Homeworld [1:2:8] → Very Long Destination Colony Name [1:1:3]', exact: true})).toBeVisible()
  await expect(rows.first()).toContainText('[1:1:5]')
  await expect(rows.first()).toContainText('1 Espionage Probe')
  await expect(rows.first()).toContainText('No cargo')
  await expect(rows.nth(1).getByRole('img', { name: 'metal', exact: true })).toHaveCSS('color', 'rgb(203, 182, 141)')
  for (const [name, value] of [['metal', '125,000'], ['crystal', '80,000'], ['deuterium', '12,000']]) {
    const symbol = rows.nth(1).getByRole('img', { name, exact: true })
    await expect(symbol).toBeVisible()
    const resourceValue = symbol.locator('..')
    await resourceValue.hover()
    expect(await resourceValue.evaluate(el => {
      const rect = el.getBoundingClientRect()
      return el.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2))
    })).toBe(true)
    const expectedColor = await page.evaluate(resource => {
      const probe = document.createElement('span')
      probe.style.color = `var(--resource-${resource})`
      document.body.append(probe)
      const color = getComputedStyle(probe).color
      probe.remove()
      return color
    }, name)
    await expect(symbol).toHaveCSS('color', expectedColor)
    await expect(symbol.locator('..')).toContainText(value)
  }
  const symbols = page.locator('svg[data-resource]')
  expect(await symbols.count()).toBeGreaterThan(6)
  // Every instance, including the shell ledger, owns its color without page styles.
  for (const symbol of await symbols.all()) {
    const resource = await symbol.getAttribute('data-resource')
    const color = await page.evaluate(resource => {
      const probe = document.createElement('span')
      probe.style.color = resource === 'energy' ? 'var(--ice)' : `var(--resource-${resource})`
      document.body.append(probe)
      const color = getComputedStyle(probe).color
      probe.remove()
      return color
    }, resource)
    await expect(symbol).toHaveCSS('color', color)
  }
  await expect(rows.nth(1)).toContainText('Fleet: 3')
  await expect(rows.nth(1)).toContainText('Defenses: unknown')
  await expect(rows.nth(2).getByRole('link', { name: 'Victory · Commander Cassiopeia · Luna (Moon)', exact: true })).toBeVisible()
  await expect(rows.nth(2).locator('strong')).toHaveText('Victory')
  await expect(rows.nth(2)).toContainText('Loot:')
  const debris = rows.nth(2).getByText('Debris:', { exact: true }).locator('..')
  await expect(debris.getByRole('img', { name: 'deuterium', exact: true })).toHaveCount(0)
  await expect(debris.getByRole('img', { name: 'metal', exact: true }).locator('..')).toContainText('5,400')
  await expect(rows.nth(2).getByRole('img', { name: 'deuterium', exact: true })).toHaveCount(1)
  await expect(rows.nth(2).getByRole('img', { name: 'metal', exact: true }).first().locator('..')).toContainText('40,000')
  await expect(rows.first().getByLabel('Unread', { exact: true })).toBeVisible()
  await expect(rows.nth(2).getByLabel('Unread', { exact: true })).toHaveCount(0)
  const remove = rows.first().getByRole('button', { name: 'Archive report', exact: true })
  await expect(remove).toHaveText('')
  await expect(remove.locator('svg')).toBeVisible()
  await expect(rows.first().locator('time')).toHaveAttribute('title', /2026/)
  await expect(rows.first().getByRole('link', { name: 'Fleet Returned', exact: true })).toHaveAttribute('href', `/u/andromeda/b/${body.id}/reports/${id(70)}`)
  // The whole row highlights, including when hovering outside the title link.
  for (const target of [rows.first().locator('strong'), rows.first().locator('time')]) {
    await target.hover()
    await expect(rows.first()).toHaveCSS('background-color', 'rgb(20, 43, 55)')
    await expect(rows.first().locator('strong')).toHaveCSS('text-decoration-line', 'none')
  }
  await page.mouse.move(0, 0)
  await expect(rows.first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    expect(await rows.last().evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    const reportLink = rows.first().getByRole('link', { name: 'Fleet Returned', exact: true })
    await page.keyboard.press('Tab')
    await reportLink.focus()
    await expect(reportLink).toBeFocused()
    expect(await reportLink.evaluate(el => getComputedStyle(el, '::after').outlineStyle))
      .toBe(width < 768 ? 'none' : 'solid')
    await expect(rows.nth(1).getByRole('link', { name: 'Espionage · Commander Cassiopeia · Nova Roma', exact: true })).toBeVisible()
    await expect(rows.nth(1)).toContainText('[1:1:3]')
    await expect(rows.nth(2)).toContainText('Commander Cassiopeia · Luna (Moon)')
    await expect(rows.nth(2)).toContainText('[1:2:7]')
    const title = page.getByRole('heading', { name: 'Reports', exact: true, level: 2 })
    const options = page.getByRole('group', { name: 'Report tools' })
    const titleBox = (await title.boundingBox())!
    const optionsBox = (await options.boundingBox())!
    const rowBox = (await rows.first().boundingBox())!
    const folders = page.getByRole('group', { name: 'Report folder' })
    const foldersBox = (await folders.boundingBox())!
    expect(foldersBox.x).toBeGreaterThan(titleBox.x + titleBox.width)
    expect(Math.abs(titleBox.y + titleBox.height / 2 - foldersBox.y - foldersBox.height / 2)).toBeLessThanOrEqual(1)
    await expect(folders.getByRole('button', { name: 'Inbox', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(folders.getByRole('button', { name: 'Archived', exact: true })).toHaveAttribute('aria-pressed', 'false')
    for (const segment of await folders.getByRole('button').all()) {
      expect((await segment.boundingBox())!.height).toBeGreaterThanOrEqual(28)
    }
    expect(foldersBox.height).toBeLessThanOrEqual(36)
    expect(optionsBox.height).toBe(24)
    if (width >= 390) {
      expect(Math.abs(titleBox.y + titleBox.height / 2 - optionsBox.y - optionsBox.height / 2)).toBeLessThanOrEqual(1)
    } else {
      expect(optionsBox.y).toBeGreaterThanOrEqual(foldersBox.y + foldersBox.height)
    }
    expect(Math.abs(optionsBox.x + optionsBox.width - rowBox.x - rowBox.width)).toBeLessThanOrEqual(1)
    await expect(rows.getByRole('button', { name: /^(Unstar|Star) report$/ })).toHaveCount(0)
    await expect(rows.nth(3)).toContainText('25.5M ships')
    await expect(rows.nth(3)).not.toContainText('Light Fighter')
    // The fleet glance stays on one line even when cargo wraps below it.
    const fleetSummary = rows.nth(3).getByText('25.5M ships', { exact: true })
    expect(await fleetSummary.evaluate(el =>
      el.getBoundingClientRect().height <= parseFloat(getComputedStyle(el).lineHeight),
    )).toBe(true)
    const heading = rows.first().locator('strong')
    const unread = rows.first().getByLabel('Unread', { exact: true })
    await expect(unread).toHaveCSS('background-color', 'rgb(164, 219, 239)')
    const unreadBox = (await unread.boundingBox())!
    expect(unreadBox.x).toBe(rowBox.x)
    expect(Math.abs(unreadBox.y + unreadBox.height / 2 - rowBox.y - rowBox.height / 2)).toBeLessThanOrEqual(1)
    expect((await heading.boundingBox())!.x).toBeGreaterThan(unreadBox.x + unreadBox.width)
    // Read rows retain the same gutter so their content stays aligned.
    expect((await rows.nth(2).locator('strong').boundingBox())!.x).toBe((await heading.boundingBox())!.x)
    expect((await rows.first().boundingBox())!.height).toBeLessThanOrEqual(width >= 600 ? 72 : 96)
    const icon = (await remove.locator('svg').boundingBox())!
    const age = (await rows.first().locator('time').boundingBox())!
    expect(Math.abs(icon.y + icon.height / 2 - age.y - age.height / 2)).toBeLessThanOrEqual(1)
    expect((await remove.boundingBox())!.height).toBe(24)
    expect((await remove.boundingBox())!.width).toBe(24)
    expect((await remove.locator('svg').boundingBox())!.width).toBe(16)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    await diagnosticScreenshot(page, { path: `test-results/report-glance-${width}.png` })
    if (width === 390) await diagnosticScreenshot(rows.first().locator('..'), { path: 'test-results/report-glance-preview.png' })
  }
  const combat = items[2].preview
  if (combat?.kind !== 'Combat') throw Error('Expected combat fixture')
  for (const [outcome, side, title, color] of [
    ['AttackerVictory', 'Attacker', 'Victory', 'rgb(145, 201, 172)'],
    ['AttackerVictory', 'Defender', 'Defeat', 'rgb(227, 152, 133)'],
    ['DefenderVictory', 'Attacker', 'Defeat', 'rgb(227, 152, 133)'],
    ['DefenderVictory', 'Defender', 'Victory', 'rgb(145, 201, 172)'],
    ['Draw', 'Attacker', 'Draw', 'rgb(203, 182, 141)'],
    ['MutualDestruction', 'Defender', 'Defeat', 'rgb(227, 152, 133)'],
  ] as const) {
    combat.outcome = outcome
    combat.participants = [{ owner: binding.player, side }]
    await page.reload()
    await expect(rows.nth(2).locator('strong')).toHaveText(title)
    await expect(rows.nth(2).getByText(title, { exact: true })).toBeVisible()
    await expect(rows.nth(2).getByText(title, { exact: true })).toHaveCSS('color', color)
    await expect(rows.nth(2).getByRole('link', { name: `${title} · Luna (Moon)`, exact: true })).toHaveAccessibleName(`${title} · Luna (Moon)`)
    if (outcome === 'AttackerVictory' && side === 'Attacker') await expect(rows.nth(2)).toContainText('Loot:')
    else await expect(rows.nth(2)).not.toContainText('Loot:')
  }
  // Historical reports without a viewer side name the winning side.
  for (const [outcome, title] of [
    ['AttackerVictory', 'Attacker victory'],
    ['DefenderVictory', 'Defender victory'],
  ] as const) {
    combat.outcome = outcome
    delete combat.participants
    await page.reload()
    await expect(rows.nth(2).locator('strong')).toHaveText(title)
    await expect(rows.nth(2).getByText(title, { exact: true })).toBeVisible()
    await expect(rows.nth(2).getByRole('link', { name: `${title} · Luna (Moon)`, exact: true })).toBeVisible()
  }
  delete combat.outcome
  await page.reload()
  await expect(rows.nth(2).getByRole('link', { name: 'Combat · Luna (Moon)', exact: true })).toBeVisible()
  await expect(rows.nth(2)).not.toContainText('victory')
  // Type colors also work without previews and meet WCAG AA on the row surface.
  for (const [kind, color] of [
    ['Combat', 'rgb(227, 152, 133)'],
    ['Delivered', 'rgb(145, 201, 172)'],
    ['Espionage', 'rgb(148, 191, 229)'],
    ['SpyContact', 'rgb(148, 191, 229)'],
    ['ContactLost', 'rgb(227, 152, 133)'],
  ] as const) {
    items[0].kind = kind
    delete items[0].preview
    await page.reload()
    const heading = rows.first().locator('strong')
    await expect(heading).toHaveCSS('color', color)
    const contrast = await heading.evaluate(el => {
      let surface: Element | null = el
      let background = 'rgba(0, 0, 0, 0)'
      while (surface && background === 'rgba(0, 0, 0, 0)') {
        background = getComputedStyle(surface).backgroundColor
        surface = surface.parentElement
      }
      const luminance = (rgb: string) => {
        const channels = rgb.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(n => {
          const c = n / 255
          return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
        })
        return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
      }
      const foreground = luminance(getComputedStyle(el).color)
      const backdrop = luminance(background)
      return (Math.max(foreground, backdrop) + 0.05) / (Math.min(foreground, backdrop) + 0.05)
    })
    expect(contrast).toBeGreaterThanOrEqual(4.5)
  }
  const spy = items[1].preview
  if (spy?.kind !== 'Espionage' || !spy.target) throw Error('Expected spy target')
  spy.target.name = 'VeryLongUnbrokenHistoricalPlanetNameForMobileTruncation'
  await page.reload()
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    const identity = 'Commander Cassiopeia · ' + spy.target.name
    const link = rows.nth(1).getByRole('link', { name: 'Espionage · ' + identity, exact: true })
    await expect(link).toBeVisible()
    await expect(link.getByTitle(identity)).toHaveCSS('text-overflow', 'ellipsis')
    if (width === 320) expect(await link.getByTitle(identity).evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true)
    await expect(link).toHaveAttribute('href', `/u/andromeda/b/${body.id}/reports/${id(71)}`)
    await expect(rows.nth(1).getByRole('link', { name: 'View [1:1:3] in galaxy', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    await diagnosticScreenshot(page, { path: `test-results/report-title-long-${width}.png` })
  }
  await rows.nth(1).getByRole('button', { name: 'Location actions for [1:1:3]' }).click()
  await expect(page.getByRole('menuitem', { name: 'Copy coordinates', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/reports`)
  expect(detailRequests).toEqual([])
  // Coordinate navigation stays independent from report selection; no detail reads for titles.
  await rows.nth(1).getByRole('link', { name: 'View [1:1:3] in galaxy', exact: true }).click()
  await expect(page).toHaveURL(/galaxy/)
})

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
    await page.goto(`/u/andromeda/b/${body.id}/reports/${id(74)}`)
    const observation = page.getByRole('region', {name: 'Report observation'})
    await expect(observation).toContainText('Nova Roma Historical Homeworld')
    await expect(observation).toContainText('Very Long Destination Colony Name')
    await expect(observation).toContainText('[1:2:8]')
    await expect(observation).toContainText('[1:1:3]')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await diagnosticScreenshot(page, {path: `test-results/delivered-detail-${width}x1000.png`, fullPage: true})
  })
}

for (const width of [1280, 390]) {
  test(`compact report tools combine filters and preserve their controls at ${width}px`, async ({page}) => {
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
    await page.goto(`/u/andromeda/b/${body.id}/reports`)
    const rows = page.locator('main article')
    await expect(rows).toHaveCount(5)
    const tools = page.getByRole('group', {name: 'Report tools'})
    const originalTools = await tools.elementHandle()
    await expect(tools.getByRole('button')).toHaveCount(3)
    await expect(rows.getByRole('checkbox')).toHaveCount(0)
    await expect(page.getByText('Known sort values only')).toHaveCount(0)
    await diagnosticScreenshot(page, {path: `test-results/report-tools-default-${width}x900.png`})

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
    await filter.getByRole('combobox', {name: 'Report type'}).selectOption('Espionage')
    await filter.getByRole('combobox', {name: 'Status', exact: true}).selectOption('unread')
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

    await page.getByRole('button', {name: 'More report actions'}).click()
    await page.getByRole('menuitem', {name: 'Select reports', exact: true}).click()
    const selection = page.getByRole('group', {name: 'Report selection'})
    await expect(selection).toContainText('0 selected')
    await expect(selection.getByRole('button', {name: /Archive selected/})).toHaveCount(0)
    await selection.getByRole('button', {name: 'Select all matching (4)'}).click()
    await expect(selection).toContainText('4 selected')
    await expect(selection.getByRole('button', {name: 'Archive selected (4)'})).toBeEnabled()
    await diagnosticScreenshot(page, {path: `test-results/report-tools-selection-${width}x900.png`})
    await selection.getByRole('button', {name: 'Cancel selection'}).click()
    await expect(selection).toHaveCount(0)

    await page.getByRole('button', {name: 'More report actions'}).click()
    await page.getByRole('menuitem', {name: 'Archive older reports…'}).click()
    const cleanup = page.getByRole('dialog', {name: 'Archive older reports', exact: true})
    await expect(cleanup.getByRole('button', {name: 'Archive 1 report', exact: true})).toBeEnabled()
    await expect(cleanup).toContainText('Entire Inbox · Starred reports stay.')
    await diagnosticScreenshot(page, {path: `test-results/report-tools-cleanup-${width}x900.png`})
    await cleanup.getByRole('combobox', {name: 'Older than'}).selectOption('custom')
    await cleanup.getByRole('spinbutton', {name: 'Hours', exact: true}).fill('-1')
    await expect(cleanup.getByRole('button', {name: /Archive \d+ reports?/})).toBeDisabled()
    await cleanup.getByRole('spinbutton', {name: 'Hours', exact: true}).fill('48')
    await expect(cleanup.getByRole('button', {name: 'Archive 1 report', exact: true})).toBeEnabled()
    await page.setViewportSize({width: width === 390 ? 1280 : 390, height: 900})
    await expect(cleanup.getByRole('spinbutton', {name: 'Hours', exact: true})).toHaveValue('48')
    await cleanup.getByRole('button', {name: /Dismiss (sheet|popover)/}).click()
    await expect(cleanup).toBeHidden()
    await page.setViewportSize({width, height: 900})
    expect(await originalTools!.evaluate(el => el.isConnected)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
  })
}
