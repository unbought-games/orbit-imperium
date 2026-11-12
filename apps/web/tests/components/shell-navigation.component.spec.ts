import { diagnosticScreenshot } from '../fixtures/diagnostic-screenshot'
import { test, expect } from './fixture'

for (const [width, height, textScale] of [
  [1024, 600, 1],
  [1440, 900, 1],
  [1440, 700, 2],
  [2560, 1100, 1],
]) {
  test(`desktop navigation keeps its geometry, scrolling and alerts at ${width}x${height}, ${textScale * 100}% text`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width, height })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mount('shell-badges')
    await page.addStyleTag({
      content: `html { font-size: ${textScale * 100}% }`,
    })
    const sidebar = page.getByRole('complementary', { name: 'Game navigation' })
    const main = page.getByRole('navigation', {
      name: 'Main navigation',
      exact: true,
    })
    const develop = page.getByRole('navigation', {
      name: 'Develop navigation',
      exact: true,
    })
    await expect(main).toHaveCount(1)
    await expect(sidebar).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Menu', exact: true }),
    ).toBeHidden()
    await expect(sidebar.getByText('Andromeda')).toHaveCount(0)
    await expect(
      sidebar.getByText('Resource settings', { exact: true }),
    ).toHaveCount(0)
    await expect(develop.getByRole('link')).toHaveText([
      'Resources',
      'Facilities',
      'Research',
      'Shipyard',
      'Defense',
    ])
    await expect(
      sidebar.getByRole('link', { name: 'ORBIT IMPERIUM', exact: true }),
    ).toBeVisible()
    const bounds = (await sidebar.boundingBox())!
    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.y).toBe(0)
    expect(bounds.height).toBe(height)
    const world = page.getByRole('group', { name: 'Planet and resources' })
    expect((await world.boundingBox())!.x).toBeGreaterThanOrEqual(
      bounds.x + bounds.width,
    )
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await diagnosticScreenshot(page, {
      path: `test-results/shell-components/desktop-navigation-${width}x${height}-${textScale}.png`,
    })
    await main.getByRole('link', { name: 'Develop', exact: true }).click()
    await expect(page.locator('main h1')).toHaveText('Resources')
    await develop.getByRole('link', { name: 'Research', exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('main h1')).toHaveText('Research')
    await expect(
      develop.getByRole('link', { name: 'Research', exact: true }),
    ).toHaveAttribute('aria-current', 'page')
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    expect((await sidebar.boundingBox())!.y).toBe(0)
    expect((await world.boundingBox())!.y).toBe(0)
    const settings = sidebar.getByRole('button', {
      name: 'Account menu',
      exact: true,
    })
    await settings.scrollIntoViewIfNeeded()
    await expect(settings).toBeInViewport({ ratio: 1 })
    await settings.focus()
    await expect(settings).toBeFocused()
    const reports = sidebar.getByRole('link', {
      name: 'Reports — unread reports',
      exact: true,
    })
    await reports.scrollIntoViewIfNeeded()
    await expect(
      reports.getByLabel('Unread reports', { exact: true }),
    ).toBeVisible()
    const badge = (await reports
      .getByLabel('Unread reports', { exact: true })
      .boundingBox())!
    const row = (await reports.boundingBox())!
    expect(badge.x + badge.width).toBeLessThanOrEqual(row.x + row.width)
    await reports.click()
    await expect(page.locator('main h1')).toHaveText('Reports')
    await page.getByRole('button', { name: 'Clear prepared alerts' }).click()
    await expect(
      sidebar
        .getByRole('link', { name: 'Reports', exact: true })
        .getByLabel('Unread reports'),
    ).toHaveCount(0)
  })
}
for (const width of [390, 767, 768, 961, 1023, 1024, 1440]) {
  test(`navigation uses exactly one bottom bar or sidebar at ${width}px`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await mount('shell-default')
    const navigation = page.getByRole('navigation', {
      name: 'Main navigation',
      exact: true,
    })
    await expect(navigation).toHaveCount(1)
    if (width < 1024) {
      await expect(navigation).toHaveCSS('position', 'fixed')
      const bounds = (await navigation.boundingBox())!
      expect(bounds.y + bounds.height).toBeCloseTo(900, 0)
      expect(bounds.x).toBe(0)
      expect(bounds.width).toBe(width)
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
      expect((await navigation.boundingBox())!.y).toBeCloseTo(bounds.y, 0)
    } else {
      const sidebar = page.getByRole('complementary', {
        name: 'Game navigation',
      })
      await expect(sidebar).toBeVisible()
      await expect(sidebar).toHaveCSS('position', 'fixed')
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  })
}

// Native external navigation, popup sizing and breakpoint dismissal belong in a browser.
test('configured account link supports keyboard navigation and stays out of the mobile popup', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await mount('shell-account-link')
  await page.getByRole('button', { name: 'Account menu', exact: true }).click()
  const menu = page.getByRole('menu', { name: 'Account menu', exact: true })
  const link = menu.getByRole('menuitem', {
    name: 'Unbought Games account',
    exact: true,
  })
  await expect(link).toHaveAttribute('href', 'https://accounts.example/account')
  await expect(link.locator('img')).toHaveJSProperty('naturalWidth', 1024)
  const bounds = (await link.boundingBox())!
  expect(
    await link.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(1440)
  await diagnosticScreenshot(page, {
    path: 'test-results/account-link/desktop-1440x900.png',
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(menu).toBeHidden()
  await expect(
    page.getByRole('button', { name: 'Account menu', exact: true }),
  ).toBeHidden()
  await diagnosticScreenshot(page, {
    path: 'test-results/account-link/mobile-390x844.png',
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByRole('button', { name: 'Account menu', exact: true }).click()
  await page.route('https://accounts.example/account', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<h1>Account destination</h1>',
    }),
  )
  await link.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL('https://accounts.example/account')
  await expect(
    page.getByRole('heading', { name: 'Account destination' }),
  ).toBeVisible()
})

test('unconfigured account link is absent from the player menu', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await mount('shell-default')
  await page.getByRole('button', { name: 'Account menu', exact: true }).click()
  const menu = page.getByRole('menu', { name: 'Account menu', exact: true })
  await expect(menu).toBeVisible()
  await expect(
    menu.getByRole('menuitem', { name: 'Unbought Games account', exact: true }),
  ).toHaveCount(0)
  await diagnosticScreenshot(page, {
    path: 'test-results/account-link/unconfigured-1440x900.png',
  })
})
