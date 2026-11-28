import { expect, test } from './fixture'

for (const width of [1440, 390]) {
  test(`invitation identity and signup action fit tall and compact viewports at ${width}px`, async ({
    page,
    mount,
  }) => {
    const code = 'inv_fixture-A_9'
    await page.setViewportSize({ width, height: 1000 })
    await mount('invitation')
    await expect(page.getByText('Aurelia', { exact: true })).toBeVisible()
    await expect(page.getByText(/The Aurora Accord/)).toBeVisible()
    await expect(
      page.getByRole('img', { name: 'Aurelia’s emblem' }),
    ).toHaveAttribute('data-shape', 'hexagon')
    await expect(
      page.getByRole('heading', { name: 'Andromeda', exact: true }),
    ).toBeVisible()
    const join = page.getByRole('link', {
      name: 'Join this universe',
      exact: true,
    })
    const auth = new URL((await join.getAttribute('href'))!, page.url())
    expect(auth.pathname).toBe('/api/auth/login')
    expect(auth.searchParams.get('signup')).toBe('true')
    expect(auth.searchParams.get('return_to')).toBe(`/invite/${code}`)
    const bounds = (await join.boundingBox())!
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(1000)
    await expect(page.getByText('Open Beta', { exact: true })).toHaveCount(0)
    expect(
      (await page.getByRole('heading', { name: /Start small/ }).boundingBox())!
        .y,
    ).toBeGreaterThanOrEqual(1000)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    const compactHeight = width === 1440 ? 720 : 740
    await page.setViewportSize({ width, height: compactHeight })
    const compact = (await join.boundingBox())!
    expect(compact.y + compact.height).toBeLessThanOrEqual(compactHeight)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  })
}
