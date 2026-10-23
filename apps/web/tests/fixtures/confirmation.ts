import { expect, type Page } from '@playwright/test'

export async function confirmCancellation(page: Page) {
  const dialog = page.getByRole('dialog', { name: /^Cancel (construction|research)\?$/ })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Confirm cancellation', exact: true }).click()
}
