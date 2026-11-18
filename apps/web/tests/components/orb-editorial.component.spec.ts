import { expect, test } from './fixture'
import { diagnosticScreenshot } from '../fixtures/diagnostic-screenshot'
import { longAnnouncement } from '../fixtures/editorial'
const output = 'test-results/orb-announcement'

for (const [width, height] of [
  [1440, 900],
  [390, 844],
]) {
  test(`long announcement stays above the orb and scrolls independently ${width}x${height}`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width, height })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mount('orb-announcement')
    const bubble = page.getByRole('dialog', { name: longAnnouncement.title })
    await expect(bubble).toBeVisible()
    await expect(bubble.getByRole('listitem')).toHaveCount(3)
    await expect(bubble.locator('img')).toHaveJSProperty('complete', true)
    await expect(
      bubble.getByRole('link', { name: 'Read the update' }),
    ).toHaveAttribute('href', '/updates/research-network.html')
    // Lazy editorial content changes the bubble height before the positioner's
    // ResizeObserver repositions it. Visibility/image readiness is not placement.
    await expect(bubble).toBeInViewport({ ratio: 1 })
    await diagnosticScreenshot(page, {
      path: `${output}/open-${width}x${height}.png`,
    })
    const box = (await bubble.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(width)
    expect(box.y + box.height).toBeLessThanOrEqual(height)
    const orbBounds = (await page.getByTestId('command-orb').boundingBox())!
    expect(box.y + box.height).toBeLessThanOrEqual(orbBounds.y)
    const content = bubble.getByRole('region', { name: 'Announcement content' })
    const dismiss = bubble.getByRole('button', { name: 'Got it' })
    await expect(dismiss).toBeInViewport({ ratio: 1 })
    const pageScroll = await page.evaluate(() => window.scrollY)
    await content.hover()
    await page.mouse.wheel(0, 10000)
    await expect(content).toHaveJSProperty(
      'scrollTop',
      await content.evaluate((el) => el.scrollHeight - el.clientHeight),
    )
    await expect(
      bubble.getByText('The final announcement paragraph.'),
    ).toBeInViewport()
    await page.mouse.wheel(0, 500)
    // Wait for the browser to process the boundary wheel event before checking
    // that it did not chain into the game's document scroll.
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    )
    expect(await page.evaluate(() => window.scrollY)).toBe(pageScroll)
    await expect(dismiss).toBeInViewport({ ratio: 1 })
    await diagnosticScreenshot(page, {
      path: `${output}/scrolled-${width}x${height}.png`,
    })
    await bubble.getByRole('button', { name: 'Got it' }).click()
    await expect(bubble).toHaveCount(0)
    const orb = page.getByTestId('command-orb')
    await expect(orb).toBeFocused()
  })
}

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`updated caption announces the addressed text and respects ${reducedMotion} motion`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width: 320, height: 740 })
    await page.emulateMedia({ reducedMotion })
    await mount('orb-refresh')
    const caption = page.getByTestId('orb-caption')
    await expect(caption).toHaveText('Welcome back, Commander.')
    await expect(page.getByRole('status')).toHaveText(
      'Welcome back, Commander.',
    )
    await expect(page.getByRole('status')).toHaveAttribute(
      'aria-atomic',
      'true',
    )
    const pulse = page.getByTestId('orb-refresh-pulse')
    await expect(pulse).toHaveAttribute('aria-hidden', 'true')
    await expect(pulse.locator('span').first()).toHaveCSS(
      'animation-name',
      reducedMotion === 'reduce' ? 'none' : /refreshWave/,
    )
    await expect(caption).toBeInViewport({ ratio: 1 })
    await page.setViewportSize({ width: 1440, height: 900 })
    await expect(page.getByTestId('command-orb')).toBeInViewport({ ratio: 1 })
  })
}

test('a long personality caption fits the narrow viewport and shows the whole line with reduced motion', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mount('orb-personality')
  const caption = page.getByTestId('orb-caption')
  await expect(caption).toHaveText('Good thing we sent the bad one.')
  await expect(caption).toBeInViewport({ ratio: 1 })
  await expect(caption.locator('span')).toHaveCSS('animation-name', 'none')
  expect(
    await caption
      .locator('span')
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true)
})
