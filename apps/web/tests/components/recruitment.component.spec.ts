import { diagnosticScreenshot } from '../fixtures/diagnostic-screenshot'
import { test, expect } from './fixture'
for (const width of [1440, 390]) {
  test.describe(`directory controls ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })
    test('filters preserve input and focus when results become empty', async ({
      page,
      mount,
    }, info) => {
      await mount('public-alliance-directory')
      await expect(
        page.getByRole('link', { name: 'View A0', exact: true }),
      ).toBeVisible()
      const trigger = page.getByRole('button', { name: 'Filters', exact: true })
      await trigger.click()
      await expect(
        page.getByRole('checkbox', { name: 'Only show recruiting' }),
      ).toHaveCount(0)
      await page.getByLabel('Language', { exact: true }).selectOption('de')
      await expect(
        page.getByRole('heading', { name: 'No alliances match your search.' }),
      ).toBeVisible()
      await expect(page.getByLabel('Language', { exact: true })).toHaveValue(
        'de',
      )
      await page.keyboard.press('Escape')
      await expect(
        page.getByRole('button', { name: 'Filters (1)', exact: true }),
      ).toBeFocused()
      const search = page.getByRole('searchbox', { name: 'Search alliances' })
      await search.fill('missing')
      await search.press('Enter')
      await expect(page.getByLabel('Directory query')).toContainText(
        '"search":"missing"',
      )
      await expect(search).toBeFocused()
      await expect(search).toHaveValue('missing')
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
      await diagnosticScreenshot(page, {
        path: info.outputPath(`directory-empty-${width}x900.png`),
      })
      await page
        .getByRole('button', { name: 'Clear filters', exact: true })
        .click()
      await expect(
        page.getByText('23 alliances', { exact: true }),
      ).toBeVisible()
      await expect(search).toHaveValue('')
    })
  })
}
// The previously removed mobile combined-filter journey is not recreated.
test('desktop pagination resets when language and recruiting filters combine', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await mount('alliance-directory')
  const list = page.getByRole('list', { name: 'Alliances', exact: true }),
    pagination = page.getByRole('navigation', {
      name: 'Alliance directory pages',
    })
  await expect(list.locator(':scope > li')).toHaveCount(20)
  await pagination.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(list.locator(':scope > li')).toHaveCount(3)
  await page.getByRole('button', { name: 'Filters', exact: true }).click()
  await page.getByLabel('Language', { exact: true }).selectOption('en')
  await page.keyboard.press('Escape')
  await expect(page.getByText('22 alliances', { exact: true })).toBeVisible()
  await expect(
    pagination.getByRole('button', { name: 'Previous', exact: true }),
  ).toBeDisabled()
  await page.getByRole('button', { name: 'Filters (1)', exact: true }).click()
  await page.getByRole('checkbox', { name: 'Only show recruiting' }).check()
  await page.keyboard.press('Escape')
  await expect(page.getByText('21 alliances', { exact: true })).toBeVisible()
  await expect(
    page.getByText('Recruitment closed', { exact: true }),
  ).toHaveCount(0)
  await expect(page.getByLabel('Directory query')).toContainText('"all":false')
  await expect(page.getByLabel('Directory query')).toContainText(
    '"language":"en"',
  )
  const search = page.getByRole('searchbox', { name: 'Search alliances' }),
    submit = page.getByRole('button', { name: 'Search alliances', exact: true })
  await search.focus()
  await expect(search.locator('..')).toHaveCSS('outline-style', 'solid')
  const inputBox = (await search.boundingBox())!,
    buttonBox = (await submit.boundingBox())!
  expect(inputBox.height).toBeLessThanOrEqual(46)
  expect(buttonBox.height).toBeLessThanOrEqual(46)
  expect(buttonBox.x).toBeGreaterThanOrEqual(inputBox.x + inputBox.width)
})
