import type { Page } from '@playwright/test'

// The player entry point is temporarily hidden. Exercise the retained production
// controls explicitly so autosave, reconciliation, and recovery remain covered.
export async function openRetainedProductionSettings(page: Page) {
  await page
    .getByRole('button', {
      name: 'Resource settings',
      exact: true,
      includeHidden: true,
    })
    .evaluate((button) => (button as HTMLButtonElement).click())
}
