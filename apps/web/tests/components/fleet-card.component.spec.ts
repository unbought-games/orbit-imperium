import { test, expect } from './fixture'
import { diagnosticScreenshot } from '../fixtures/diagnostic-screenshot'

for (const container of ['article', 'list'] as const) {
  const role = container === 'article' ? 'article' : 'listitem'
  for (const width of [390, 1280]) {
    test(`${container} fleet row keeps disclosure and confirmation controls independent at ${width}px`, async ({
      page,
      mount,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await mount(`fleet-cards-${container}`)
      const row = page.getByRole(role, { name: 'Attack fleet', exact: true })
      const toggle = row.getByRole('button', {
        name: 'Attack ship composition: 13 ships',
      })
      const link = row.getByRole('link', { name: 'View Attack outbound fleet' })
      const route = page.getByLabel('Card route')
      const original = await route.textContent()
      await expect(link).toHaveAttribute(
        'href',
        '/u/andromeda/b/00000000-0000-4000-8000-000000000005/fleets/00000000-0000-4000-8000-000000000030',
      )
      await expect(toggle).toHaveAttribute('aria-expanded', 'false')
      const idle = await row.evaluate((el) => ({
        background: getComputedStyle(el).backgroundColor,
        border: getComputedStyle(el).borderColor,
      }))
      const box = (await row.boundingBox())!
      const blank = { x: box.width / 2, y: 4 }
      await row.hover({ position: blank })
      await expect
        .poll(() => row.evaluate((el) => getComputedStyle(el).backgroundColor))
        .not.toBe(idle.background)
      await page.mouse.down()
      const target = (await toggle.boundingBox())!
      await page.mouse.move(
        target.x + target.width / 2,
        target.y + target.height / 2,
      )
      await page.mouse.up()
      await expect(route).toHaveText(original!)
      await expect(toggle).toHaveAttribute('aria-expanded', 'false')
      await toggle.hover()
      await expect
        .poll(() => row.evaluate((el) => getComputedStyle(el).backgroundColor))
        .toBe(idle.background)
      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-expanded', 'true')
      await expect(
        row.getByRole('list', { name: 'Ship composition' }),
      ).toBeVisible()
      await page.getByRole('button', { name: 'Refresh fleet snapshot' }).click()
      await expect(toggle).toHaveAttribute('aria-expanded', 'true')
      await expect(route).toHaveText(original!)
      await row.getByRole('button', { name: 'Review recall' }).click()
      await expect(
        row.getByRole('region', { name: 'Review recall' }),
      ).toBeVisible()
      await expect(page.getByLabel('Recall callbacks')).toHaveText('0')
      await row.getByRole('button', { name: 'Keep mission' }).click()
      await expect(
        row.getByRole('region', { name: 'Review recall' }),
      ).toHaveCount(0)
      await expect(route).toHaveText(original!)
      await link.focus()
      await page.keyboard.press('Tab')
      await page.keyboard.press('Shift+Tab')
      await expect(link).toBeFocused()
      await expect(row).toHaveCSS('outline-style', 'solid')
      const cargo = row.getByRole('group', { name: 'Carried resources' })
      await cargo.dispatchEvent('pointerdown', {
        button: 0,
        pointerType: 'mouse',
      })
      await cargo.evaluate((el) => {
        const selection = window.getSelection()!
        const range = document.createRange()
        range.selectNodeContents(el)
        selection.removeAllRanges()
        selection.addRange(range)
      })
      await cargo.dispatchEvent('pointerup', {
        button: 0,
        pointerType: 'mouse',
      })
      await cargo.dispatchEvent('click', { button: 0 })
      await expect(route).toHaveText(original!)
      await page.evaluate(() => window.getSelection()?.removeAllRanges())
      await row.getByRole('button', { name: 'Review recall' }).click()
      await diagnosticScreenshot(page, {
        path: `test-results/fleet-card-component-${container}-${width}x900.png`,
        fullPage: true,
      })
      await row
        .getByRole('button', { name: 'Recall fleet', exact: true })
        .click()
      await expect(page.getByLabel('Recall callbacks')).toHaveText('1')
      await expect(
        row.getByRole('button', { name: 'Recall requested' }),
      ).toBeDisabled()
      await expect(route).toHaveText(original!)
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
    })

    test(`${container} incoming card preserves intelligence disclosure and shared geometry at ${width}px`, async ({
      page,
      mount,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await mount(`fleet-cards-${container}`)
      const incoming = page.getByRole(role, {
        name: 'Incoming attack fleet',
        exact: true,
      })
      const own = page.getByRole(role, { name: 'Attack fleet', exact: true })
      const toggle = incoming.getByRole('button', {
        name: 'Incoming Attack ship composition: 30 ships',
      })
      await expect(toggle).toHaveAttribute('aria-expanded', 'false')
      await expect(
        incoming.getByRole('list', { name: 'Ship composition' }),
      ).toBeHidden()
      await expect(incoming.getByRole('timer')).toHaveText('6m 0s')
      await expect(incoming).toHaveAttribute('data-flight-tone', 'enemy')
      await expect(
        incoming.getByRole('button', { name: 'Review recall' }),
      ).toHaveCount(0)
      await expect(
        incoming.getByRole('group', { name: 'Carried resources' }),
      ).toHaveCount(0)
      for (const property of ['padding', 'border-radius', 'font-size']) {
        await expect(incoming).toHaveCSS(
          property,
          await own.evaluate(
            (el, key) => getComputedStyle(el).getPropertyValue(key),
            property,
          ),
        )
      }
      await toggle.focus()
      await toggle.press('Enter')
      await expect(
        incoming
          .getByRole('list', { name: 'Ship composition' })
          .getByRole('listitem'),
      ).toHaveText(['Cruiser 30'])
      await expect(incoming.locator('time')).toHaveAttribute(
        'datetime',
        '2026-11-01T12:06:00.000Z',
      )
      await page.getByRole('button', { name: 'Refresh fleet snapshot' }).click()
      await expect(toggle).toHaveAttribute('aria-expanded', 'true')
      await expect(incoming.getByRole('timer')).toHaveText('5m 59s')
      await page
        .getByRole('button', { name: 'Show total intelligence' })
        .click()
      await expect(
        incoming.getByRole('list', { name: 'Ship composition' }),
      ).toHaveCount(0)
      await expect(incoming).not.toContainText('Cruiser')
      await page.getByRole('button', { name: 'Hide intelligence' }).click()
      await expect(
        incoming.getByRole('button', {
          name: 'Incoming Attack ship composition: unknown',
        }),
      ).toHaveAttribute('aria-expanded', 'true')
      await expect(incoming).toContainText('Ship composition unknown')
      await incoming
        .getByRole('button', {
          name: 'Incoming Attack ship composition: unknown',
        })
        .click()
      await expect(incoming.locator('time')).toBeHidden()
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
    })
  }

  test.describe(`${container} touch`, () => {
    test.use({ hasTouch: true, viewport: { width: 390, height: 900 } })
    test('touch cancellation preserves child controls and inert row space activates its real link', async ({
      page,
      mount,
    }) => {
      await mount(`fleet-cards-${container}`)
      const row = page.getByRole(role, { name: 'Attack fleet', exact: true })
      const original = await page.getByLabel('Card route').textContent()
      const idle = await row.evaluate(
        (el) => getComputedStyle(el).backgroundColor,
      )
      await row.dispatchEvent('pointerdown', {
        button: 0,
        pointerType: 'touch',
        isPrimary: true,
      })
      await expect(row).toHaveAttribute('data-pressed', 'true')
      await row.dispatchEvent('pointercancel', {
        pointerType: 'touch',
        isPrimary: true,
      })
      await expect(row).not.toHaveAttribute('data-pressed')
      await expect(row).toHaveCSS('background-color', idle)
      await row.dispatchEvent('click', { button: 0 })
      await expect(page.getByLabel('Card route')).toHaveText(original!)
      const toggle = row.getByRole('button', {
        name: 'Attack ship composition: 13 ships',
      })
      await toggle.tap()
      await expect(toggle).toHaveAttribute('aria-expanded', 'true')
      await expect(row).not.toHaveAttribute('data-pressed')
      await expect(page.getByLabel('Card route')).toHaveText(original!)
      const box = (await row.boundingBox())!
      await page.touchscreen.tap(box.x + box.width / 2, box.y + 4)
      await expect(page.getByLabel('Card route')).toHaveText(
        '/u/andromeda/b/00000000-0000-4000-8000-000000000005/fleets/00000000-0000-4000-8000-000000000030',
      )
    })
  })
}
