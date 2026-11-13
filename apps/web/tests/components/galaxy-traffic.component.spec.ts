import { test, expect } from './fixture'
import { diagnosticScreenshot } from '../fixtures/diagnostic-screenshot'

for (const width of [320, 390, 1280]) {
  test.describe(`Galaxy traffic at ${width}px`, () => {
    test.use({ hasTouch: width < 600 })
    test('repeated spying and flight transitions keep rows and actions stationary', async ({
      page,
      mount,
    }) => {
      await page.setViewportSize({ width, height: 844 })
      await page.clock.install({ time: 100000 })
      await page.clock.pauseAt(100000)
      await mount('galaxy-traffic')
      const rows = page.getByRole('article')
      const target = rows.first()
      const marker = target.getByRole('button', {
        name: 'Your fleets to [1:371:2] details',
        exact: true,
      })
      const spy = target.getByRole('button', {
        name: /^(Spy on|Probe requested for)/,
      })
      const dialog = page.getByRole('dialog', {
        name: 'Your fleets to [1:371:2]',
        exact: true,
      })
      const geometry = async () => ({
        rows: await rows.evaluateAll((elements) =>
          elements.map((el) => {
            const { x, y, width, height } = el.getBoundingClientRect()
            return { x, y, width, height }
          }),
        ),
        spy: await spy.boundingBox(),
        actions: await target
          .getByRole('button', { name: /^Actions for/ })
          .boundingBox(),
      })
      const initial = await geometry()
      expect((await marker.boundingBox())!.width).toBe(44)
      expect((await marker.boundingBox())!.height).toBe(44)
      await marker.focus()
      await expect(dialog).toContainText('No fleets heading to this position.')
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
      await diagnosticScreenshot(page, {
        path: `test-results/galaxy-traffic/empty-${width}x844.png`,
      })
      for (let count = 1; count <= 3; count++) {
        await spy.click()
        await expect(marker).toHaveText(`${count}2m`)
        expect(await geometry()).toEqual(initial)
        await page.clock.runFor(1400)
        await expect(spy).toBeEnabled()
        if (count === 1)
          await diagnosticScreenshot(page, {
            path: `test-results/galaxy-traffic/one-${width}x844.png`,
          })
      }
      if (width < 600) await marker.tap()
      else {
        await marker.hover()
        await page.clock.runFor(150)
      }
      await expect(dialog).toBeVisible()
      await expect(dialog.locator('li')).toHaveCount(3)
      await expect(dialog.locator('li').first()).toContainText(
        'Espionage en route',
      )
      await expect(dialog.locator('time').first()).toHaveAttribute(
        'datetime',
        /T.*Z$/,
      )
      expect(await geometry()).toEqual(initial)
      const bounds = (await dialog.boundingBox())!
      expect(bounds.x).toBeGreaterThanOrEqual(12)
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width - 12)
      expect(bounds.y).toBeGreaterThanOrEqual(0)
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(844)
      await page
        .getByRole('button', { name: 'Tick countdown' })
        .evaluate((button: HTMLButtonElement) => button.click())
      await expect(dialog.locator('li').first()).toContainText('1m 55s')
      await expect(dialog).toBeVisible()
      await diagnosticScreenshot(page, {
        path: `test-results/galaxy-traffic/details-${width}x844.png`,
      })
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
      await page
        .getByRole('button', { name: 'Pending departure', exact: true })
        .click()
      await expect(marker).toHaveText('42m')
      expect(await geometry()).toEqual(initial)
      await marker.click()
      await expect(dialog).toContainText('Transport departure pending')
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: 'Return fleets' }).click()
      await expect(marker).toHaveText('')
      const home = rows.nth(1).getByRole('button', { name: /^Your fleets/ })
      await expect(home).toHaveText('42m')
      expect(await geometry()).toEqual(initial)
      await home.click()
      await expect(
        page.getByRole('dialog', {
          name: 'Your fleets to [1:371:3]',
          exact: true,
        }),
      ).toContainText('Espionage returning')
      await page.keyboard.press('Escape')
      await diagnosticScreenshot(page, {
        path: `test-results/galaxy-traffic/returning-${width}x844.png`,
      })
      await page.getByRole('button', { name: 'Complete flights' }).click()
      await expect(home).toHaveText('')
      expect(await geometry()).toEqual(initial)
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width)
      // Keyboard activation remains available after Escape, including the empty state.
      await page.getByRole('button', { name: 'Toggle blocked harvest' }).focus()
      await page.keyboard.press('Tab')
      await expect(marker).toBeFocused()
      await expect(dialog).toBeVisible()
      await page.keyboard.press('Escape')
      await marker.press('Enter')
      await expect(dialog).toBeVisible()
      await page.getByRole('button', { name: 'Complete flights' }).click()
      await expect(dialog).toBeHidden()
    })
  })
}
