import { test, expect } from './fixture'
import { diagnosticScreenshot } from '../fixtures/diagnostic-screenshot'

for (const width of [390, 1280]) {
  for (const signup of [false, true]) {
    test(`authentication error stays above its action at ${width}px (signup=${signup})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(
        `/?scenario=public-entry&mode=${signup ? 'signup' : 'login'}&error`,
      )
      const submit = page.getByRole('button', {
        name: signup ? 'Create account' : 'Sign in',
        exact: true,
      })
      const alert = page.locator('form').getByRole('alert')
      await expect(alert).toBeVisible()
      await expect(page.getByRole('alert')).toHaveCount(1)
      const calloutBox = await alert.boundingBox(),
        submitBox = await submit.boundingBox()
      expect(calloutBox!.y + calloutBox!.height).toBeLessThan(submitBox!.y)
      expect(
        submitBox!.y - calloutBox!.y - calloutBox!.height,
      ).toBeLessThanOrEqual(24)
    })
  }
}

test('public forms reflow with short phone viewports and unavailable artwork', async ({
  page,
}) => {
  await page.route('**/art/**', (route) => route.abort())
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const width of [320, 360, 390, 430, 768]) {
    await page.setViewportSize({ width, height: 480 })
    await page.goto('/?scenario=public-entry&mode=signup')
    await page.getByLabel('Account', { exact: true }).fill('still-usable')
    await expect(page.locator('img[src^="/art/atlas/"]:visible')).toHaveCount(0)
    await page.getByLabel('Password', { exact: true }).fill('password')
    const action = page.getByRole('button', {
      name: 'Create account',
      exact: true,
    })
    await action.scrollIntoViewIfNeeded()
    await expect(action).toBeInViewport()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  }
  await page.setViewportSize({ width: 390, height: 700 })
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '32px'
  })
  await page
    .getByRole('button', { name: 'Create account', exact: true })
    .scrollIntoViewIfNeeded()
  await expect(page.getByLabel('Account', { exact: true })).toHaveValue(
    'still-usable',
  )
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
})

test('homepage aligns responsive policies and consistent community destinations', async ({
  page,
}) => {
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('/?scenario=public-layout')
    await expect(
      page.getByRole('link', { name: 'by unbought games', exact: true }),
    ).toHaveAttribute('href', 'https://unbought.games/')
    await expect(
      page.getByRole('link', { name: 'Source', exact: true }),
    ).toHaveCount(0)
    const policies = page.getByRole('navigation', {
      name: 'Policies and support',
    })
    await expect
      .poll(async () => {
        const bounds = await policies.boundingBox()
        if (!bounds) return Infinity
        if (width < 768)
          return Math.abs(bounds.x + bounds.width / 2 - width / 2)
        const footer = (await page.locator('footer').boundingBox())!
        return Math.abs(bounds.x + bounds.width - footer.x - footer.width)
      })
      .toBeLessThan(1)
    await expect(
      policies.getByRole('link', { name: 'Support', exact: true }),
    ).toHaveAttribute('href', 'mailto:support@unbought.games')
    const community = page.getByRole('navigation', {
      name: 'News and community',
    })
    const news = community.getByRole('link', { name: /^What’s new / })
    const repository = community.getByRole('link', { name: /^View on GitHub / })
    const discord = community.getByRole('link', { name: /^Join Discord / })
    await expect(news).toHaveAttribute('href', '/updates/index.html')
    await expect(repository).toHaveAttribute(
      'href',
      'https://github.com/unbought-games/orbit-imperium',
    )
    await expect(repository.locator('svg').first()).toBeVisible()
    await expect(discord).toHaveAttribute(
      'href',
      'https://discord.gg/AVMHp7jUcw',
    )
    await expect(discord).toBeVisible()
    await expect(discord.locator('img')).toBeVisible()
    await expect(discord.locator('img')).toHaveAttribute(
      'src',
      '/brand/discord-symbol-white.svg',
    )
    const rows = await community.getByRole('link').all()
    expect(rows).toHaveLength(4)
    const firstRow = (await rows[0].boundingBox())!
    for (const row of rows) {
      const bounds = (await row.boundingBox())!
      expect(Math.abs(bounds.x - firstRow.x)).toBeLessThan(1)
      expect(Math.abs(bounds.width - firstRow.width)).toBeLessThan(1)
    }
    const heroActionsBounds = (await page
      .getByRole('navigation', { name: 'Get started' })
      .boundingBox())!
    const newsBounds = (await news.boundingBox())!
    const repositoryBounds = (await repository.boundingBox())!
    const discordBounds = (await discord.boundingBox())!
    expect(newsBounds.y).toBeGreaterThanOrEqual(
      heroActionsBounds.y + heroActionsBounds.height,
    )
    expect(repositoryBounds.y).toBeGreaterThanOrEqual(
      newsBounds.y + newsBounds.height,
    )
    expect(discordBounds.y).toBeGreaterThanOrEqual(
      repositoryBounds.y + repositoryBounds.height,
    )
    expect(
      await news.evaluate((element) =>
        parseFloat(getComputedStyle(element).fontSize),
      ),
    ).toBeGreaterThan(
      await policies.evaluate((element) =>
        parseFloat(getComputedStyle(element).fontSize),
      ),
    )
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    if (
      process.env.ORBIT_TEST_SCREENSHOTS === '1' &&
      (width === 1440 || width === 390)
    ) {
      await diagnosticScreenshot(page, {
        path: `test-results/homepage-${width}.png`,
        fullPage: true,
      })
      await community.scrollIntoViewIfNeeded()
      await diagnosticScreenshot(page, {
        path: `test-results/homepage-community-${width}x1000.png`,
      })
    }
  }
})

test('public pages disclose beta status and preserve approved policy links', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  for (const path of ['/', '/login', '/signup']) {
    await page.goto(
      path === '/'
        ? '/?scenario=public-layout'
        : `/?scenario=public-entry&mode=${path.slice(1)}`,
    )
    const notice =
      path === '/'
        ? page.getByText(
            'Currently in open beta. We’re continuing to improve the game.',
            { exact: true },
          )
        : page.getByRole('region', { name: 'Open Beta' })
    await expect(notice).toHaveCount(1)
    await expect(notice).toBeVisible()
    await expect(notice).not.toContainText('reset')
    if (path === '/') {
      await expect(page.getByRole('region', { name: 'Open Beta' })).toHaveCount(
        0,
      )
      const noticeBounds = (await notice.boundingBox())!
      expect(noticeBounds.y + noticeBounds.height).toBeLessThanOrEqual(
        (await page.locator('footer').boundingBox())!.y,
      )
    } else {
      await expect(notice).toContainText(
        'We’re actively building Orbit Imperium. Expect new features and changes as we go.',
      )
    }
    const policies = page.getByRole('navigation', {
      name: 'Policies and support',
    })
    for (const [name, destination] of [
      ['Terms', 'terms'],
      ['Privacy', 'privacy'],
      ['Conduct', 'conduct'],
    ])
      await expect(
        policies.getByRole('link', { name, exact: true }),
      ).toHaveAttribute('href', `https://unbought.games/${destination}/`)
    await expect(
      policies.getByRole('link', { name: 'Support', exact: true }),
    ).toHaveAttribute('href', 'mailto:support@unbought.games')
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    if (path === '/signup') {
      const action = page.getByRole('button', {
        name: 'Create account',
        exact: true,
      })
      expect((await notice.boundingBox())!.y).toBeLessThan(
        (await action.boundingBox())!.y,
      )
      await diagnosticScreenshot(page, {
        path: 'test-results/open-beta-signup-mobile.png',
        fullPage: true,
      })
    }
  }
})
