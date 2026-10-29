import { test, expect } from './fixtures/test'
import { body, shellFixture } from './fixtures/game'

test.use({
  isMobile: true,
  hasTouch: true,
  viewport: { width: 390, height: 844 },
})

for (const mode of ['ios-installed', 'ios-browser', 'other-browser'] as const) {
  test(`${mode} applies zoom prevention only to the iOS Home Screen app`, async ({ page, context, browserName }) => {
    await page.addInitScript((mode) => {
      if (mode !== 'other-browser') {
        Object.defineProperty(navigator, 'standalone', {
          value: mode === 'ios-installed',
        })
      }
    }, mode)
    await shellFixture(page)
    const installed = mode === 'ios-installed'
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content')
    if (installed) {
      expect(viewport).toContain('maximum-scale=1')
      expect(viewport).toContain('user-scalable=no')
    } else {
      expect(viewport).toBe('width=device-width, initial-scale=1')
    }
    await expect(page.locator('html')).toHaveCSS('touch-action', installed ? 'pan-x pan-y' : 'auto')
    // Exercise the WebKit gesture fallback without cancelling ordinary touch input.
    for (const type of ['gesturestart', 'gesturechange', 'touchstart', 'touchmove', 'touchend']) {
      const cancelled = await page.locator('main').evaluate((element, type) => {
        const event = new Event(type, { bubbles: true, cancelable: true })
        element.dispatchEvent(event)
        return event.defaultPrevented
      }, type)
      expect(cancelled).toBe(installed && type.startsWith('gesture'))
    }
    // Chromium can inject two-finger input; WebKit's driver only exposes taps.
    if (browserName === 'chromium') {
      const session = await context.newCDPSession(page)
      await session.send('Emulation.setTouchEmulationEnabled', {
        enabled: true,
        maxTouchPoints: 2,
      })
      for (let step = 0; step <= 10; step++) {
        await session.send('Input.dispatchTouchEvent', {
          type: step === 0 ? 'touchStart' : 'touchMove',
          touchPoints: [
            { id: 0, x: 150 - step * 6, y: 350 },
            { id: 1, x: 240 + step * 6, y: 350 },
          ],
        })
        await page.evaluate(() => new Promise(requestAnimationFrame))
      }
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      const scale = () => page.evaluate(() => window.visualViewport!.scale)
      if (installed) await expect.poll(scale).toBe(1)
      else await expect.poll(scale).toBeGreaterThan(1)
      await session.detach()
    }
  })
}

test('iOS installed app keeps scrolling, fixed navigation and menu taps after resizing', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'standalone', { value: true })
  })
  await shellFixture(page, { protocol: 4 })
  const dock = page.getByRole('navigation', { name: 'Main navigation', exact: true })
  await dock.getByRole('link', { name: 'Develop', exact: true }).tap()
  await expect(page.locator('main h1')).toHaveText('Resources')
  let exercisedScroll = false
  for (const height of [844, 640, 844]) {
    await page.setViewportSize({ width: 390, height })
    for (const y of [0, 250, 100000]) {
      await page.evaluate(y => window.scrollTo(0, y), y)
      await expect.poll(async () => {
        const box = (await dock.boundingBox())!
        return box.y + box.height
      }).toBe(height)
      expect((await page.getByRole('group', { name: 'Planet and resources' }).boundingBox())!.y).toBe(0)
      // The shorter resource catalog can fit in the tall viewport. Verify the
      // exact reachable scroll position, and require real scrolling below.
      const limit = await page.evaluate(() => Math.max(0, document.documentElement.scrollHeight - innerHeight))
      const expected = Math.min(y, limit)
      await expect.poll(() => page.evaluate(() => scrollY)).toBe(expected)
      exercisedScroll ||= expected > 0
    }
  }
  expect(exercisedScroll).toBe(true)
  await dock.getByRole('button', { name: 'Menu', exact: true }).tap()
  const menu = page.getByRole('dialog', { name: 'Navigation', exact: true })
  await expect(menu).toBeVisible()
  await menu.getByRole('link', { name: 'Settings', exact: true }).tap()
  await expect(page.locator('main h1')).toHaveText('Settings')
  await expect(menu).not.toBeVisible()
})

test('installation from a deep link declares the whole game as a standalone app', async ({
  page,
}) => {
  await shellFixture(page)
  const manifestLink = page.locator('link[rel="manifest"]')
  await expect(manifestLink).toHaveAttribute('href', '/manifest.webmanifest')
  const manifestURL = new URL(
    (await manifestLink.getAttribute('href')) as string,
    page.url(),
  )
  const response = await page.request.get(manifestURL.href)
  expect(response.ok()).toBe(true)
  expect(response.headers()['content-type']).toContain(
    'application/manifest+json',
  )
  const manifest = await response.json()
  expect(manifest).toMatchObject({
    id: '/',
    name: 'Orbit Imperium',
    start_url: '/',
    scope: '/',
    display: 'standalone',
  })
  await expect(
    page.locator('meta[name="apple-mobile-web-app-capable"]'),
  ).toHaveAttribute('content', 'yes')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    'content',
    manifest.theme_color,
  )
  for (const icon of manifest.icons) {
    const url = new URL(icon.src, manifestURL)
    expect(url.origin).toBe(manifestURL.origin)
    const response = await page.request.get(url.href)
    expect(response.ok()).toBe(true)
    expect(response.headers()['content-type']).toContain(icon.type)
    const dimensions = await page.evaluate(async (src) => {
      const image = new Image()
      image.src = src
      await image.decode()
      return `${image.naturalWidth}x${image.naturalHeight}`
    }, url.href)
    if (icon.sizes !== 'any') expect(dimensions).toBe(icon.sizes)
  }

  // Public entry points must expose the same installation metadata too.
  for (const path of ['/', '/login', '/signup']) {
    const entry = await page.request.get(new URL(path, page.url()).href)
    expect(entry.ok()).toBe(true)
    expect(await entry.text()).toContain('href="/manifest.webmanifest"')
  }
})

test('mobile game navigation stays in the same document and app scope', async ({
  page,
  context,
}) => {
  await shellFixture(page, { extraCapabilities: ['Transport'] })
  const originalDocument = await page.evaluateHandle(() => document)
  const pages = context.pages().length
  const origin = new URL(page.url()).origin

  for (const [destination, path] of [
    ['Develop', `/u/andromeda/b/${body.id}/resources`],
    ['Facilities', `/u/andromeda/b/${body.id}/facilities`],
    ['Fleets', `/u/andromeda/b/${body.id}/fleets`],
    ['Settings', '/u/andromeda/settings'],
    ['Empire', `/u/andromeda/b/${body.id}/overview`],
  ]) {
    if (destination === 'Settings') {
      await page.getByRole('button', { name: 'Menu', exact: true }).tap()
      await page
        .getByRole('dialog', { name: 'Navigation', exact: true })
        .getByRole('link', { name: destination, exact: true })
        .tap()
    } else {
      const nav = page.getByRole('navigation', { name: destination === 'Facilities' ? 'Develop navigation' : 'Main navigation', exact: true })
      await nav.getByRole('link', { name: destination, exact: true }).tap()
    }
    await expect(page).toHaveURL(
      (url) => url.origin === origin && url.pathname === path,
    )
    expect(
      await page.evaluate(
        (original) => document === original,
        originalDocument,
      ),
    ).toBe(true)
    expect(context.pages()).toHaveLength(pages)
  }
  await originalDocument.dispose()
})
