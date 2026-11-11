import { test, expect } from './fixture'
test('full page preview uses unsaved content and restores editor focus on Escape', async ({
  page,
  mount,
}) => {
  await mount('alliance-presentation')
  const draft = page.getByRole('textbox', {
      name: 'Invitation draft',
      exact: true,
    }),
    trigger = page.getByRole('button', { name: 'Preview', exact: true })
  await draft.fill('Our unsaved invitation')
  await trigger.click()
  const dialog = page.getByRole('dialog', {
    name: 'Preview · unsaved changes',
    exact: true,
  })
  await expect(
    dialog.getByText('Our unsaved invitation', { exact: true }),
  ).toBeVisible()
  await expect(
    dialog.getByRole('button', { name: 'Apply to the Veil', exact: true }),
  ).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(trigger).toBeFocused()
  await expect(draft).toHaveValue('Our unsaved invitation')
})
