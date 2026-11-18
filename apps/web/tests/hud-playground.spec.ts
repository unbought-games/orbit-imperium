import { expect, test } from './fixtures/test'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'

const output = 'test-results/hud'
test('narrow mobile and desktop keep HUD within the intended viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/hud-playground')
  await page.getByRole('button', { name: 'Receive report', exact: true }).click()
  await page.getByRole('button', { name: /Espionage report.*Tap to decrypt/ }).click()
  const dialog = page.getByRole('dialog')
  const bounds = (await dialog.boundingBox())!
  expect(bounds.x).toBeGreaterThanOrEqual(0)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(320)
  await diagnosticScreenshot(page, { path: `${output}/report-open-320x740.png` })
  await page.getByRole('button', { name: 'Close HUD' }).click()
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(page.getByTestId('hud-orb')).not.toBeVisible()
  await expect(page.getByRole('heading', { name: 'A little universe. At your fingertips.' })).toBeVisible()
  const preview = page.frameLocator('iframe[title="Live mobile HUD prototype"]')
  await expect(preview.getByRole('button', { name: 'Send probe', exact: true })).toBeVisible()
  await diagnosticScreenshot(page, { path: `${output}/desktop-1440x900.png` })
  await preview.getByRole('button', { name: 'Send probe', exact: true }).click()
  await expect(preview.getByRole('button', { name: /Probe away/ })).toBeVisible()
  const toast = preview.getByRole('button', { name: /Probe away/ })
  await expect(toast).toHaveCSS('opacity', '1')
  const toastBounds = (await toast.boundingBox())!
  await page.mouse.move(toastBounds.x + 80, toastBounds.y + 30)
  await page.mouse.down()
  await page.mouse.move(toastBounds.x + 175, toastBounds.y + 30, { steps: 10 })
  await diagnosticScreenshot(page, { path: `${output}/swipe-desktop-1440x900.png` })
  await page.mouse.up()
  await expect(toast).toHaveCount(0)
})
