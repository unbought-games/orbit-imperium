import { expect, type Page, type Locator } from '@playwright/test'
import { diagnosticScreenshot } from './diagnostic-screenshot'

export async function captureVacation(
  page: Page,
  target: Page | Locator,
  options: Parameters<Page['screenshot']>[0],
) {
  if (process.env.ORBIT_TEST_SCREENSHOTS !== '1') return
  // Dismiss transient notifications through their keyboard control; the persistent
  // hostile-fleet indicator stays visible and usable throughout vacation.
  const toasts = page.getByTestId('swipeable-toast')
  while (await toasts.count()) {
    const dismissed = await toasts.first().elementHandle()
    if (!dismissed) continue
    try {
      await toasts.first().getByRole('button').press('Escape')
      // A new notification can replace this one without reducing the total.
      await expect
        .poll(() => dismissed.evaluate((node) => node.isConnected))
        .toBe(false)
    } finally {
      await dismissed.dispose()
    }
  }
  const viewport = page.viewportSize()!
  if (target !== page) {
    if (viewport.height < 1200)
      await page.setViewportSize({ ...viewport, height: 1200 })
    await (target as Locator).evaluate((element) =>
      window.scrollTo({
        top: Math.max(
          0,
          element.getBoundingClientRect().top + window.scrollY - 80,
        ),
        behavior: 'instant',
      }),
    )
    await diagnosticScreenshot(target, {
      ...options,
      path: options?.path?.toString().replace('x900.png', 'x1200.png'),
    })
    if (viewport.height < 1200) await page.setViewportSize(viewport)
  } else await diagnosticScreenshot(target, options)
}
