import type { Locator, Page } from '@playwright/test'

/** Player names navigate on click. Exercise their keyboard hover card instead.
 * Tab establishes keyboard modality and leaves an Escape-dismissed reference
 * before focusing it again; focus() alone on an already-focused link emits no event.
 */
export async function focusPlayerDetails(page: Page, link: Locator) {
  await page.keyboard.press('Tab')
  await link.focus()
}
