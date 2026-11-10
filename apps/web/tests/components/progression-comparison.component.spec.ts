import { test, expect, type Page } from './fixture'
import { diagnosticScreenshot } from '../fixtures/diagnostic-screenshot'

async function openComparison(
  page: Page,
  kind: 'Ship' | 'Defense',
  width: number,
) {
  await page.setViewportSize({ width, height: 950 })
  await page.goto(
    '/?' + new URLSearchParams({ scenario: 'progression-comparison', kind }),
  )
  await expect(page.locator('html')).toHaveAttribute(
    'data-component-ready',
    'progression-comparison',
  )
  const summary = page
    .locator('summary')
    .filter({ hasText: kind === 'Ship' ? 'Compare ships' : 'Compare defenses' })
  await summary.focus()
  await expect(summary).toBeFocused()
  await page.keyboard.press('Enter')
  return page.getByRole('region', { name: `${kind} comparison table` })
}

// This is a narrowly mounted control, not the retired mobile application tour.
for (const width of [1280, 390]) {
  test(`prepared ship comparison preserves selection across research and catalog updates at ${width}px`, async ({
    page,
  }) => {
    const region = await openComparison(page, 'Ship', width)
    await expect(
      region.getByRole('row', { name: 'Effective speed 15,000 18,000' }),
    ).toBeVisible()
    await expect(
      region.getByRole('img', { name: 'Metal', exact: true }),
    ).toHaveCount(2)
    await expect(
      region.getByRole('row', {
        name: 'Attack strength Unavailable Unavailable',
      }),
    ).toBeVisible()
    await page
      .getByRole('button', { name: 'Increase research', exact: true })
      .click()
    await expect(
      region.getByRole('row', { name: 'Effective speed 15,000 20,000' }),
    ).toBeVisible()
    await page.getByRole('radio', { name: 'Base stats', exact: true }).check()
    await expect(
      region.getByRole('row', { name: 'Base speed 12,500 10,000' }),
    ).toBeVisible()
    await region.focus()
    await expect(region).toBeFocused()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await page
      .getByRole('checkbox', { name: 'Heavy Fighter', exact: true })
      .uncheck()
    await expect(
      region.getByRole('columnheader', { name: 'Heavy Fighter', exact: true }),
    ).toHaveCount(0)
    await page
      .getByRole('checkbox', { name: 'Light Fighter', exact: true })
      .uncheck()
    await expect(
      page.getByText('Select ships to compare.', { exact: true }),
    ).toBeVisible()
    await page
      .getByRole('button', { name: 'Replace ship catalog', exact: true })
      .click()
    await expect(
      page.getByRole('checkbox', { name: 'Heavy Fighter', exact: true }),
    ).toHaveCount(0)
    await page
      .getByRole('checkbox', { name: 'Light Fighter', exact: true })
      .check()
    await expect(
      region.getByRole('row', { name: 'Base speed 16,000' }),
    ).toBeVisible()
    await diagnosticScreenshot(page, {
      path: `test-results/component-ship-comparison-${width}x950.png`,
      fullPage: true,
    })
  })

  test(`prepared defense comparison keeps selection, scrolling and empty state at ${width}px`, async ({
    page,
  }) => {
    const region = await openComparison(page, 'Defense', width)
    await expect(
      region.getByRole('row', { name: 'Attack strength 104 130', exact: true }),
    ).toBeVisible()
    await expect(
      region.getByRole('img', { name: 'Metal', exact: true }),
    ).toHaveCount(2)
    await expect(
      page.getByRole('rowheader', { name: 'Cargo capacity' }),
    ).toHaveCount(0)
    await page
      .getByRole('button', { name: 'Increase research', exact: true })
      .click()
    await expect(
      region.getByRole('row', { name: 'Attack strength 112 140', exact: true }),
    ).toBeVisible()
    await page.getByRole('radio', { name: 'Base stats', exact: true }).check()
    await expect(
      region.getByRole('row', { name: 'Attack strength 80 100', exact: true }),
    ).toBeVisible()
    await region.focus()
    await expect(region).toBeFocused()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await page
      .getByRole('checkbox', { name: 'Small Shield Dome', exact: true })
      .check()
    await expect(
      page.getByText('Body limit · Small Shield Dome', { exact: true }),
    ).toBeVisible()
    await expect(
      page.getByText(/Its shield protects itself, not other units/),
    ).toBeVisible()
    if (width === 390) {
      await region.evaluate((el) => {
        el.scrollLeft = el.scrollWidth
      })
      expect(await region.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0)
    }
    await diagnosticScreenshot(page, {
      path: `test-results/component-defense-comparison-${width}x950.png`,
      fullPage: true,
    })
    for (const name of ['Rocket Launcher', 'Light Laser', 'Small Shield Dome'])
      await page.getByRole('checkbox', { name, exact: true }).uncheck()
    await expect(
      page.getByText('Select defenses to compare.', { exact: true }),
    ).toBeVisible()
  })
}
