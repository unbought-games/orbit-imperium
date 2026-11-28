import { test, expect } from './fixture'

test('each allied combat return remains readable with its recorded destination and loot', async ({
  page,
  mount,
}) => {
  await mount('allied-return-reader')
  const reader = page.getByRole('region', { name: 'Report observation' })
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    for (const location of ['[1:371:12]', '[1:8:9]']) {
      const summary = reader.getByText(
        'Your fleet to ' + location + ' returns',
        { exact: false },
      )
      await expect(summary).toBeVisible()
      await expect(summary).toContainText('Loot:')
      expect(
        await summary.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true)
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  }
})
