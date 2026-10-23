import { expect, type Page } from '@playwright/test'

export async function openProductionSettings(page: Page) {
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Navigation' })
    .getByRole('link', { name: 'Resource settings', exact: true })
    .click()
  await expect(
    page.getByRole('region', { name: 'Production controls' }),
  ).toBeVisible()
}
