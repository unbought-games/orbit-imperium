import { test as base, type BrowserContext } from '@playwright/test'
import { captureFailureScreenshots } from './diagnostic-screenshot'

export * from '@playwright/test'

export const test = base.extend<{
  failureScreenshots: void
  /** Curated orb announcements are real build content; most tests opt out. */
  announcements: 'seen' | 'unseen'
  announcementHistory: void
}>({
  announcements: ['seen', { option: true }],
  announcementHistory: [
    async ({ browser, context, announcements }, use) => {
      if (announcements === 'unseen') return use()
      const markSeen = (target: BrowserContext) =>
        target.addInitScript(() => {
          const getItem = Storage.prototype.getItem
          Storage.prototype.getItem = function (key: string) {
            return key.startsWith('orbit.announcement.v1:')
              ? 'seen'
              : getItem.call(this, key)
          }
        })
      await markSeen(context)
      // Tests that open extra contexts get the same default.
      const newContext = browser.newContext
      browser.newContext = async (...args) => {
        const created = await newContext.apply(browser, args)
        await markSeen(created)
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
