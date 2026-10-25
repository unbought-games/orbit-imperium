import { test, expect } from './fixtures/test'
import { installGameFixture } from './fixtures/game'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'

async function anonymous(page: import('@playwright/test').Page, signup = true) {
  await page.route('**/api/analytics', (route) =>
    route.fulfill({ json: { enabled: false } }),
  )
  await page.route('**/api/auth/config', (route) =>
    route.fulfill({ json: { mode: 'local', universes: [] } }),
  )
  await page.route('**/api/v1/bootstrap', (route) =>
    route.fulfill({
      json: {
        version: 1,
        signup_enabled: signup,
        result: { status: 'anonymous' },
      },
    }),
  )
}

test('combined public branding keeps separate usable game and studio links', async ({
  page,
}) => {
  await anonymous(page)
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/signup')
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
    await diagnosticScreenshot(header, {
      path: `test-results/endorsed-header-${width}.png`,
    })
    await home.click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Victory isn’t for sale.',
    )
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

for (const signup of [true, false]) {
  test(`landing header offers immediate account access with registration ${signup ? 'open' : 'closed'}`, async ({
    page,
  }) => {
    await anonymous(page, signup)
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 844 })
      await page.goto('/')
      const header = page.locator('header')
      const account = header.getByRole('navigation', { name: 'Player account' })
      const login = account.getByRole('link', { name: 'Log in', exact: true })
      await expect(login).toBeInViewport()
      await expect(login).toHaveAttribute('href', '/login')
      const bounds = (await login.boundingBox())!
      expect(bounds.height).toBeGreaterThanOrEqual(44)
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width)
      const logo = (await header.locator('img').boundingBox())!
      expect(logo.x + logo.width).toBeLessThanOrEqual(bounds.x)
      expect((await header.boundingBox())!.height).toBeLessThanOrEqual(81)
      if (signup) {
        const register = account.getByRole('link', {
          name: 'Sign up',
          exact: true,
        })
        if (width >= 480) {
          await expect(register).toBeVisible()
          await register.click()
          await expect(page).toHaveURL(/\/signup$/)
          await expect(
            page.getByRole('button', { name: 'Create account', exact: true }),
          ).toBeVisible()
          await page.goto('/')
        } else {
          await expect(register).toBeHidden()
          await expect(
            page.getByRole('link', { name: 'Create an account', exact: true }),
          ).toBeVisible()
        }
      } else {
        await expect(header.locator('a[href="/signup"]')).toHaveCount(0)
      }
      await diagnosticScreenshot(header, {
        path: `test-results/compact-header-${width}-${signup}.png`,
      })
      await login.click()
      await expect(page).toHaveURL(/\/login$/)
      await expect(
        page.getByRole('button', { name: 'Sign in', exact: true }),
      ).toBeVisible()
    }
  })
}

for (const width of [320, 390, 768, 1440]) {
  test(`landing page shows genuine desktop and phone images without overflow at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 })
    await anonymous(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Victory isn’t for sale.',
    )
    const hero = page.locator('img[src^="/art/orbital-capital/"]')
    await expect
      .poll(() =>
        hero.evaluate(
          (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
        ),
      )
      .toBe(true)
    await diagnosticScreenshot(page, { path: `test-results/hero-${width}.png` })
    await page.getByRole('link', { name: 'See it on mobile' }).focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/#mobile$/)
    await expect(
      page.getByRole('heading', { name: 'Play on your phone.' }),
    ).toBeInViewport()
    const images = page.locator('img[src^="/art/landing/"]')
    await expect(images).toHaveCount(3)
    for (const image of await images.all()) {
      await image.scrollIntoViewIfNeeded()
      await expect
        .poll(() =>
          image.evaluate(
            (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
          ),
        )
        .toBe(true)
      const link = image.locator('..')
      const response = await page.request.get(
        (await link.getAttribute('href'))!,
      )
      expect(response.ok()).toBe(true)
      expect(response.headers()['content-type']).toContain('image/webp')
      const bounds = (await image.boundingBox())!
      expect(bounds.x).toBeGreaterThanOrEqual(0)
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width)
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await expect(
      page.getByRole('link', { name: 'Join the open beta', exact: true }),
    ).toHaveAttribute('href', '/signup')
    await diagnosticScreenshot(page, {
      path: `test-results/landing-${width}.png`,
      fullPage: true,
    })
    await diagnosticScreenshot(page.locator('#mobile'), {
      path: `test-results/landing-mobile-section-${width}.png`,
    })
    await page
      .getByRole('link', { name: 'Join the open beta', exact: true })
      .click()
    await expect(page).toHaveURL(/\/signup$/)
    await expect(
      page.getByRole('region', { name: 'Starting open beta' }),
    ).toContainText('reset the universe')
    // The expanded marketing sections are confined to the landing route.
    await expect(page.locator('#mobile')).toHaveCount(0)
  })
}

test('both landing invitations respect disabled registration', async ({
  page,
}) => {
  await anonymous(page, false)
  await page.goto('/')
  await expect(page.locator('a[href="/signup"]')).toHaveCount(0)
  await expect(
    page.getByRole('link', { name: 'Sign in', exact: true }),
  ).toHaveAttribute('href', '/login')
  await page
    .getByRole('link', { name: 'Return to your account', exact: true })
    .click()
  await expect(page).toHaveURL(/\/login$/)
})

test('returning players go straight to their empire without loading marketing images', async ({
  page,
}) => {
  const images: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/art/landing/')) images.push(request.url())
  })
  await installGameFixture(page)
  await page.goto('/')
  await expect(page.locator('main h1')).toContainText('Empire —')
  await expect(page.locator('#mobile')).toHaveCount(0)
  expect(images).toEqual([])
})
