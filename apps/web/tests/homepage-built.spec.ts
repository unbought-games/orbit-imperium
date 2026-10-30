import { test, expect } from './fixtures/test'
import {
  attachFailureScreenshots,
  diagnosticScreenshot,
} from './fixtures/diagnostic-screenshot'

for (const signup of [true, false]) {
  const filename = signup ? 'homepage.html' : 'homepage-closed.html'
  test(`built homepage exposes complete content and styles in raw HTML, registration ${signup}`, async ({
    request,
  }) => {
    const response = await request.get(`/${filename}`)
    expect(response.ok()).toBe(true)
    const html = await response.text()
    for (const content of [
      'Persistent multiplayer space strategy',
      'Build planets. Plan your next move.',
      'Develop your economy',
      'Choose your research',
      'Commit your fleets',
      'Play on your phone.',
      'Fair play',
      'Built in the open',
      'Start with your first planet.',
      'https://github.com/unbought-games/orbit-imperium',
      'href="/updates/index.html"',
    ])
      expect(html).toContain(content)
    expect(html.includes('href="/signup"')).toBe(signup)
    expect(html).toContain('href="/login"')
    const styles = [
      ...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g),
    ]
    expect(styles.length).toBeGreaterThan(0)
    const css = await Promise.all(
      styles.map(async ([, href]) => {
        const asset = await request.get(href)
        expect(asset.ok()).toBe(true)
        return asset.text()
      }),
    )
    // Hero/layout styles must be available without executing a module import.
    const heroClass = html.match(/class="([^"]*heroTitle[^" ]*)"/)?.[1]
    expect(heroClass).toBeTruthy()
    expect(css.join('\n')).toContain(heroClass!.split(' ').at(-1))
  })

  for (const javaScriptEnabled of [false, true]) {
    for (const width of [390, 1440]) {
      test(`built homepage registration ${signup}, JS ${javaScriptEnabled}, ${width}x900`, async ({
        browser,
        baseURL,
      }, testInfo) => {
        const context = await browser.newContext({
          baseURL,
          javaScriptEnabled,
          viewport: { width, height: 900 },
        })
        const page = await context.newPage()
        let gameStartup = false
        page.on('request', (request) => {
          if (request.url().includes('/assets/start-game-')) gameStartup = true
        })
        const errors: string[] = []
        page.on('pageerror', (error) => errors.push(error.message))
        page.on('console', (message) => {
          if (message.type() === 'error') errors.push(message.text())
        })
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
        await page.route('**/', async (route) => {
          const response = await context.request.get(`/${filename}`)
          const html = (await response.text()).replace(
            '<script id="orbit-bootstrap" type="application/json"></script>',
            `<script id="orbit-bootstrap" type="application/json">${JSON.stringify({ version: 1, signup_enabled: signup, result: { status: 'anonymous' } })}</script>`,
          )
          await route.fulfill({ contentType: 'text/html', body: html })
        })
        try {
          await page.goto('/')
          await expect(page.getByRole('heading', { level: 1 })).toHaveText(
            'Victory isn’t for sale.',
          )
          await expect(page.locator('a[href="/signup"]')).toHaveCount(
            signup ? 3 : 0,
          )
          await expect(
            page.getByRole('heading', { name: 'Fair play', exact: true }),
          ).toBeVisible()
          if (javaScriptEnabled) {
            // The title effect confirms the client has hydrated; skip-link focus
            // verifies React attached handlers to the prerendered markup.
            await expect(page).toHaveTitle(
              'Orbit Imperium — Multiplayer Space Strategy Game',
            )
            await page.keyboard.press('Tab')
            await page.keyboard.press('Enter')
            await expect(page.locator('main')).toBeFocused()
            expect(new URL(page.url()).hash).toBe('')
          }
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
          ).toBe(true)
          for (const img of await page.locator('img').all()) {
            await img.scrollIntoViewIfNeeded()
            await expect
              .poll(() =>
                img.evaluate(
                  (image: HTMLImageElement) =>
                    image.complete && image.naturalWidth > 0,
                ),
              )
              .toBe(true)
          }
          await page.evaluate(() => window.scrollTo(0, 0))
          await diagnosticScreenshot(page, {
            path: `test-results/homepage-${signup ? 'open' : 'closed'}-js-${javaScriptEnabled}-${width}x900.png`,
            fullPage: true,
          })
          expect(errors).toEqual([])
          expect(gameStartup).toBe(false)
          await page.getByRole('link', { name: 'Log in', exact: true }).click()
          await expect(page).toHaveURL(/\/login$/)
          if (javaScriptEnabled) {
            await expect(
              page.getByRole('button', { name: 'Sign in', exact: true }),
            ).toBeVisible()
            await expect(page.locator('link[rel="canonical"]')).toHaveCount(0)
          }
          expect(errors).toEqual([])
        } catch (error) {
          await attachFailureScreenshots([page], testInfo)
          throw error
        } finally {
          await context.close()
        }
      })
    }
  }
}
