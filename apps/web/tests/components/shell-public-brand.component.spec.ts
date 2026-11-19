import { test, expect } from './fixture'

test('combined public branding keeps separate usable game and studio links', async ({
  page,
  mount,
}) => {
  await mount('public-entry')
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 })
    const header = page.locator('header')
    const logo = header.locator('img')
    await expect(logo).toHaveAttribute('src', '/brand-orbit-by-unbought.svg')
    await expect
      .poll(() =>
        logo.evaluate(
          (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
        ),
      )
      .toBe(true)
    const home = header.getByRole('link', {
      name: 'Orbit Imperium',
      exact: true,
    })
    const studio = header.getByRole('link', {
      name: 'by unbought games',
      exact: true,
    })
    await expect(studio).toHaveAttribute('href', 'https://unbought.games/')
    const homeBox = (await home.boundingBox())!
    const studioBox = (await studio.boundingBox())!
    expect(homeBox.height).toBeGreaterThanOrEqual(32)
    expect(studioBox.height).toBeGreaterThanOrEqual(32)
    expect(studioBox.y).toBeGreaterThanOrEqual(homeBox.y + homeBox.height)
    expect(studioBox.x + studioBox.width).toBeLessThanOrEqual(width)
    if (width < 768)
      expect((await header.boundingBox())!.height).toBeLessThanOrEqual(81)
    expect((await logo.boundingBox())!.width).toBeLessThanOrEqual(260)
    await expect(home).toHaveAttribute('href', '/')
  }
  await page.route('https://unbought.games/', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<h1>Studio destination</h1>',
    }),
  )
  await page
    .getByRole('link', { name: 'by unbought games', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Studio destination' }),
  ).toBeVisible()
})
