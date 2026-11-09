import { test, expect, type Route } from './fixtures/test'
import { recruitmentFixture, pathMatches } from './fixtures/recruitment'
import { withFixtureResponse } from './fixtures/responses'
import { binding } from './fixtures/game'

for (const width of [1440, 390]) {
  test(`slow alliance search keeps its space and controls through delayed loading at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await recruitmentFixture(page)
    await withFixtureResponse(page, pathMatches('/recruitment'), () =>
      page.goto(`/alliances/${binding.universe}`),
    )
    const result = page.getByRole('link', { name: 'View STAR', exact: true })
    await expect(result).toBeVisible()
    const now = new Date()
    await page.clock.install({ time: now })
    await page.clock.pauseAt(now)
    let capture!: (route: Route) => void
    const requested = new Promise<Route>((resolve) => {
      capture = resolve
    })
    await page.route('**/recruitment?*', (route) => {
      capture(route)
    })
    const search = page.getByRole('searchbox', { name: 'Search alliances' })
    await search.fill('missing')
    await search.press('Enter')
    const held = await requested
    const content = page
      .getByRole('region', { name: 'Alliance directory' })
      .locator('[aria-busy]')
    await expect(content).toHaveAttribute('aria-busy', 'true')
    const before = await content.boundingBox()
    await expect(result).toBeVisible()
    await expect(
      page.getByRole('status').filter({ hasText: 'Loading alliances…' }),
    ).toHaveCount(0)
    await page.clock.runFor(200)
    const indicator = page
      .getByRole('status')
      .filter({ hasText: 'Loading alliances…' })
    await expect(indicator).toBeVisible()
    await expect(result).toBeHidden()
    expect(await content.boundingBox()).toEqual(before)
    await expect(search).toBeFocused()
    await expect(search).toHaveValue('missing')
    await expect(
      page.getByRole('button', { name: 'Filters', exact: true }),
    ).toBeEnabled()
    const orbit = indicator.locator('svg')
    const shape = await orbit.boundingBox()
    const space = await indicator.boundingBox()
    expect(
      Math.abs(shape!.x + shape!.width / 2 - space!.x - space!.width / 2),
    ).toBeLessThan(1)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(orbit.locator('g').first()).toHaveCSS('animation-name', 'none')
    await withFixtureResponse(page, pathMatches('/recruitment'), () =>
      held.fulfill({ json: { alliances: [], total: 0 } }),
    )
    // Complete response delivery and React's new content precede clock advancement.
    const empty = page.getByRole('heading', {
      name: 'No alliances match your search.',
      includeHidden: true,
    })
    await expect(empty).toHaveCount(1)
    await expect(empty).toBeHidden()
    await expect(indicator).toBeVisible()
    await page.clock.runFor(500)
    await expect(empty).toBeVisible()
    await expect(indicator).toHaveCount(0)
    await expect(search).toBeFocused()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  })
}
