import { test, expect } from './fixture'
import { diagnosticScreenshot } from '../fixtures/diagnostic-screenshot'

// Real keyboard activation, stable focus and narrow table containment are browser contracts.
for (const width of [320, 1280]) {
  test(`empire inventory scope preserves keyboard focus and exact totals at ${width}px`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await mount('fleet-inventory')
    const toggle = page.getByRole('button', {
      name: 'Entire empire',
      exact: true,
    })
    await toggle.focus()
    await toggle.press('Enter')
    await expect(toggle).toBeFocused()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    const panel = page.getByRole('region', {
      name: 'Empire ships',
      exact: true,
    })
    await expect(panel.getByRole('cell')).toHaveText([
      '9,223,372,036,854,775,821',
      '9,223,372,036,854,775,807',
      '14',
      '12',
    ])
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    const table = panel.getByRole('region', { name: 'Ship inventory table' })
    await table.focus()
    await expect(table).toBeFocused()
    await page.getByRole('button', { name: 'Clear inventory' }).click()
    await expect(panel).toContainText(
      'No ships stationed, flying or queued in your empire.',
    )
    await expect(panel.getByRole('table')).toHaveCount(0)
    await diagnosticScreenshot(page, {
      path: `test-results/fleets-empty-${width}x900.png`,
    })
    await page.getByRole('button', { name: 'Clear catalog' }).click()
    await expect(panel).toContainText('Ship details are unavailable.')
    await expect(panel).not.toContainText(
      'No ships stationed, flying or queued in your empire.',
    )
  })
}

for (const width of [390, 1280]) {
  test(`unavailable catalog does not claim confirmed inventory is empty at ${width}px`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mount('fleet-inventory')
    await page.getByRole('button', { name: 'Clear catalog' }).click()
    const panel = page.getByRole('region', {
      name: 'Stationed ships',
      exact: true,
    })
    await expect(panel).toContainText('Ship details are unavailable.')
    await expect(panel).not.toContainText('No ships stationed here.')
    await diagnosticScreenshot(page, {
      path: `test-results/fleets-unavailable-${width}x900.png`,
    })
    await page
      .getByRole('button', { name: 'Entire empire', exact: true })
      .click()
    const empire = page.getByRole('region', {
      name: 'Empire ships',
      exact: true,
    })
    await expect(empire).toContainText('Ship details are unavailable.')
    await expect(empire).not.toContainText(
      'No ships stationed, flying or queued in your empire.',
    )
  })
}
