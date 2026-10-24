import { diagnosticScreenshot } from './diagnostic-screenshot'
import { expect, type Page } from '@playwright/test'

/** Visit the catalog and decode its art before a full-page evidence capture. */
export async function captureCatalog(page: Page, path: string) {
  const scroll = await page.evaluate(() => ({ x: scrollX, y: scrollY }))
  await page.evaluate(() =>
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: 'instant',
    }),
  )
  await page.locator('main img').evaluateAll((images) => {
    for (const image of images) (image as HTMLImageElement).loading = 'eager'
  })
  await expect
    .poll(() =>
      page.locator('main img').evaluateAll((images) =>
        images.every((image) => {
          const img = image as HTMLImageElement
          return img.complete && img.naturalWidth > 0
        }),
      ),
    )
    .toBe(true)
  await page
    .locator('main img')
    .evaluateAll((images) =>
      Promise.all(images.map((image) => (image as HTMLImageElement).decode())),
    )
  await diagnosticScreenshot(page, { path: path.replace('.png', '-catalog-viewport.png') })
  await diagnosticScreenshot(page, { path, fullPage: true })
  await page.evaluate(
    ({ x, y }) => window.scrollTo({ left: x, top: y, behavior: 'instant' }),
    scroll,
  )
}
