import { accountLinks } from '../src/features/account-links'
import { test, expect } from './fixtures/test'
import { attachFailureScreenshots } from './fixtures/diagnostic-screenshot'

for (const signup of [true, false]) {
  const filename = signup ? 'homepage.html' : 'homepage-closed.html'
  test(`built homepage exposes complete content and styles in raw HTML, registration ${signup}`, async ({
    request,
  }) => {
    const response = await request.get(`/${filename}`)
    expect(response.ok()).toBe(true)
    const html = await response.text()
    for (const content of [
      'Multiplayer space strategy',
      'An ending worth playing for.',
      'Seasonal Universes',
      'permanent rewards and recognition',
      'Build through the season',
      'One final campaign',
      'A permanent legacy',
      'Eternal Universes are coming.',
      'Join Discord',
      'Build planets. Plan your next move.',
      'Develop your economy',
      'Choose your research',
      'Commit your fleets',
      'Play on your phone.',
      'Fair play',
      'Built in the open',
      'Start with your first planet.',
      'Questions about Orbit Imperium',
      'Other players can attack while you’re away',
      'Where is the official Orbit Imperium game?',
      'https://github.com/unbought-games/orbit-imperium',
      'href="/updates/index.html"',
    ])
      expect(html).toContain(content)
    expect(html.includes('href="/api/auth/entry?signup=true"')).toBe(signup)
    expect(html).toContain('href="/api/auth/entry"')
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
        await page.route('**/api/auth/config', (route) =>
          route.request().method() !== 'GET'
            ? route.fallback()
            : route.fulfill({ json: { mode: 'local', universes: [] } }),
        )
        await page.route(
          (url) => url.pathname === '/api/auth/entry',
          (route) =>
            route.request().method() !== 'GET'
              ? route.fallback()
              : route.fulfill({
                  status: 303,
                  headers: {
                    location:
                      new URL(route.request().url()).searchParams.get(
                        'signup',
                      ) === 'true'
                        ? '/signup'
                        : '/login',
                  },
                }),
        )
        await page.route('**/api/v1/bootstrap', (route) =>
          route.request().method() !== 'GET'
            ? route.fallback()
            : route.fulfill({
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
          await expect(
            page.locator('a[href="/api/auth/entry?signup=true"]'),
          ).toHaveCount(signup ? 4 : 0)
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
          await page
            .getByRole('link', { name: 'How our universes work' })
            .click()
          const universes = page.getByRole('region', {
            name: 'An ending worth playing for.',
          })
          await expect(
            universes.getByRole('heading', { level: 2 }),
          ).toBeInViewport()
          await expect(universes).toContainText(
            'Our official servers run Seasonal Universes:',
          )
          await expect(universes).toContainText(
            'We’re not there yet, and we don’t have a launch date.',
          )
          const discord = universes.getByRole('link', {
            name: 'Join Discord',
          })
          await expect(discord).toHaveAttribute(
            'href',
            'https://discord.gg/AVMHp7jUcw',
          )
          await expect(
            universes.getByRole('link', {
              name: 'come play in the current universe',
            }),
          ).toHaveAttribute(
            'href',
            signup ? accountLinks.signup : accountLinks.login,
          )
          await expect(discord.locator('img')).toHaveAttribute(
            'src',
            '/brand/discord-symbol-white.svg',
          )
          await discord.focus()
          await page.keyboard.press('Tab')
          await page.keyboard.press('Shift+Tab')
          await expect(discord).toBeFocused()

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

          expect(errors).toEqual([])
          expect(gameStartup).toBe(false)
          if (signup && javaScriptEnabled && width === 1440) {
            await page.emulateMedia({ reducedMotion: 'no-preference' })
            const cue = page.locator('a[href="#universes"] svg')
            const cueLink = page.getByRole('link', {
              name: 'How our universes work',
              exact: true,
            })
            const hero = page.getByRole('heading', { level: 1 })
            await hero.hover()
            expect(
              await cue.evaluate(
                (element) => getComputedStyle(element).animationName,
              ),
            ).toBe('none')
            await expect
              .poll(() =>
                cue.evaluate((element) => getComputedStyle(element).transform),
              )
              .toBe('none')
            // Hover the label, not the icon: the whole link owns the motion.
            await cueLink.getByText('How our universes work').hover()
            await expect
              .poll(() =>
                cue.evaluate((element) => getComputedStyle(element).transform),
              )
              .toBe('matrix(1, 0, 0, 1, 0, 4)')
            await hero.hover()
            await expect
              .poll(() =>
                cue.evaluate((element) => getComputedStyle(element).transform),
              )
              .toBe('none')
            await cueLink.focus()
            await expect
              .poll(() =>
                cue.evaluate((element) => getComputedStyle(element).transform),
              )
              .toBe('matrix(1, 0, 0, 1, 0, 4)')
            const news = page
              .getByRole('navigation', { name: 'News and community' })
              .getByRole('link', { name: /What’s new/ })
            const arrow = news.locator(':scope > svg')
            await news.hover()
            await expect
              .poll(() =>
                arrow.evaluate(
                  (element) => getComputedStyle(element).transform,
                ),
              )
              .not.toBe('none')
            expect(
              await arrow.evaluate(
                (element) => getComputedStyle(element).transitionDuration,
              ),
            ).not.toBe('0s')
            await page.emulateMedia({ reducedMotion: 'reduce' })
            await cueLink.hover()
            expect(
              await cue.evaluate(
                (element) => getComputedStyle(element).transform,
              ),
            ).toBe('none')
            await expect
              .poll(() =>
                cue.evaluate((element) => element.getAnimations().length),
              )
              .toBe(0)
            expect(
              await arrow.evaluate(
                (element) => getComputedStyle(element).transitionDuration,
              ),
            ).toBe('0s')
            expect(
              await page.evaluate(
                () => getComputedStyle(document.documentElement).scrollBehavior,
              ),
            ).toBe('auto')
          }
          // New answers must be usable with the keyboard even without JS.
          // Keep this interaction to one registration state per viewport.
          if (signup && !javaScriptEnabled) {
            const questions = page.getByRole('region', {
              name: 'Questions about Orbit Imperium',
            })
            const offline = questions.locator('details').filter({
              hasText: 'What happens when I’m offline?',
            })
            await offline.locator('summary').focus()
            await page.keyboard.press('Enter')
            await expect(offline).toHaveAttribute('open', '')
            await expect(
              offline.getByText(/Other players can attack/),
            ).toBeVisible()

            await page.keyboard.press('Enter')
            await expect(offline).not.toHaveAttribute('open', '')
          }
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
