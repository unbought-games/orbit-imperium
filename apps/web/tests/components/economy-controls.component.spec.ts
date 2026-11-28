import { test, expect, type Page } from './fixture'
import { diagnosticScreenshot } from '../fixtures/diagnostic-screenshot'
import type {} from './resources.scenarios'

async function openFacilities(page: Page, mode = '') {
  await page.goto(
    '/?' +
      new URLSearchParams({ scenario: 'resources', page: 'facilities', mode }),
  )
  await expect(page.locator('html')).toHaveAttribute(
    'data-component-ready',
    'resources',
  )
}

for (const width of [1440, 390]) {
  test(`machined actions preserve native links, focus and tactile presses at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await openFacilities(page)
    await page
      .getByRole('link', { name: 'Upgrade Robotics Factory', exact: true })
      .click()
    const panel = page.getByRole('region', { name: 'Progression quote' })
    const primary = panel.getByRole('button', {
      name: 'Confirm upgrade',
      exact: true,
    })
    const back = panel.getByRole('link', {
      name: 'Back to Facilities',
      exact: true,
    })
    await expect(primary).toBeEnabled()
    const faces = []
    for (const control of [primary, back]) {
      await control.evaluate((element) =>
        element.scrollIntoView({ block: 'center', behavior: 'instant' }),
      )
      const paint = await control.evaluate((element) => ({
        face: getComputedStyle(element, '::after').backgroundColor,
        faceTop: parseFloat(getComputedStyle(element, '::after').top),
        plate: getComputedStyle(element, '::before').clipPath,
        hitArea: getComputedStyle(element).clipPath,
      }))
      expect(paint.plate).toContain('polygon')
      expect(paint.hitArea).toBe('none')
      faces.push(paint.face)
      const box = (await control.boundingBox())!
      expect(box.width).toBeGreaterThanOrEqual(44)
      expect(box.height).toBeGreaterThanOrEqual(44)
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      await expect(control).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 1)')
      expect(
        await control.evaluate((element) =>
          parseFloat(getComputedStyle(element, '::after').top),
        ),
      ).toBe(paint.faceTop + 1)
      // Releasing outside cancels the native action and restores the raised face.
      await page.mouse.move(0, 0)
      await page.mouse.up()
      await expect(control).toHaveCSS('transform', 'none')
    }
    expect(faces[0]).not.toBe(faces[1])
    const tree = panel.getByRole('button', {
      name: 'Technology tree',
      exact: true,
    })
    await tree.focus()
    await page.keyboard.down('Space')
    await expect(tree).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 1)')
    await expect(tree).toHaveCSS(
      'outline-style',
      width < 768 ? 'none' : 'solid',
    )
    await page.keyboard.up('Space')
    await expect(
      page.getByRole('dialog', {
        name: 'Technology — Robotics Factory',
        exact: true,
      }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Close technology' }).click()
    await back.focus()
    await diagnosticScreenshot(page, {
      path: `test-results/machined-buttons-${width}.png`,
    })
    await page.keyboard.press('Enter')
    await expect(
      page.getByRole('link', { name: 'Upgrade Robotics Factory', exact: true }),
    ).toBeFocused()
  })
}

test('disabled and reduced-motion buttons retain honest feedback and high-contrast focus', async ({
  page,
}) => {
  await openFacilities(page, 'blocked')
  await page
    .getByRole('link', { name: 'Upgrade Robotics Factory', exact: true })
    .click()
  const primary = page.getByRole('button', {
    name: 'Confirm upgrade',
    exact: true,
  })
  await expect(primary).toBeDisabled()
  const box = (await primary.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await expect(primary).toHaveCSS('transform', 'none')
  await page.mouse.up()
  expect(await page.evaluate(() => window.resourceScene.sent)).toHaveLength(0)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const tree = page.getByRole('button', {
    name: 'Technology tree',
    exact: true,
  })
  await tree.focus()
  await page.keyboard.down('Space')
  await expect(tree).toHaveCSS('transform', 'none')
  expect(
    await tree.evaluate((element) => getComputedStyle(element, '::after').top),
  ).toBe('2px')
  await page.keyboard.up('Space')
  const close = page.getByRole('button', { name: 'Close technology' })
  await page.emulateMedia({ forcedColors: 'active' })
  await close.focus()
  await expect(close).toHaveCSS('border-top-style', 'solid')
  await expect(close).toHaveCSS('outline-style', 'solid')
  await page.keyboard.press('Enter')
  await expect(
    page.getByRole('dialog', {
      name: 'Technology — Robotics Factory',
      exact: true,
    }),
  ).not.toBeVisible()
})

test.describe('touch catalog controls', () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  })
  test('touch opens technology and returns to the real catalog row', async ({
    page,
  }) => {
    await openFacilities(page)
    await page
      .getByRole('link', { name: 'Upgrade Robotics Factory', exact: true })
      .tap()
    await page
      .getByRole('button', { name: 'Technology tree', exact: true })
      .tap()
    await page.getByRole('button', { name: 'Close technology' }).tap()
    await page
      .getByRole('link', { name: 'Back to Facilities', exact: true })
      .tap()
    await expect(
      page.getByRole('region', { name: 'Progression quote' }),
    ).toHaveCount(0)
  })
})
