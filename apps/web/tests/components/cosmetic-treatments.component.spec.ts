import { test, expect } from './fixture'
import { diagnosticScreenshot } from '../fixtures/diagnostic-screenshot'
test.use({ hasTouch: true, reducedMotion: 'no-preference' })
for (const width of [1440, 390])
  test(`treatment families retain keyboard, touch and reduced-motion appearance at ${width}px`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    await mount('cosmetic-treatments')
    for (const [family, count] of [
      ['surface', 24],
      ['light', 20],
      ['interaction', 16],
    ] as const) {
      await page.getByLabel('Family').selectOption(family)
      await expect(page.getByRole('img', { name: / preview$/ })).toHaveCount(
        count,
      )
      if (family === 'interaction') {
        const tilt = page.getByRole('img', {
          name: 'tilt preview',
          exact: true,
        })
        await tilt.focus()
        await expect(tilt).toHaveAttribute('data-active', 'true')
        await tilt.tap()
        await expect(tilt).toBeFocused()
      }
      await diagnosticScreenshot(page, {
        path: `test-results/cosmetic-${family}-${width}x1000.png`,
        fullPage: true,
      })
    }
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(page.locator('[data-family=interaction]').first()).toHaveCSS(
      'animation-name',
      'none',
    )
    await diagnosticScreenshot(page, {
      path: `test-results/cosmetic-static-${width}x1000.png`,
      fullPage: true,
    })
  })
