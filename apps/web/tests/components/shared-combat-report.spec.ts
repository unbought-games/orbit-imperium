import { test, expect } from './fixture'
import { diagnosticScreenshot } from '../fixtures/diagnostic-screenshot'
import { sharedCombatLocations } from './report-data'

// Force grouping and geometry stay in a browser; redaction facts also have static coverage.
for (const visible of [false, true]) {
  test(`shared combat participant locations ${visible ? 'visible' : 'redacted'}`, async ({
    page,
  }) => {
    await page.goto(
      `/report-observation.html?scenario=shared-combat-${visible ? 'visible' : 'redacted'}`,
    )
    await expect(page.locator('html')).toHaveAttribute(
      'data-component-ready',
      `shared-combat-${visible ? 'visible' : 'redacted'}`,
    )
    const forces = page.getByRole('region', { name: 'Forces and losses' })
    await expect(forces.getByRole('article')).toHaveCount(3)
    for (const [index, location] of sharedCombatLocations.entries()) {
      const force = forces.getByRole('article').nth(index)
      if (visible) {
        await expect(force).toContainText(location.name)
        await expect(force.locator('[data-coordinate]')).toHaveCount(1)
      } else {
        await expect(force).toContainText('Coordinates hidden')
        await expect(force.locator('[data-coordinate]')).toHaveCount(0)
        await expect(
          page.getByText(location.name, { exact: false }),
        ).toHaveCount(0)
      }
    }
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.evaluate(() => document.fonts.ready)
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
      await diagnosticScreenshot(page, {
        path: `test-results/shared-${visible ? 'visible' : 'redacted'}-${width}.png`,
        fullPage: true,
      })
    }
  })
}
