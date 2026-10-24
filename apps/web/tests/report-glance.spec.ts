import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { test, expect } from './fixtures/test'
import { shellFixture, binding, body, id } from './fixtures/game'
import type { components } from '../src/contracts'

test('report glances expose historical mission facts in compact rows on desktop and phone', async ({ page }) => {
  const now = Date.now()
  await page.clock.setFixedTime(now)
  await shellFixture(page, { protocol: 4, sampledAt: now })
  const items: components['schemas']['ReportHeader4'][] = [
    { id: id(70), kind: 'Returned', observed_at: now - 120000, read: false, hidden: false, preview: { kind: 'Returned', origin_coordinates: { galaxy: 1, system: 1, position: 5 }, ships: [{ ship_type: 'EspionageProbe', count: '1' }], cargo: { metal: '0', crystal: '0', deuterium: '0' } } },
    { id: id(71), kind: 'Espionage', observed_at: now - 134000, read: false, hidden: false, preview: { kind: 'Espionage', target: { body: id(80), owner: id(9), kind: 'Planet', coordinates: { galaxy: 1, system: 1, position: 3 } }, resources: { visibility: 'Known', value: { metal: '125000000000', crystal: '80000000000', deuterium: '12000000000' } }, fleet: { visibility: 'Known', value: [{ item: { kind: 'Ship', id: 'SmallCargo' }, count: '3' }] }, defenses: { visibility: 'Unknown' } } },
    { id: id(72), kind: 'Combat', observed_at: now - 600000, read: true, hidden: false, preview: { kind: 'Combat', target: { galaxy: 1, system: 2, position: 7 }, outcome: 'AttackerVictory', participants: [{ owner: binding.player, side: 'Attacker' }], loot: { metal: '40000000000', crystal: '20000000000', deuterium: '5000000000' } } },
    { id: id(73), kind: 'Returned', observed_at: now - 900000, read: true, hidden: false, preview: { kind: 'Returned', origin_coordinates: { galaxy: 1, system: 1, position: 5 }, ships: [{ ship_type: 'LightFighter', count: '90' }, { ship_type: 'SmallCargo', count: '15' }], cargo: { metal: '40000000000', crystal: '20000000000', deuterium: '5000000000' } } },
  ]
  await page.route('**/api/**/reports', async route => {
    const { context } = route.request().postDataJSON()
    await route.fulfill({ json: { protocol: 4, binding, request_id: context.request_id, viewer_revision: '1', sampled_at: now, as_of_ms: now, data: { items, has_more: false, next_cursor: null, as_of_ms: now } } })
  })
  await page.goto(`/u/andromeda/b/${body.id}/reports`)
  // Keep the original warm metal color in the HUD, its tooltip, and report previews.
  // Comparing only against the resource token would miss a regression in that token.
  const metalDetails = page.getByLabel('Current resources').getByRole('button', { name: 'Metal details' })
  await expect(metalDetails.locator('svg')).toHaveCSS('color', 'rgb(203, 182, 141)')
  await metalDetails.click()
  const metalTooltip = page.getByRole('dialog', { name: 'Metal', exact: true })
  const metalIcons = metalTooltip.locator('svg[data-resource="metal"]')
  // This report fixture has balances and capacity, but no production data.
  await expect(metalTooltip).toContainText('Flow unavailable')
  await expect(metalIcons).toHaveCount(2)
  for (const icon of await metalIcons.all()) {
    await expect(icon).toHaveCSS('color', 'rgb(203, 182, 141)')
  }
  await page.keyboard.press('Escape')
  await expect(metalTooltip).toBeHidden()
  const rows = page.locator('main article')
  await expect(rows).toHaveCount(4)
  await expect(rows.first()).toContainText('[1:1:5]')
  await expect(rows.first()).toContainText('1 Espionage Probe')
  await expect(rows.first()).toContainText('No cargo')
  await expect(rows.nth(1).getByRole('img', { name: 'metal', exact: true })).toHaveCSS('color', 'rgb(203, 182, 141)')
  for (const [name, value] of [['metal', '125,000'], ['crystal', '80,000'], ['deuterium', '12,000']]) {
    const symbol = rows.nth(1).getByRole('img', { name, exact: true })
    await expect(symbol).toBeVisible()
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
  await expect(rows.nth(2).getByRole('link', { name: 'Victory', exact: true })).toBeVisible()
  await expect(rows.nth(2).locator('strong')).toHaveText('✓ Victory')
  await expect(rows.nth(2)).toContainText('Loot:')
  await expect(rows.nth(2).getByRole('img', { name: 'metal', exact: true }).locator('..')).toContainText('40,000')
  await expect(rows.first().getByLabel('Unread', { exact: true })).toBeVisible()
  await expect(rows.nth(2).getByLabel('Unread', { exact: true })).toHaveCount(0)
  const remove = rows.first().getByRole('button', { name: 'Delete report', exact: true })
  await expect(remove).toHaveText('')
  await expect(remove.locator('svg')).toBeVisible()
  await expect(rows.first().locator('time')).toHaveAttribute('title', /2026/)
  await expect(rows.first().getByRole('link', { name: 'Returned', exact: true })).toHaveAttribute('href', `/u/andromeda/b/${body.id}/reports/${id(70)}`)
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    const heading = rows.first().locator('strong')
    expect((await heading.boundingBox())!.x).toBe((await rows.first().boundingBox())!.x)
    expect((await rows.first().boundingBox())!.height).toBeLessThanOrEqual(width >= 600 ? 72 : 96)
    const icon = (await remove.locator('svg').boundingBox())!
    const age = (await rows.first().locator('time').boundingBox())!
    expect(Math.abs(icon.y + icon.height / 2 - age.y - age.height / 2)).toBeLessThanOrEqual(1)
    expect((await remove.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    await diagnosticScreenshot(page, { path: `test-results/report-glance-${width}.png` })
    if (width === 390) await diagnosticScreenshot(rows.first().locator('..'), { path: 'test-results/report-glance-preview.png' })
  }
  const combat = items[2].preview
  if (combat?.kind !== 'Combat') throw Error('Expected combat fixture')
  for (const [outcome, side, title, color] of [
    ['AttackerVictory', 'Attacker', '✓ Victory', 'rgb(145, 201, 172)'],
    ['AttackerVictory', 'Defender', '✕ Defeat', 'rgb(227, 152, 133)'],
    ['DefenderVictory', 'Attacker', '✕ Defeat', 'rgb(227, 152, 133)'],
    ['DefenderVictory', 'Defender', '✓ Victory', 'rgb(145, 201, 172)'],
    ['Draw', 'Attacker', '＝ Draw', 'rgb(203, 182, 141)'],
    ['MutualDestruction', 'Defender', '✕ Defeat', 'rgb(227, 152, 133)'],
  ] as const) {
    combat.outcome = outcome
    combat.participants = [{ owner: binding.player, side }]
    await page.reload()
    await expect(rows.nth(2).locator('strong')).toHaveText(title)
    await expect(rows.nth(2).locator('strong')).toHaveCSS('color', color)
    await expect(rows.nth(2).getByRole('link')).toHaveAccessibleName(title.slice(2))
    if (outcome === 'AttackerVictory' && side === 'Attacker') await expect(rows.nth(2)).toContainText('Loot:')
    else await expect(rows.nth(2)).not.toContainText('Loot:')
  }

})
