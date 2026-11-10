import { test, expect } from './fixture'
import { diagnosticScreenshot } from '../fixtures/diagnostic-screenshot'

// Mounts the existing isolated detail preview through the parent's shared harness.
// No application bootstrap or network fixture is involved.
for (const width of [390, 1280]) {
  test(`manufacturing keeps its form anchored through blank and invalid quantities at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 950 })

    for (const [scene, itemName, quantityLabel] of [
      ['ship-ready', 'Small Cargo', 'Shipyard quantity'],
      ['defense-queued', 'Rocket Launcher', 'Defenses quantity'],
    ]) {
      await page.goto(`/detail-playground?scene=${scene}`)
      const order = page.getByRole('region', { name: 'New order', exact: true })
      const input = order.getByRole('textbox', { name: quantityLabel })
      const build = order.getByRole('button', { name: 'Build', exact: true })
      await expect(build).toBeEnabled()
      await input.scrollIntoViewIfNeeded()
      await input.click()
      const position = async () =>
        input.evaluate((el) => {
          const rect = el.getBoundingClientRect()
          return { top: rect.top + window.scrollY, height: rect.height }
        })
      const before = await position()
      const labels = [
        'Production duration per unit',
        'Order',
        'Estimated start',
        'Order complete',
        'New order cost',
      ]
      await input.press('Backspace')
      await expect(input).toHaveValue('')
      for (const value of [
        '',
        '0',
        '-1',
        '1.5',
        'abc',
        '9223372036854775808',
      ]) {
        if (value) await input.fill(value)
        await expect(input).toBeFocused()
        await expect(order.locator('dt')).toHaveText(labels)
        await expect(build).toBeDisabled()
        await expect(
          order.getByRole('button', { name: 'Retry', exact: true }),
        ).toHaveCount(0)
        await expect(
          order
            .locator('dt')
            .filter({ hasText: /^Order$/ })
            .locator('..'),
        ).toHaveText('Order—')
        expect(await position()).toEqual(before)
        if (value === '')
          await diagnosticScreenshot(order, {
            path: `test-results/quantity-edit-${scene}-${width}.png`,
          })
      }
      await input.fill('2')
      await expect(build).toBeEnabled()
      await expect(order).toContainText(`2 × ${itemName}`)
      expect(await position()).toEqual(before)
      await input.fill('999999')
      await expect(build).toBeDisabled()
      await expect(page.getByLabel('Missing resources')).toBeVisible()
      expect(await position()).toEqual(before)
      await expect(page.getByText(/Preview only:/)).toHaveCount(0)
    }
  })
}
