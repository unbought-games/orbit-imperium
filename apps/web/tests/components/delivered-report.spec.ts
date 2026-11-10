import { test, expect } from './fixture'
import { diagnosticScreenshot } from '../fixtures/diagnostic-screenshot'

// Historical names are static; these checks retain narrow/wide overflow protection.
for (const width of [1440, 390]) {
  test(`delivered detail preserves recorded endpoint names at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/report-observation.html?scenario=delivered')
    await expect(page.locator('html')).toHaveAttribute(
      'data-component-ready',
      'delivered',
    )
    const observation = page.getByRole('region', { name: 'Report observation' })
    await expect(observation).toContainText('Nova Roma Historical Homeworld')
    await expect(observation).toContainText('Very Long Destination Colony Name')
    await expect(observation).toContainText('[1:2:8]')
    await expect(observation).toContainText('[1:1:3]')
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await diagnosticScreenshot(page, {
      path: `test-results/delivered-detail-${width}x1000.png`,
      fullPage: true,
    })
  })
}
