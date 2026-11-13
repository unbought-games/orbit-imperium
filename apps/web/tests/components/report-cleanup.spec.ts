import { test, expect } from './fixture'

test('archive shortcut ignores typing and owned keys, then archives once from checkbox focus', async ({
  page,
}) => {
  await page.goto('/report-observation.html?scenario=cleanup')
  await expect(page.locator('html')).toHaveAttribute(
    'data-component-ready',
    'cleanup',
  )
  await page.keyboard.press('e')
  await expect(page.getByLabel('Submitted commands')).toHaveText('0')
  await page.getByRole('button', { name: 'Select loaded reports (2)' }).click()
  await page
    .getByRole('button', { name: 'Read report help', exact: true })
    .focus()
  await page.keyboard.press('e')
  await expect(page.getByLabel('Submitted commands')).toHaveText('0')
  await page
    .locator('dialog')
    .evaluate((dialog: HTMLDialogElement) => dialog.showModal())
  await page
    .getByRole('button', { name: 'Read modal help', exact: true })
    .focus()
  await page.keyboard.press('e')
  // Even input dispatched outside a native modal must not activate the page.
  await page
    .locator('main')
    .dispatchEvent('keydown', { key: 'e', bubbles: true })
  await expect(page.getByLabel('Submitted commands')).toHaveText('0')
  await page
    .locator('dialog')
    .evaluate((dialog: HTMLDialogElement) => dialog.close())
  for (const label of [
    'Report note',
    'Report draft',
    'Report kind',
    'Rich note',
  ]) {
    await page.getByLabel(label).focus()
    await page.keyboard.press('e')
  }
  await page.getByLabel('Keyboard focus').focus()
  for (const key of ['Control+e', 'Meta+e', 'Alt+e', 'Shift+e', 'r']) {
    await page.keyboard.press(key)
  }
  await page.getByLabel('Keyboard focus').evaluate((element) => {
    for (const options of [{ repeat: true }, { isComposing: true }]) {
      element.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'e', bubbles: true, ...options }),
      )
    }
    const prevented = new KeyboardEvent('keydown', {
      key: 'e',
      bubbles: true,
      cancelable: true,
    })
    prevented.preventDefault()
    element.dispatchEvent(prevented)
  })
  await expect(page.getByLabel('Submitted commands')).toHaveText('0')
  await expect(
    page.getByRole('list', { name: 'Visible reports' }).getByRole('listitem'),
  ).toHaveText(['one', 'two', 'protected'])
  await expect(
    page.getByRole('dialog', { name: 'Nonmodal report help', exact: true }),
  ).toBeVisible()
  await page.keyboard.press('e')
  await expect(
    page.getByRole('list', { name: 'Visible reports' }).getByRole('listitem'),
  ).toHaveText(['protected'])
  await page.keyboard.press('e')
  await expect(page.getByLabel('Submitted commands')).toHaveText('1')
  await page.getByRole('button', { name: 'Deliver rejection' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(
    page.getByRole('list', { name: 'Visible reports' }).getByRole('listitem'),
  ).toHaveText(['one', 'two', 'protected'])
})

for (const mode of ['rejected', 'uncertain'] as const) {
  test(`bulk ${mode} result restores every report and preserves the selection for review`, async ({
    page,
  }) => {
    await page.goto('/report-observation.html?scenario=cleanup')
    await expect(page.locator('html')).toHaveAttribute(
      'data-component-ready',
      'cleanup',
    )
    const rows = page
      .getByRole('list', { name: 'Visible reports' })
      .getByRole('listitem')
    await expect(rows).toHaveText(['one', 'two', 'protected'])
    await page
      .getByRole('button', { name: 'Select loaded reports (2)' })
      .click()
    await expect(
      page.getByRole('group', { name: 'Report selection' }),
    ).toContainText('2 selected')
    await page.getByRole('button', { name: 'Archive selected (2)' }).click()
    await expect(page.getByLabel('Submitted commands')).toHaveText('1')
    await expect(rows).toHaveText(['protected'])
    await expect(page.getByLabel('Stored archive flags')).toHaveText(
      'false,false,false',
    )
    await expect(
      page.getByRole('button', { name: 'Cancel selection' }),
    ).toBeDisabled()
    await page
      .getByRole('button', {
        name: mode === 'rejected' ? 'Deliver rejection' : 'Deliver uncertainty',
      })
      .click()
    await expect(rows).toHaveText(['one', 'two', 'protected'])
    await expect(page.getByRole('alert')).toHaveText(
      'Cleanup stopped. Check the remaining reports before trying again.',
    )
    await expect(
      page.getByRole('group', { name: 'Report selection' }),
    ).toContainText('2 selected')
    await expect(
      page.getByRole('button', { name: 'Cancel selection' }),
    ).toBeEnabled()
    await expect(page.getByLabel('Submitted commands')).toHaveText('1')
    await expect(page.getByLabel('Stored archive flags')).toHaveText(
      'false,false,false',
    )
  })
}
