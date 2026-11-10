import { diagnosticScreenshot } from '../fixtures/diagnostic-screenshot'
import { test, expect } from './fixture'

// Geometry and canonical colors require a browser; amount/legacy permutations
// are covered by report-observation and report-preview static/model tests.
test('harvest resources and ships stay grouped at desktop and phone widths', async ({
  page,
}) => {
  await page.goto('/report-observation.html?scenario=harvest')
  await expect(page.locator('html')).toHaveAttribute(
    'data-component-ready',
    'harvest',
  )
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    const report = page.getByRole('region', { name: 'Report observation' })
    await expect(
      report.getByRole('heading', { name: 'Harvested resources' }),
    ).toBeVisible()
    await expect(report).not.toContainText('Carried resources')
    await expect(
      report.getByRole('img', { name: 'Metal', exact: true }).locator('..'),
    ).toContainText('713')
    await expect(
      report.getByRole('img', { name: 'Deuterium', exact: true }).locator('..'),
    ).toContainText('608')
    for (const name of ['metal', 'crystal', 'deuterium']) {
      const symbol = report.getByRole('img', {
        name: name[0].toUpperCase() + name.slice(1),
        exact: true,
      })
      await expect(symbol).toBeVisible()
      const canonicalColor = await symbol.evaluate((el) => {
        const probe = document.createElement('span')
        probe.style.color = `var(--resource-${el.getAttribute('data-resource')})`
        document.body.append(probe)
        const result = getComputedStyle(probe).color
        probe.remove()
        return result
      })
      await expect(symbol).toHaveCSS(
        'color',
        name === 'metal' ? 'rgb(203, 182, 141)' : canonicalColor,
      )
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width)
    // Resources and ship entries stay together at the left, including on
    // wide screens; available page width must not spread these facts apart.
    for (const entries of [
      report
        .getByRole('group', { name: 'Resource amounts' })
        .locator(':scope > span'),
      report.locator('dl > div'),
    ]) {
      const boxes = await entries.evaluateAll((elements) =>
        elements.map((element) => {
          const { x, y, width } = element.getBoundingClientRect()
          return { x, y, width }
        }),
      )
      expect(boxes.length).toBeGreaterThan(1)
      for (let i = 1; i < boxes.length; i++) {
        expect(boxes[i].y).toBe(boxes[0].y)
        const gap = boxes[i].x - boxes[i - 1].x - boxes[i - 1].width
        expect(gap).toBeGreaterThanOrEqual(12)
        expect(gap).toBeLessThanOrEqual(32)
      }
    }
    await diagnosticScreenshot(page, {
      path: `test-results/harvest-collected-${width}.png`,
      fullPage: true,
    })
  }
})
