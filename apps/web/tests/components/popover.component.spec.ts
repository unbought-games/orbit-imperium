import { test, expect } from './fixture'

test('popover honors a changed motion preference, restores focus and submits its native form', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.clock.pauseAt(new Date('2040-01-01T00:00:00Z'))
  await mount('popover')
  const opener = page.getByRole('button', { name: 'Open action' })
  const dialog = page.getByRole('dialog', {
    name: 'Review order',
    includeHidden: true,
  })
  await opener.click()
  await expect(dialog).toBeVisible()
  await page.clock.runFor(200)
  const quantity = page.getByRole('textbox', { name: 'Quantity' })
  await expect(quantity).toBeFocused()
  await quantity.fill('12')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.keyboard.press('Escape')
  await expect(opener).toBeFocused()
  await page.clock.runFor(1)
  // With the clock paused, a stale 100ms exit cannot satisfy this assertion.
  await expect(dialog).toHaveCount(0)
  await opener.click()
  await expect(dialog).toBeVisible()
  // FloatingFocusManager queues initial focus in requestAnimationFrame.
  await page.clock.runFor(16)
  await expect(quantity).toBeFocused()
  await expect(quantity).toHaveValue('12')
  await quantity.press('Enter')
  await page.clock.runFor(1)
  await expect(dialog).toHaveCount(0)
  await expect(page.getByLabel('Submitted order')).toHaveText('12')
  await expect(opener).toBeFocused()
})
