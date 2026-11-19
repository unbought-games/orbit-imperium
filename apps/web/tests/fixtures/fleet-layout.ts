import { expect, type Page } from './test'

/** Measure the same delivered route at both widths without submitting another fleet order. */
export async function expectFleetPageFits(page: Page, widths: number[]) {
  const previous = page.viewportSize()!
  for (const width of widths) {
    await page.setViewportSize({ ...previous, width })
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true)
  }
  await page.setViewportSize(previous)
}
