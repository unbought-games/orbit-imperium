import { test as base, expect, type Page } from '../fixtures/test'

export const test = base.extend<{
  mount: (scenario: string) => Promise<void>
  isolated: void
}>({
  isolated: [
    async ({ context }, use) => {
      const requests: string[] = []
      const errors: string[] = []
      context.on('page', (page: Page) =>
        page.on('pageerror', (error) => errors.push(error.message)),
      )
      await context.route('**/api/**', async (route) => {
        requests.push(
          `${route.request().method()} ${new URL(route.request().url()).pathname}`,
        )
        await route.abort('blockedbyclient')
      })
      await use()
      expect(
        requests,
        'An isolated component must not start application API clients',
      ).toEqual([])
      expect(errors, 'Component errors').toEqual([])
    },
    { auto: true },
  ],
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
