import { test, expect } from './fixture'
import { diagnosticScreenshot } from '../fixtures/diagnostic-screenshot'

const rows = (page: import('@playwright/test').Page) =>
  page.getByRole('region', { name: 'Galaxy positions' }).getByRole('listitem')

for (const width of [1440, 390]) {
  test(`deuterium debris and quick harvest at ${width}`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    await mount('galaxy-position')
    const mixed = rows(page)
      .nth(0)
      .getByRole('button', { name: /^Quick harvest debris/ })
    const only = rows(page)
      .nth(2)
      .getByRole('button', { name: /^Quick harvest debris/ })
    await expect(mixed).toHaveAccessibleName(/Deuterium 60,000/)
    await expect(only).toHaveAccessibleName(
      /Metal 0, Crystal 0, Deuterium 40,001/,
    )
    await expect(
      mixed.getByRole('img', { name: 'Deuterium', exact: true }),
    ).toHaveAttribute('data-resource', 'deuterium')
    for (const [trigger, needed] of [
      [mixed, '27'],
      [only, '3'],
    ] as const) {
      await trigger.click()
      const form = page.getByRole('dialog', {
        name: 'Harvest mission',
        exact: true,
      })
      await expect(form).toBeVisible()
      if (width === 390) {
        const panel = form.getByRole('region', {
          name: 'Harvest mission sheet',
          exact: true,
        })
        await expect
          .poll(async () => (await panel.boundingBox())?.y)
          .toBeCloseTo(522, 0)
      } else {
        await expect(form.locator(':scope > div').first()).toHaveCSS(
          'opacity',
          '1',
        )
      }
      await expect(
        form.getByRole('textbox', { name: 'Recyclers', exact: true }),
      ).toHaveValue(needed)
      await expect(form).toContainText(`${needed} needed to collect all debris`)
      await expect(
        form.getByRole('button', { name: 'Send', exact: true }),
      ).toBeEnabled()
      await expect(
        form.getByRole('img', { name: 'Deuterium', exact: true }),
      ).toBeVisible()
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width)
      await diagnosticScreenshot(page, {
        path: `test-results/galaxy-position-deuterium-${needed}-${width}x1000.png`,
      })
      await page.keyboard.press('Escape')
      await expect(form).not.toBeVisible()
    }
  })

  test(`zero debris deuterium stays hidden in galaxy and quick harvest at ${width}`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mount('galaxy-position')
    for (const index of [3, 4]) {
      const trigger = rows(page)
        .nth(index)
        .getByRole('button', { name: /^Quick harvest debris/ })
      await expect(trigger).not.toHaveAccessibleName(/Deuterium/)
      await expect(
        trigger.getByRole('img', { name: 'Deuterium', exact: true }),
      ).toHaveCount(0)
      await expect(
        trigger.getByRole('img', { name: 'Metal', exact: true }),
      ).toBeVisible()
      await expect(
        trigger.getByRole('img', { name: 'Crystal', exact: true }),
      ).toBeVisible()
    }
    await rows(page)
      .nth(3)
      .getByRole('button', { name: /^Quick harvest debris/ })
      .click()
    const form = page.getByRole('dialog', {
      name: 'Harvest mission',
      exact: true,
    })
    await expect(form).toBeVisible()
    await expect(
      form.getByRole('img', { name: 'Deuterium', exact: true }),
    ).toHaveCount(0)
    await expect(
      form.getByRole('img', { name: 'Metal', exact: true }),
    ).toBeVisible()
    await expect(
      form.getByRole('img', { name: 'Crystal', exact: true }),
    ).toBeVisible()
    await expect(
      form.getByRole('textbox', { name: 'Recyclers', exact: true }),
    ).toHaveValue('24')
    await expect(
      form.getByRole('button', { name: 'Send', exact: true }),
    ).toBeEnabled()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width)
  })
}

for (const width of [390, 1280]) {
  test(`debris art and amounts open quick harvest with keyboard access at ${width}px`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mount('galaxy-position')
    const originalUrl = page.url()
    const trigger = rows(page)
      .first()
      .getByRole('button', { name: /^Quick harvest debris/ })
    const dialog = page.getByRole('dialog', {
      name: 'Harvest mission',
      exact: true,
    })
    await expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')
    const buttonBox = (await trigger.boundingBox())!
    const amountsBox = (await trigger.locator(':scope > span').boundingBox())!
    expect(buttonBox.x + buttonBox.width).toBeCloseTo(
      amountsBox.x + amountsBox.width,
      1,
    )
    if (width === 1280) expect(buttonBox.width).toBeLessThan(160)
    await trigger.focus()
    await expect(trigger).toBeFocused()
    await trigger.locator('img').click()
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Debris at [1:371:2]')
    await expect(
      dialog.getByRole('textbox', { name: 'Recyclers', exact: true }),
    ).toHaveValue('27')
    await expect(
      dialog.getByRole('button', { name: 'Send', exact: true }),
    ).toBeEnabled()
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
    await expect(trigger).toBeFocused()
    await trigger
      .getByText(width === 390 ? '300K' : '300,000', { exact: true })
      .filter({ visible: true })
      .click()
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(trigger).toBeFocused()
    for (const key of ['Enter', 'Space']) {
      await trigger.press(key)
      await expect(dialog).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(dialog).not.toBeVisible()
      await expect(trigger).toBeFocused()
    }
    await expect(page).toHaveURL(originalUrl)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width)
  })

  test(`debris quick harvest preserves blocked mission explanations at ${width}px`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mount('galaxy-position')
    await page.getByRole('button', { name: 'Toggle blocked harvest' }).click()
    await rows(page)
      .first()
      .getByRole('button', { name: /^Quick harvest debris/ })
      .click()
    const dialog = page.getByRole('dialog', {
      name: 'Harvest mission',
      exact: true,
    })
    await expect(dialog).toContainText('No recyclers available')
    await expect(dialog).toContainText('No fleet slots available')
    await expect(
      dialog.getByRole('button', { name: 'Send', exact: true }),
    ).toBeDisabled()
  })
}
