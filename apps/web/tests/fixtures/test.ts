import { test as base, type BrowserContext } from '@playwright/test'
import { captureFailureScreenshots } from './diagnostic-screenshot'

export * from '@playwright/test'

export const test = base.extend<{
  failureScreenshots: void
  /** Most fixtures use an empty runtime feed; announcement tests supply their own. */
  announcements: 'empty' | 'custom'
  announcementHistory: void
}>({
  announcements: ['empty', { option: true }],
  announcementHistory: [
    async ({ browser, context, announcements }, use) => {
      if (announcements === 'custom') return use()
      const installEmptyFeed = (target: BrowserContext) =>
        target.route('**/api/announcements', route => route.fulfill({ json: { schema: 1, announcements: [] } }))
      await installEmptyFeed(context)
      // Tests that open extra contexts get the same default.
      const newContext = browser.newContext
      browser.newContext = async (...args) => {
        const created = await newContext.apply(browser, args)
        await installEmptyFeed(created)
        return created
      }
      try {
        await use()
      } finally {
        browser.newContext = newContext
      }
    },
    { auto: true },
  ],
  failureScreenshots: [
    async ({ context }, use, testInfo) => {
      await use()
      const pages =
        context
          .browser()
          ?.contexts()
          .flatMap((item) => item.pages()) ?? context.pages()
      await captureFailureScreenshots(pages, testInfo)
    },
    { auto: true },
  ],
})
