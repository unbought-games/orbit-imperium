import { test as base } from '@playwright/test'
import { captureFailureScreenshots } from './diagnostic-screenshot'

export * from '@playwright/test'

export const test = base.extend<{ failureScreenshots: void }>({
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
