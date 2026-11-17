import { test, expect, type Locator } from './fixture'
async function selectionIs(target: Locator, disabled: boolean) {
  await expect(target).toBeVisible()
  if (disabled) await expect(target).toHaveCSS('-webkit-user-select', 'none')
  else await expect(target).not.toHaveCSS('-webkit-user-select', 'none')
}

for (const touch of [true, false]) {
  test.describe(touch ? 'touch editing' : 'desktop editing', () => {
    test.use({
      hasTouch: touch,
      isMobile: touch,
      viewport: { width: touch ? 390 : 1440, height: 900 },
    })
    test('detail descriptions, quantity editing, technology tabs and sheet notes retain native selection', async ({
      page,
      mount,
    }) => {
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      await page.goto('/detail-playground?scene=mine-ready')
      await selectionIs(page.locator('figcaption p'), false)
      await page.goto('/detail-playground?scene=ship-ready')
      const quantity = page.locator('input[inputmode="numeric"]').first()
      await expect(quantity).toBeVisible()
      await selectionIs(quantity, false)
      if (touch) await expect(quantity).toHaveCSS('-webkit-user-select', 'text')
      await quantity.fill('12')
      await quantity.selectText()
      await page.keyboard.type('3')
      await expect(quantity).toHaveValue('3')
      await selectionIs(page.locator('figcaption p'), false)
      await page
        .getByRole('button', { name: 'Technology tree', exact: true })
        .click()
      const technology = page.getByRole('dialog', {
        name: 'Technology — Small Cargo',
        exact: true,
      })
      await expect(technology).toBeVisible()
      if (touch)
        await selectionIs(
          technology.getByRole('tab', { name: 'Techtree', exact: true }),
          true,
        )
      await mount('action-sheet')
      await page
        .getByRole('button', { name: 'Open snap sheet', exact: true })
        .click()
      const sheet = page.getByRole('dialog', {
        name: 'Planet actions',
        exact: true,
      })
      const notes = sheet.getByLabel('Notes', { exact: true })
      await notes.fill('Selectable notes')
      await selectionIs(notes, false)
      if (touch) await expect(notes).toHaveCSS('-webkit-user-select', 'text')
      await notes.selectText()
      await page.keyboard.type('Edited notes')
      await expect(notes).toHaveValue('Edited notes')
    })
  })
}
