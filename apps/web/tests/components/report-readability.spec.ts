import { test, expect } from './fixture'
import { diagnosticScreenshot } from '../fixtures/diagnostic-screenshot'

// Explicit line placement and nested hit targets are browser layout contracts.
test('report identity stays below its activity and defender loot stays distinct', async ({
  page,
  mount,
}) => {
  await mount('report-readability')
  const list = page.getByRole('region', { name: 'Report list' })
  await expect(list.getByRole('article')).toHaveCount(4)
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await diagnosticScreenshot(page, {
      path: `test-results/report-readability-${width}x1000.png`,
      fullPage: true,
    })
    for (const row of await list.getByRole('article').all()) {
      const title = row.locator('strong')
      const identity = row
        .locator('a[aria-label]')
        .first()
        .locator('span[title]:not([aria-label]), span[class*="deliveryRoute"]')
      const titleBox = (await title.boundingBox())!
      const identityBox = (await identity.boundingBox())!
      expect(identityBox.y).toBeGreaterThanOrEqual(titleBox.y + titleBox.height)
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width)
    await expect(list.getByRole('article').first()).toContainText('Loot:')
    const detail = page.getByRole('region', { name: 'Report observation' })
    await expect(
      detail.getByRole('heading', { name: 'Loot', exact: true }),
    ).toBeVisible()
    await expect(
      detail.getByRole('heading', { name: 'Your cargo lost', exact: true }),
    ).toBeVisible()
    await expect(
      detail.getByRole('heading', { name: 'Debris created', exact: true }),
    ).toBeVisible()
  }
  const first = list.getByRole('article').first()
  await first.getByRole('checkbox').check()
  await expect(first.getByRole('checkbox')).toBeChecked()
  await expect(page.getByRole('status', { name: 'Report opened' })).toHaveText(
    'Not opened',
  )
  await expect(
    first.getByRole('button', { name: 'Archive report' }),
  ).toBeEnabled()
  await first
    .getByRole('link', { name: 'Defeat · Vega · Sol', exact: true })
    .click()
  await expect(page.getByRole('status', { name: 'Report opened' })).toHaveText(
    'Opened',
  )
})
