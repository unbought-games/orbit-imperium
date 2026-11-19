import { test, expect } from './fixtures/test'

import { body, installGameFixture } from './fixtures/game'

async function anonymous(page: import('@playwright/test').Page, signup = true) {
  await page.route('**/api/auth/entry*', (route) =>
    route.fulfill({
      status: 303,
      headers: {
        location:
          new URL(route.request().url()).searchParams.get('signup') === 'true'
            ? '/signup'
            : '/login',
      },
    }),
  )
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

test(
  'returning players go straight to their empire without loading marketing images',
  { tag: '@journey' },
  async ({ page }) => {
    const images: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/art/landing/')) images.push(request.url())
    })
    await installGameFixture(page)
    await page.route('**/', async (route) => {
      const response = await route.fetch()
      await route.fulfill({
        response,
        body: (await response.text()).replace(
          '</head>',
          '<link data-orbit-home-head rel="canonical" href="https://community.example/"><meta data-orbit-home-head property="og:url" content="https://community.example/"></head>',
        ),
      })
    })
    await page.goto('/')
    // Initial bootstrap and cold Vite compilation finish before the game route
    // renders. Synchronize with the redirect before checking its content.
    await page.waitForURL(`/u/andromeda/b/${body.id}/overview`)
    await expect(page.locator('main h1')).toContainText('Empire —')
    await expect(page.locator('#mobile')).toHaveCount(0)
    await expect(page.locator('[data-orbit-home-head]')).toHaveCount(0)
    expect(images).toEqual([])
  },
)

test('SPA navigation between authentication and home scopes metadata to home', async ({
  page,
}) => {
  await anonymous(page)
  await page.goto('/login')
  await page.getByRole('link', { name: 'Orbit Imperium', exact: true }).click()
  await expect(page).toHaveTitle(
    'Orbit Imperium — Multiplayer Space Strategy Game',
  )
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(1)
  await page.getByRole('link', { name: 'Log in', exact: true }).click()
  await expect(page).toHaveTitle('Sign in · Orbit Imperium')
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0)
})
