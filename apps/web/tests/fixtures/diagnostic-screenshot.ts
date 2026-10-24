import type { Locator, Page, TestInfo } from '@playwright/test'

/** Named evidence for visual inspection; routine failures use the test fixture. */
export async function diagnosticScreenshot(
  target: Page | Locator,
  options: Parameters<Page['screenshot']>[0],
): Promise<void> {
  if (process.env.ORBIT_TEST_SCREENSHOTS !== '1') return
  await target.screenshot(options)
}

/** Capture only after failure is known, before the context fixture closes pages. */
export async function captureFailureScreenshots(
  pages: Page[],
  testInfo: TestInfo,
) {
  if (
    testInfo.status === testInfo.expectedStatus ||
    testInfo.status === 'skipped'
  )
    return
  await attachFailureScreenshots(pages, testInfo)
}

/** Also used inside catch blocks when a test closes its own context in finally. */
export async function attachFailureScreenshots(
  pages: Page[],
  testInfo: TestInfo,
) {
  for (const [index, page] of pages.entries()) {
    if (page.isClosed()) continue
    try {
      const name = `failure-${index + 1}`
      const path = testInfo.outputPath(`${name}.png`)
      await page.screenshot({ path, timeout: 5_000 })
      await testInfo.attach(name, {
        path,
        contentType: 'image/png',
      })
    } catch (error) {
      // A crashed page must not replace the original assertion failure.
      testInfo.annotations.push({
        type: 'screenshot-error',
        description: String(error),
      })
    }
  }
}
