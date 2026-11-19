import {
  withBootstrapResponse,
  withFixtureResponse,
} from './fixtures/responses'
import { expect, test } from './fixtures/test'
import {
  refuseFixtureReads,
  body,
  id,
  shellFixture,
  installGameFixture,
  refreshGame,
} from './fixtures/game'
import { selectBody } from './fixtures/body-selector'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'

// Geometry/text-scale permutations live in shell-navigation.component.spec.ts.
// This journey retains real route focus, body history, reload and server refresh wiring.
test(
  'desktop navigation preserves body history, reload and report refresh',

  async ({ page }) => {
    refuseFixtureReads(page, { progression: ['Upgrade'] })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    let unread = false
    let revision = 1
    const bodies = Array.from({ length: 9 }, (_, index) => ({
      ...body,
      id: index === 0 ? body.id : id(index + 20),
      name: index === 0 ? 'Homeworld' : `Colony with a long name ${index}`,
      coordinates: { galaxy: 1, system: 371, position: index + 1 },
    }))
    const purchases = await shellFixture(page, {
      protocol: 4,
      bodies,
      extraCapabilities: ['Reports'],
      missions: {
        fleets: [],
        incoming: [],
        fleet_slots: '8',
        score_value_micro: '0',
      },
      hasUnreadReports: () => unread,
      viewerRevision: () => String(revision),
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
    await main.getByRole('link', { name: 'Develop', exact: true }).click()
    await expect(page.locator('main h1')).toHaveText('Resources')
    await develop.getByRole('link', { name: 'Research', exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('main h1')).toHaveText('Research')
    await expect(page.locator('main h1')).toBeFocused()
    // Tab labels carry the visible destination name while the route heading receives focus.
    expect(
      await page
        .locator('main h1')
        .evaluate((h) => h.parentElement!.getBoundingClientRect().height),
    ).toBeLessThanOrEqual(1)

    await expect(
      develop.getByRole('link', { name: 'Research', exact: true }),
    ).toHaveAttribute('aria-current', 'page')
    await selectBody(page, bodies[8].id)
    await expect(page).toHaveURL(new RegExp(`/b/${bodies[8].id}/research$`))
    await page.goBack()
    await expect(page).toHaveURL(new RegExp(`/b/${body.id}/research$`))
    await withBootstrapResponse(page, () => page.reload())
    await expect(
      develop.getByRole('link', { name: 'Research', exact: true }),
    ).toHaveAttribute('aria-current', 'page')
    // Preserve the original post-reload geometry/focus check in the real shell.
    const world = page.getByRole('group', { name: 'Planet and resources' })
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
    unread = true
    revision++
    await refreshGame(page)
    const reports = sidebar.getByRole('link', {
      name: 'Reports — unread reports',
      exact: true,
    })
    await reports.scrollIntoViewIfNeeded()
    await expect(
      reports.getByLabel('Unread reports', { exact: true }),
    ).toBeVisible()
    await reports.click()
    await expect(page.locator('main h1')).toHaveText('Reports')
    unread = false
    revision++
    await refreshGame(page)
    await expect(
      sidebar
        .getByRole('link', { name: 'Reports', exact: true })
        .getByLabel('Unread reports'),
    ).toHaveCount(0)
    expect(purchases()).toBe(0)
    await diagnosticScreenshot(page, {
      path: 'test-results/desktop-navigation/reports-1440x900-1.png',
    })
  },
)

// Touch geometry is isolated in shell-controls.component.spec.ts; retain route wiring here.
test('touch sidebar opens Settings and Facilities in the application', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 1024, height: 900 },
    hasTouch: true,
  })
  const page = await context.newPage()
  refuseFixtureReads(page, { insigniaLibrary: true })
  try {
    await shellFixture(page)
    const sidebar = page.getByRole('complementary', { name: 'Game navigation' })
    await sidebar
      .getByRole('button', { name: 'Account menu', exact: true })
      .tap()
    const accountMenu = page.getByRole('menu', {
      name: 'Account menu',
      exact: true,
    })
    await expect(accountMenu).toBeVisible()
    await accountMenu
      .getByRole('menuitem', { name: 'Settings', exact: true })
      .tap()
    const settingsNavigation = page.getByRole('navigation', {
      name: 'Settings navigation',
    })
    await expect(settingsNavigation).toBeVisible()
    await expect(accountMenu).toBeHidden()
    await settingsNavigation.getByRole('link', { name: 'Back to game' }).tap()
    await sidebar.getByRole('link', { name: 'Facilities', exact: true }).tap()
    await expect(page.locator('main h1')).toHaveText('Facilities')
  } finally {
    await context.close()
  }
})

// The component fixture has no CommandHud or real Menu destination. Keep both
// application integrations at every original bottom-bar breakpoint.
for (const width of [390]) {
  test(
    `menu page preserves tab navigation, history and settings access at ${width}px`,

    async ({ page }) => {
      await page.setViewportSize({ width, height: 844 })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await withFixtureResponse(
        page,
        (response) => response.url().endsWith('/bootstrap'),
        () =>
          shellFixture(page, {
            protocol: 4,
            accountUrl:
              width === 390 ? 'https://accounts.example/account' : undefined,
            missions: {
              fleets: [],
              incoming: [],
              fleet_slots: '8',
              score_value_micro: '0',
            },
          }),
      )
      // The Command HUD and bottom Menu are separate fixed surfaces until the sidebar starts at 1024px.
      for (const probeWidth of [320, 390, 767, 768, 961, 1023]) {
        await page.setViewportSize({ width: probeWidth, height: 844 })
        const dock = page.getByRole('navigation', {
          name: 'Main navigation',
          exact: true,
        })
        await expect(dock).toHaveCount(1)
        const orb = page.getByRole('button', {
          name: 'Open command HUD',
          exact: true,
        })
        await expect(orb).toBeVisible()
        expect(
          await dock.evaluate((nav) => {
            const button = document.querySelector(
              '[data-testid="command-orb"]',
            )!
            return (
              button.getBoundingClientRect().bottom <=
              nav.getBoundingClientRect().top
            )
          }),
        ).toBe(true)
      }
      await page.setViewportSize({ width, height: 844 })
      const tab = page.getByRole('link', { name: 'Menu', exact: true })
      await tab.focus()
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL(new RegExp(`/b/${body.id}/menu$`))
      await expect(page.locator('main h1')).toBeFocused()
      const menu = page.getByRole('navigation', { name: 'Menu destinations' })
      await expect(menu).toBeVisible()
      await expect(tab).toHaveAttribute('aria-current', 'page')
      await expect(
        page.getByRole('dialog', { name: 'Navigation' }),
      ).toHaveCount(0)
      await expect(menu.getByRole('link')).toHaveText([
        'Messages',
        'Alliance',
        'High Scores',
        'Reports',
        'Combat Simulator',
        'Settings',
        ...(width === 390 ? ['Unbought Games account'] : []),
      ])
      // Native external navigation must preserve the game tab on mobile.
      if (width === 390) {
        const account = menu
          .getByRole('region', { name: 'Account' })
          .getByRole('link', { name: 'Unbought Games account' })
        await page
          .context()
          .route('https://accounts.example/account', (route) =>
            route.fulfill({
              contentType: 'text/html',
              body: '<h1>Account destination</h1>',
            }),
          )
        const originalUrl = page.url()
        const popupOpened = page.waitForEvent('popup')
        await account.click()
        const popup = await popupOpened
        await expect(popup).toHaveURL('https://accounts.example/account')
        await expect(
          popup.getByRole('heading', { name: 'Account destination' }),
        ).toBeVisible()
        await expect(page).toHaveURL(originalUrl)
        expect(await popup.evaluate(() => window.opener)).toBeNull()
        await popup.close()
      }
      const main = page.getByRole('main')
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
      for (const row of await menu.getByRole('link').all())
        expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44)
      const logout = main.getByRole('button', { name: 'Log out', exact: true })
      await expect(logout).toBeInViewport({ ratio: 1 })
      if (process.env.ORBIT_TEST_SCREENSHOTS === '1') {
        await expect(page.getByTestId('orb-caption')).toHaveCount(0, {
          timeout: 10000,
        })
        await tab.blur()
      }
      await diagnosticScreenshot(page, {
        path: `test-results/menu-page-${width}x844.png`,
      })
      await menu.getByRole('link', { name: 'Settings', exact: true }).click()
      await expect(
        page
          .getByRole('main')
          .getByRole('navigation', { name: 'Settings navigation' }),
      ).toBeVisible()
      await expect(tab).toHaveAttribute('aria-current', 'page')
      await page.goBack()
      await expect(menu).toBeVisible()
      await page.setViewportSize({ width: 1440, height: 900 })
      await expect(
        page.getByRole('complementary', { name: 'Game navigation' }),
      ).toBeVisible()
      await expect(tab).toBeHidden()
      await expect(menu).toBeVisible()
      if (width === 390)
        await diagnosticScreenshot(page, {
          path: 'test-results/menu-page-desktop-1440x900.png',
        })
      await page.setViewportSize({ width, height: 844 })
      await logout.click()
      await expect(
        page.getByRole('button', { name: 'Sign in', exact: true }),
      ).toBeVisible()
      await expect(menu).toHaveCount(0)
    },
  )
}

test('mobile settings menu opens isolated sections and returns through back, history and reload', async ({
  page,
}) => {
  const { installSettingsFixture } = await import('./fixtures/settings')
  await page.setViewportSize({ width: 390, height: 844 })
  await installSettingsFixture(page)
  const base = `/u/andromeda/b/${body.id}`
  await withBootstrapResponse(page, () => page.goto(`${base}/menu`))
  await page
    .getByRole('navigation', { name: 'Menu destinations' })
    .getByRole('link', { name: 'Settings', exact: true })
    .click()
  await expect(page).toHaveURL(new RegExp(`${base}/settings$`))
  const menu = page
    .getByRole('main')
    .getByRole('navigation', { name: 'Settings navigation' })
  await expect(menu).toBeVisible()
  await expect(page.getByLabel('Empire name')).toHaveCount(0)
  await expect(menu.getByRole('link')).toHaveText([
    'Back to Menu',
    'Empire identity',
    'Game settings',
    'Rewards',
    'Help & community',
    'Account & session',
    'Empire deletion',
  ])
  for (const link of await menu.getByRole('link').all())
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await diagnosticScreenshot(page, {
    path: 'test-results/settings-preview/mobile-menu-390x844.png',
    fullPage: true,
  })
  await withFixtureResponse(
    page,
    (response) =>
      response.request().method() === 'GET' &&
      response.url().includes('/empire-profiles/'),
    () =>
      menu.getByRole('link', { name: 'Empire identity', exact: true }).click(),
  )
  await expect(page.getByLabel('Empire name')).toHaveValue(
    'Aurelian Commonwealth',
  )
  await expect(
    page.getByRole('button', { name: 'New design', exact: true }),
  ).toBeEnabled()
  await expect(
    page.getByRole('heading', { name: 'Vacation mode', exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('heading', { name: 'Delete empire', exact: true }),
  ).toHaveCount(0)
  await expect(menu).toHaveCount(0)
  await page.goBack()
  await expect(menu).toBeVisible()
  await menu.getByRole('link', { name: 'Game settings', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`${base}/settings/game$`))
  await expect(
    page.getByRole('link', { name: 'Back to Settings', exact: true }),
  ).not.toHaveAttribute('aria-current', 'page')
  await expect(
    page.getByRole('heading', { name: 'Vacation mode', exact: true }),
  ).toBeVisible()
  await expect(page.getByLabel('Empire name')).toHaveCount(0)
  await withBootstrapResponse(page, () => page.reload())
  await expect(
    page.getByRole('heading', { name: 'Vacation mode', exact: true }),
  ).toBeVisible()
  await page
    .getByRole('link', { name: 'Back to Settings', exact: true })
    .click()
  await expect(menu).toBeVisible()
  await menu.getByRole('link', { name: 'Rewards', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Community rewards', exact: true }),
  ).toBeVisible()
  await page
    .getByRole('link', { name: 'Back to Settings', exact: true })
    .click()
  await expect(menu).toBeVisible()
  await menu.getByRole('link', { name: 'Back to Menu', exact: true }).click()
  await expect(
    page.getByRole('navigation', { name: 'Menu destinations' }),
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  // At desktop width the same entry resolves to the identity detail and sidebar.
  await page.setViewportSize({ width: 1440, height: 1000 })
  await withFixtureResponse(
    page,
    (response) =>
      response.request().method() === 'GET' &&
      response.url().includes('/empire-profiles/'),
    () =>
      page
        .getByRole('navigation', { name: 'Menu destinations' })
        .getByRole('link', { name: 'Settings', exact: true })
        .click(),
  )
  await expect(page).toHaveURL(new RegExp(`${base}/settings/identity$`))
  await expect(
    page
      .getByRole('complementary', { name: 'Section sidebar' })
      .getByRole('navigation', { name: 'Settings navigation' }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Back to Settings', exact: true }),
  ).toBeHidden()
})

// The planetless support entry must resolve each player’s own body.
// This journey also protects external-tab wiring and mobile action layout.
test('support links share a recipient-safe destination and keep game context', async ({
  page,
  context,
}) => {
  const { installSettingsFixture } = await import('./fixtures/settings')
  await installSettingsFixture(page)
  await page.setViewportSize({ width: 1440, height: 1000 })
  const canonical = `/u/andromeda/b/${body.id}/settings/support`
  await withBootstrapResponse(page, () => page.goto(canonical))
  const support = page.getByRole('region', { name: 'Help Orbit grow' })
  await expect(support).toBeVisible()
  await expect(support).toContainText('don’t award Renown')
  const actions = [
    [
      'Vote on BrowserGamesTop',
      'https://browsergamestop.com/vote/orbit-imperium',
    ],
    ['Upvote on Foundplay', 'https://foundplay.io/games/orbit-imperium'],
    [
      'Star Orbit Imperium on GitHub',
      'https://github.com/unbought-games/orbit-imperium',
    ],
    ['Follow Unbought Games on GitHub', 'https://github.com/unbought-games'],
    [
      'Follow Orbit Imperium on IndieDB',
      'https://www.indiedb.com/games/orbit-imperium',
    ],
    [
      'Follow Orbit Imperium on ModDB',
      'https://www.moddb.com/games/orbit-imperium',
    ],
  ]
  await expect(support.getByRole('link')).toHaveCount(6)
  for (const [name, href] of actions) {
    const link = support.getByRole('link', {
      name: `${name} (opens in a new tab)`,
      exact: true,
    })
    await expect(link).toHaveAttribute('href', href)
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  }
  // Intercept the destination: validation must never cast a vote or visit a live campaign.
  await context.route('https://browsergamestop.com/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<h1>External vote page</h1>',
    }),
  )
  const popupReady = context.waitForEvent('page')
  await support
    .getByRole('link', {
      name: 'Vote on BrowserGamesTop (opens in a new tab)',
      exact: true,
    })
    .click()
  const popup = await popupReady
  await expect(popup.getByRole('heading')).toHaveText('External vote page')
  await expect(page).toHaveURL(new RegExp(`${canonical}$`))
  await popup.close()

  const shared = new URL('/u/andromeda/settings/support', page.url()).href
  if (process.env.ORBIT_TEST_SCREENSHOTS === '1') {
    await expect(page.getByTestId('orb-caption')).toBeHidden()
    await diagnosticScreenshot(page, {
      path: 'test-results/support-links/desktop-1440x1000.png',
    })
  }

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(support.getByRole('link').first()).toBeVisible()
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390)
  for (const link of await support.getByRole('link').all()) {
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  }
  await diagnosticScreenshot(page, {
    path: 'test-results/support-links/mobile-top-390x844.png',
  })
  if (process.env.ORBIT_TEST_SCREENSHOTS === '1') {
    await support
      .getByRole('link', {
        name: 'Follow Unbought Games on GitHub (opens in a new tab)',
        exact: true,
      })
      .evaluate((element) => element.scrollIntoView({ block: 'center' }))
    await diagnosticScreenshot(page, {
      path: 'test-results/support-links/mobile-follows-390x844.png',
    })
  }
  // Until the shell reserves a desktop HUD gutter, actions must stay left of
  // the orb at every scroll position, including tablet and compact desktop widths.
  for (const width of [600, 768, 1024, 1280, 1439]) {
    await page.setViewportSize({ width, height: 900 })
    const orb = (await page.getByTestId('command-orb').boundingBox())!
    for (const link of await support.getByRole('link').all()) {
      const action = (await link.boundingBox())!
      expect(action.x + action.width).toBeLessThanOrEqual(orb.x)
    }
    if (
      process.env.ORBIT_TEST_SCREENSHOTS === '1' &&
      [768, 1024].includes(width)
    ) {
      await page.evaluate(() => window.scrollTo(0, 0))
      await diagnosticScreenshot(page, {
        path: `test-results/support-links/support-${width}x900.png`,
      })
    }
  }
  const recipient = await context.newPage()
  await installGameFixture(recipient, {
    protocol: 4,
    bodies: [{ ...body, id: id(6) }],
  })
  await withBootstrapResponse(recipient, () => recipient.goto(shared))
  await expect(recipient).toHaveURL(
    new RegExp(`/u/andromeda/b/${id(6)}/settings/support$`),
  )
  await expect(
    recipient.getByRole('region', { name: 'Help Orbit grow' }),
  ).toBeVisible()
  await withBootstrapResponse(recipient, () => recipient.reload())
  await expect(
    recipient.getByRole('region', { name: 'Help Orbit grow' }),
  ).toBeVisible()
  await recipient.close()
})
