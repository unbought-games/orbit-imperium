import { test, expect } from '@playwright/test'
import { binding, body, shellFixture } from './fixtures/game'

test.use({
  isMobile: true,
  hasTouch: true,
  viewport: { width: 390, height: 844 },
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
    ['Build', `/u/${binding.universe}/b/${body.id}/resources`],
    ['Facilities', `/u/${binding.universe}/b/${body.id}/facilities`],
    ['Fleet', `/u/${binding.universe}/fleets`],
    ['Settings', `/u/${binding.universe}/settings`],
    ['World', `/u/${binding.universe}/b/${body.id}/overview`],
  ]) {
    if (destination === 'Settings') {
      await page.getByRole('button', { name: 'Menu', exact: true }).tap()
      await page
        .getByRole('dialog', { name: 'Navigation', exact: true })
        .getByRole('link', { name: destination, exact: true })
        .tap()
    } else {
      await page.getByRole('link', { name: destination, exact: true }).tap()
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
