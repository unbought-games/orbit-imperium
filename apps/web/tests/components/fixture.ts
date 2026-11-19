import { test as base, expect } from '../fixtures/test'

export const test = base.extend<{
  mount: (scenario: string) => Promise<void>
}>({
  boundary: 'component',
  mount: async ({ page }, use) => {
    await use(async (scenario) => {
      await page.goto(`/?scenario=${encodeURIComponent(scenario)}`)
      await expect(page.locator('html')).toHaveAttribute(
        'data-component-ready',
        scenario,
      )
    })
  },
})
export { expect } from '../fixtures/test'
export type { Page, Locator } from '@playwright/test'
