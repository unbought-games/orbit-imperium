import { expect, type Page } from '@playwright/test'

/** Exercise the real rich select, including opening, choosing, and dismissal. */
export async function selectBody(page: Page, id: string) {
  const trigger = page.getByRole('combobox', { name: 'Selected body' })
  await trigger.click()
  await page
    .getByRole('option')
    .and(page.locator(`[data-value="${id}"]`))
    .click()
  await expect(trigger).toHaveAttribute('data-value', id)
  await expect(page.getByRole('listbox')).toHaveCount(0)
}
