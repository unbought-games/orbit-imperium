import { test, expect } from './fixture'
import { accountLinks } from '../../src/features/account-links'
import { diagnosticScreenshot } from '../fixtures/diagnostic-screenshot'
for (const width of [320, 390, 768, 1440]) {
  test(`landing page shows genuine desktop and phone images without overflow at ${width}px`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width, height: 844 })
    await mount('public-layout')
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
    await page
      .getByRole('heading', { name: 'Play on your phone.' })
      .scrollIntoViewIfNeeded()
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
      page
        .getByRole('region', { name: 'Start with your first planet.' })
        .getByRole('link', { name: 'Play free', exact: true }),
    ).toHaveAttribute('href', accountLinks.signup)
    await diagnosticScreenshot(page, {
      path: `test-results/landing-${width}.png`,
      fullPage: true,
    })
    await diagnosticScreenshot(page.locator('#mobile'), {
      path: `test-results/landing-mobile-section-${width}.png`,
    })
  })
}

for (const signup of [true, false]) {
  test(`landing header offers immediate account access with registration ${signup ? 'open' : 'closed'}`, async ({
    page,
  }) => {
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 844 })
      await page.goto(`/?scenario=public-layout&signup=${signup}`)
      const header = page.locator('header')
      const account = header.getByRole('navigation', { name: 'Player account' })
      const login = account.getByRole('link', { name: 'Log in', exact: true })
      await expect(login).toBeInViewport()
      await expect(login).toHaveAttribute('href', accountLinks.login)
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
          await expect(register).toHaveAttribute('href', accountLinks.signup)
        } else {
          await expect(register).toBeHidden()
          await expect(
            page
              .getByRole('navigation', { name: 'Get started' })
              .getByRole('link', { name: 'Play free', exact: true }),
          ).toBeVisible()
        }
      } else {
        await expect(
          header.locator('a[href="/api/auth/entry?signup=true"]'),
        ).toHaveCount(0)
      }
      await diagnosticScreenshot(header, {
        path: `test-results/compact-header-${width}-${signup}.png`,
      })
    }
  })
}
