import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { test, expect } from './fixtures/test'
import { shellFixture, binding, body, id } from './fixtures/game'
import type { components } from '../src/contracts'

test('harvest reports distinguish new collections, zero collections and historical cargo at desktop and mobile sizes', async ({ page }) => {
  const now = new Date('2026-10-27T12:00:00Z').getTime()
  await page.clock.setFixedTime(now)
  await shellFixture(page, { protocol: 4, sampledAt: now })
  const cargo = { metal: '10713000000', crystal: '8238000000', deuterium: '2608000000' }
  const payloads: components['schemas']['MissionOutcomePayload4'][] = [
    { metal: '713000000', crystal: '238000000', deuterium: '0' },
    { metal: '0', crystal: '0', deuterium: '0' },
    undefined,
  ].map(harvested => ({
    kind: 'Harvested', fleet: id(80), origin: body.id,
    destination: { type: 'Debris', field_identity: id(81), coordinates: { galaxy: 1, system: 4, position: 6 } },
    origin_coordinates: { galaxy: 1, system: 1, position: 8 },
    destination_coordinates: { galaxy: 1, system: 4, position: 6 },
    cargo, ...(harvested ? { harvested } : {}),
    ships: [{ ship_type: 'Recycler', count: '1' }, { ship_type: 'LargeCargo', count: '4' }], at: now - 60000,
  }))
  const items: components['schemas']['ReportHeader4'][] = payloads.map((payload, index) => ({
    id: id(70 + index), kind: 'Harvested', observed_at: now - (index + 1) * 60000, read: true, hidden: false,
    preview: { kind: 'Harvested', destination_coordinates: payload.destination_coordinates, ships: payload.ships, cargo, ...(payload.harvested ? { harvested: payload.harvested } : {}) },
  }))
  await page.route('**/api/**/reports**', async route => {
    const request = route.request().postDataJSON()
    const reportIndex = items.findIndex(item => route.request().url().includes(item.id))
    await route.fulfill({ json: {
      protocol: 4, binding, request_id: (request.context ?? request).request_id,
      viewer_revision: '1', sampled_at: now, as_of_ms: now,
      data: reportIndex < 0 ? { items, has_more: false, next_cursor: null, as_of_ms: now } : { header: items[reportIndex], payload: payloads[reportIndex] },
    } })
  })
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto(`/u/andromeda/b/${body.id}/reports`)
    const rows = page.locator('main article')
    await expect(rows).toHaveCount(3)
    await expect(rows.first()).toContainText('Harvested:')
    await expect(rows.first().getByRole('img', { name: 'metal', exact: true }).locator('..')).toContainText('713')
    await expect(rows.first().getByRole('img', { name: 'deuterium', exact: true }).locator('..')).toContainText('0')
    await expect(rows.nth(1).getByRole('img', { name: 'metal', exact: true }).locator('..')).toContainText('0')
    await expect(rows.nth(2)).toContainText('Harvested amount unavailable')
    for (const amount of ['10,713', '8,238', '2,608']) await expect(page.locator('main')).not.toContainText(amount)
    await diagnosticScreenshot(page, { path: `test-results/harvest-list-${width}.png`, fullPage: true })
    for (const [index, state] of ['collected', 'zero', 'legacy'].entries()) {
      await rows.nth(index).getByRole('link', { name: 'Harvested', exact: true }).click()
      const report = page.getByRole('region', { name: 'Report observation' })
      await expect(report.getByRole('heading', { name: 'Harvested resources' })).toBeVisible()
      if (state === 'legacy') {
        await expect(report).toContainText('Harvested amount unavailable')
        await expect(report).toContainText('including cargo loaded before departure')
        await expect(report.getByRole('heading', { name: 'Carried resources' })).toBeVisible()
        await expect(report.getByRole('img', { name: 'Deuterium', exact: true }).locator('..')).toContainText('2,608')
      } else {
        await expect(report).not.toContainText('Carried resources')
        await expect(report).not.toContainText('2,608')
        await expect(report.getByRole('img', { name: 'Metal', exact: true }).locator('..')).toContainText(state === 'zero' ? '0' : '713')
        await expect(report.getByRole('img', { name: 'Deuterium', exact: true }).locator('..')).toContainText('0')
      }
      for (const name of ['metal', 'crystal', 'deuterium']) {
        const symbol = report.getByRole('img', { name: name[0].toUpperCase() + name.slice(1), exact: true })
        await expect(symbol).toBeVisible()
        const canonicalColor = await symbol.evaluate(el => {
          const probe = document.createElement('span')
          probe.style.color = `var(--resource-${el.getAttribute('data-resource')})`
          document.body.append(probe)
          const result = getComputedStyle(probe).color
          probe.remove()
          return result
        })
        await expect(symbol).toHaveCSS('color', name === 'metal' ? 'rgb(203, 182, 141)' : canonicalColor)
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      // Resources and ship entries stay together at the left, including on
      // wide screens; available page width must not spread these facts apart.
      for (const entries of [report.getByRole('group', { name: 'Resource amounts' }).locator(':scope > span'), report.locator('dl > div')]) {
        const boxes = await entries.evaluateAll(elements => elements.map(element => {
          const { x, y, width } = element.getBoundingClientRect()
          return { x, y, width }
        }))
        expect(boxes.length).toBeGreaterThan(1)
        for (let i = 1; i < boxes.length; i++) {
          expect(boxes[i].y).toBe(boxes[0].y)
          const gap = boxes[i].x - boxes[i - 1].x - boxes[i - 1].width
          expect(gap).toBeGreaterThanOrEqual(12)
          expect(gap).toBeLessThanOrEqual(32)
        }
      }
      await diagnosticScreenshot(page, { path: `test-results/harvest-${state}-${width}.png`, fullPage: true })
      await page.getByRole('link', { name: 'Back to reports' }).click()
    }
  }
})
