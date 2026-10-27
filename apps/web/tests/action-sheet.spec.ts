import { expect, test, type Page } from './fixtures/test'

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Planet actions', exact: true })
const sheet = (page: Page) => page.getByRole('region', { name: 'Planet actions sheet', exact: true })
const handle = (page: Page) => page.getByRole('button', { name: 'Resize action sheet', exact: true })
const background = (page: Page) => page.getByLabel('Orbit preview background')
async function topAt(page: Page, top: number) {
  await expect.poll(async () => (await sheet(page).boundingBox())?.y).toBeCloseTo(top, 0)
}
async function open(page: Page, mode = 'snap') {
  await page.getByRole('button', { name: `Open ${mode} sheet`, exact: true }).click()
  await expect(dialog(page)).toBeVisible()
  await topAt(page, 444)
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/action-sheet-playground')
})

test('half, compact, extra, and full stops preserve bottom anchoring and the page reveal', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.getByRole('combobox', { name: 'Snap points', exact: true }).selectOption('extra')
  await open(page)
  await expect(handle(page)).toBeFocused()
  const handleBox = (await handle(page).boundingBox())!
  expect(handleBox.height).toBeGreaterThanOrEqual(44)
  await handle(page).press('End')
  await topAt(page, 44)
  const surface = (await background(page).boundingBox())!
  expect(surface.y).toBeCloseTo(12, 0)
  expect(surface.y + surface.height).toBeCloseTo(844, 0)
  const full = (await sheet(page).boundingBox())!
  expect(full.y + full.height).toBeGreaterThan(844)
  await handle(page).press('ArrowDown')
  await topAt(page, 204)
  await handle(page).press('ArrowDown')
  await topAt(page, 444)
  await handle(page).press('Home')
  await topAt(page, 744)
  await expect(page.getByRole('button', { name: 'Dismiss sheet', exact: true })).toBeInViewport()
  await page.keyboard.press('Escape')
  await expect(dialog(page)).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'Open snap sheet', exact: true })).toBeFocused()
  expect(await background(page).evaluate(el => el.style.transform)).toBe('')
  expect(errors).toEqual([])
})

test('working form, independent scrolling, focus containment and saved draft', async ({ page }) => {
  await open(page)
  await page.getByLabel('Planet name', { exact: true }).fill('New Aster')
  await topAt(page, 44)
  await page.getByRole('combobox', { name: 'Primary mission', exact: true }).selectOption('harvest')
  await page.getByLabel('Notes', { exact: true }).fill('Bring recyclers')
  await page.getByLabel('Show fleet notifications', { exact: true }).uncheck()
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press('Tab')
    expect(await dialog(page).evaluate(el => el.contains(document.activeElement))).toBe(true)
  }
  const lower = page.getByRole('button', { name: 'Close from content', exact: true })
  await lower.scrollIntoViewIfNeeded()
  await expect(lower).toBeInViewport()
  await topAt(page, 44)
  expect(await dialog(page).evaluate(el => el.scrollTop)).toBe(0)
  await page.getByRole('button', { name: 'Save preferences', exact: true }).click()
  await expect(dialog(page)).not.toBeVisible()
  await expect(page.getByRole('status')).toHaveText('Saved New Aster in this preview.')
  await open(page)
  await expect(page.getByLabel('Planet name', { exact: true })).toHaveValue('New Aster')
  await page.getByRole('button', { name: 'Dismiss sheet', exact: true }).click()
  await expect(dialog(page)).not.toBeVisible()
})

test('backdrop dismissal and unmount release scroll locking and restore focus', async ({ page }) => {
  await open(page)
  expect(await page.evaluate(() => document.body.style.position)).toBe('fixed')
  await page.mouse.click(10, 200)
  await expect(dialog(page)).not.toBeVisible()
  expect(await page.evaluate(() => document.body.style.position)).toBe('')
  await page.getByRole('button', { name: 'Open from below', exact: true }).click()
  await expect(dialog(page)).toBeVisible()
  const scrollBefore = await background(page).evaluate(el => el.scrollTop)
  expect(scrollBefore).toBeGreaterThan(0)
  await handle(page).press('End')
  await topAt(page, 44)
  await page.getByRole('button', { name: 'Unmount preview sheet', exact: true }).click()
  await expect(dialog(page)).toHaveCount(0)
  expect(await background(page).evaluate(el => el.scrollTop)).toBe(scrollBefore)
  expect(await background(page).evaluate(el => el.style.transform)).toBe('')
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('')
  await expect(page.getByRole('button', { name: 'Open from below', exact: true })).toBeFocused()
  // Remount with open=true under StrictMode: a queued close event must not close the new sheet.
  await page.getByRole('button', { name: 'Open from below', exact: true }).click()
  await topAt(page, 444)
  await expect(handle(page)).toBeFocused()
})

test('freeform drag retains its release height and content gestures never drag the sheet', async ({ page }) => {
  await open(page, 'freeform')
  const box = (await handle(page).boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + 24)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, box.y + 24 - 137, { steps: 16 })
  await page.mouse.up()
  await topAt(page, 307)
  await handle(page).press('ArrowUp')
  await topAt(page, 227)
  await handle(page).press('End')
  await topAt(page, 44)
  await page.getByLabel('Notes', { exact: true }).hover()
  await page.mouse.wheel(0, 500)
  await expect(page.getByRole('button', { name: 'Close from content', exact: true })).toBeInViewport()
  await topAt(page, 44)
})

test('resizing and keyboard-like visual viewport changes retain usable, bottom-anchored content', async ({ page }) => {
  await open(page)
  await page.setViewportSize({ width: 375, height: 667 })
  await topAt(page, 355.5)
  await page.getByLabel('Planet name', { exact: true }).focus()
  await topAt(page, 44)
  await page.getByLabel('Notes', { exact: true }).focus()
  // Exercise the same visualViewport events delivered by a software keyboard.
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport, 'height', { configurable: true, value: 360 })
    Object.defineProperty(window.visualViewport, 'offsetTop', { configurable: true, value: 25 })
    window.visualViewport!.dispatchEvent(new Event('resize'))
    window.visualViewport!.dispatchEvent(new Event('scroll'))
  })
  await topAt(page, 69)
  const bounds = (await dialog(page).boundingBox())!
  expect(bounds.y).toBe(25)
  expect(bounds.height).toBe(360)
  await expect(page.getByLabel('Notes', { exact: true })).toBeInViewport()
  await page.getByLabel('Notes', { exact: true }).fill('Keyboard check')
  expect(await dialog(page).evaluate(el => el.scrollTop)).toBe(0)
})

test('reduced motion uses immediate stops with no background scale', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await open(page)
  await handle(page).press('End')
  await topAt(page, 44)
  expect((await background(page).boundingBox())?.y).toBe(0)
  await page.keyboard.press('Escape')
  await expect(dialog(page)).not.toBeVisible()
})

test('custom maximum and desktop layout keep all controls accessible', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Snap points', exact: true }).selectOption('compact')
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.getByRole('button', { name: 'Open snap sheet', exact: true }).click()
  await topAt(page, 600.4)
  await handle(page).press('End')
  await topAt(page, 215.2)
  expect((await sheet(page).boundingBox())?.width).toBe(640)
  await page.getByLabel('Planet name', { exact: true }).fill('Desktop check')
  await topAt(page, 215.2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('native dialog closure releases scroll locking and restores the opener', async ({ page }) => {
  await open(page)
  // Native method="dialog" forms and requestClose() use this close path.
  await dialog(page).evaluate((element: HTMLDialogElement) => element.close())
  await expect(dialog(page)).not.toBeVisible()
  await expect.poll(() => page.evaluate(() => document.body.style.position)).toBe('')
  await expect(page.getByRole('button', { name: 'Open snap sheet', exact: true })).toBeFocused()
  await open(page)
  await expect(handle(page)).toBeFocused()
})

for (const touch of [false, true]) {
  test.describe(touch ? 'touch focus styling' : 'desktop focus styling', () => {
    test.use({ hasTouch: touch, isMobile: touch })

    test('sheet and form focus outlines follow the mobile policy without losing focus', async ({ page }) => {
      // Safari does not focus clicked buttons; keyboard activation establishes
      // the focused opener whose restoration this test checks on both engines.
      const opener = page.getByRole('button', { name: 'Open snap sheet', exact: true })
      await opener.focus()
      await opener.press('Enter')
      await expect(dialog(page)).toBeVisible()
      await topAt(page, 444)
      await expect(handle(page)).toBeFocused()
      await expect(handle(page)).toHaveCSS('outline-style', 'none')
      for (const width of [767, 768, 1024, 390]) {
        await page.setViewportSize({ width, height: 844 })
        const outline = touch || width < 768 ? 'none' : 'solid'
        for (const control of [
          handle(page),
          page.getByRole('button', { name: 'Dismiss sheet', exact: true }),
          page.getByLabel('Planet name', { exact: true }),
          page.getByRole('combobox', { name: 'Primary mission', exact: true }),
        ]) {
          // Keyboard modality exercises :focus-visible even after touch/click.
          await page.keyboard.press('Tab')
          await control.focus()
          await expect(control).toBeFocused()
          await expect(control).toHaveCSS('outline-style', outline)
        }
      }
      await page.keyboard.press('Escape')
      await expect(page.getByRole('button', { name: 'Open snap sheet', exact: true })).toBeFocused()
    })
  })
}
