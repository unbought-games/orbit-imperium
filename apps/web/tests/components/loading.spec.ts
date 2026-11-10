import { test, expect } from './fixture'

for (const width of [390, 1440]) {
  test(`loading overlay retains geometry and exposes settled content at ${width}px`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    // pauseAt installs a paused clock before any component timers exist.
    await page.clock.pauseAt(new Date('2040-01-01T00:00:00Z'))
    await mount('loading')
    const results = page.getByRole('region', { name: 'Results' })
    const content = results.locator('[aria-busy]')
    const before = await results.boundingBox()
    await page.getByRole('button', { name: 'Begin request' }).click()
    await page.getByRole('textbox', { name: 'Search' }).focus()
    await expect(content).toHaveAttribute('aria-busy', 'true')
    await expect(results.getByRole('status')).toHaveCount(0)
    await page.clock.runFor(200)
    const indicator = results.getByRole('status')
    await expect(indicator).toHaveText('Loading results…')
    await expect(content).toHaveAttribute('inert', '')
    expect(await results.boundingBox()).toEqual(before)
    await expect(page.getByRole('textbox', { name: 'Search' })).toBeFocused()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(indicator.locator('g').first()).toHaveCSS(
      'animation-name',
      'none',
    )
    const graphic = (await indicator.locator('svg').boundingBox())!
    const overlay = (await indicator.boundingBox())!
    expect(
      Math.abs(graphic.x + graphic.width / 2 - overlay.x - overlay.width / 2),
    ).toBeLessThan(1)
    await page.getByRole('button', { name: 'Complete request' }).click()
    await expect(
      results.getByRole('heading', {
        name: 'No matching results',
        includeHidden: true,
      }),
    ).toHaveCount(1)
    await page.clock.runFor(500)
    await expect(
      results.getByRole('heading', { name: 'No matching results' }),
    ).toBeVisible()
    await expect(content).not.toHaveAttribute('inert', '')
    await expect(results.getByRole('status')).toHaveCount(0)
    expect(await results.boundingBox()).toEqual(before)
  })
}
