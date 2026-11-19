import { test, expect } from './fixtures/test'
import { refuseFixtureReads, body, shellFixture } from './fixtures/game'

test.use({
  isMobile: true,
  hasTouch: true,
  viewport: { width: 390, height: 844 },
})

test('iOS installed app keeps scrolling, fixed navigation and menu taps after resizing', async ({
  page,
  context,
}) => {
  refuseFixtureReads(page, { progression: ['Upgrade'] })
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'standalone', { value: true })
  })
  await shellFixture(page, { protocol: 4, extraCapabilities: ['Transport'] })
  await expect(page.locator('html')).toHaveAttribute('data-ios-standalone', '')
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
    'content',
    /user-scalable=no/,
  )
  const originalDocument = await page.evaluateHandle(() => document)
  const tabCount = context.pages().length
  const origin = new URL(page.url()).origin
  const sameApp = async (destination: string) => {
    await expect(page).toHaveURL(
      (url) =>
        url.origin === origin &&
        url.pathname === `/u/andromeda/b/${body.id}/${destination}`,
    )
    expect(
      await page.evaluate((doc) => document === doc, originalDocument),
    ).toBe(true)
    expect(context.pages()).toHaveLength(tabCount)
  }
  const dock = page.getByRole('navigation', {
    name: 'Main navigation',
    exact: true,
  })
  await dock.getByRole('link', { name: 'Develop', exact: true }).tap()
  await expect(page.locator('main h1')).toHaveText('Resources')
  let exercisedScroll = false
  for (const height of [844, 640, 844]) {
    await page.setViewportSize({ width: 390, height })
    for (const y of [0, 250, 100000]) {
      await page.evaluate((y) => window.scrollTo(0, y), y)
      await expect
        .poll(async () => {
          const box = (await dock.boundingBox())!
          return box.y + box.height
        })
        .toBe(height)
      expect(
        (await page
          .getByRole('group', { name: 'Planet and resources' })
          .boundingBox())!.y,
      ).toBe(0)
      // The shorter resource catalog can fit in the tall viewport. Verify the
      // exact reachable scroll position, and require real scrolling below.
      const limit = await page.evaluate(() =>
        Math.max(0, document.documentElement.scrollHeight - innerHeight),
      )
      const expected = Math.min(y, limit)
      await expect.poll(() => page.evaluate(() => scrollY)).toBe(expected)
      exercisedScroll ||= expected > 0
    }
  }
  expect(exercisedScroll).toBe(true)
  await sameApp('resources')
  await page
    .getByRole('navigation', { name: 'Develop navigation', exact: true })
    .getByRole('link', { name: 'Facilities', exact: true })
    .tap()
  await sameApp('facilities')
  await dock.getByRole('link', { name: 'Fleets', exact: true }).tap()
  await sameApp('fleets')
  await dock.getByRole('link', { name: 'Menu', exact: true }).tap()
  const menu = page.getByRole('navigation', {
    name: 'Menu destinations',
    exact: true,
  })
  await expect(menu).toBeVisible()
  await menu.getByRole('link', { name: 'Settings', exact: true }).tap()
  await expect(page.locator('main h1')).toHaveText('Settings')
  await expect(menu).not.toBeVisible()
  await sameApp('settings')
  await dock.getByRole('link', { name: 'Empire', exact: true }).tap()
  await sameApp('overview')
  await originalDocument.dispose()
})
