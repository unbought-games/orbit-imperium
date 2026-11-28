import { expect, test } from './fixture'
import { id } from '../../src/test-support/bootstrap'
import type {} from './report-triage.scenario'
test('a refused report detail retries the same observation without leaving the current document', async ({
  page,
}) => {
  await page.goto('/?scenario=report-triage&details')
  await expect(page.locator('html')).toHaveAttribute(
    'data-component-ready',
    'report-triage',
  )
  const report = id(71)
  const row = page
    .getByRole('article')
    .filter({ has: page.locator(`a[href$="/${report}"]`) })
  await expect(row).toBeVisible()
  await page.evaluate(() => {
    const port = window.reportTriage.port
    const read = port.report!.bind(port)
    let first = true
    port.report = async (...args) => {
      if (first) {
        first = false
        throw { status: 503, code: 'Unavailable' }
      }
      return read(...args)
    }
  })
  await row.locator(`a[href$="/${report}"]`).click()
  await expect(page.getByRole('alert')).toContainText('Unable to load reports')
  let navigations = 0
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations++
  })
  await page.getByRole('button', { name: 'Retry reports', exact: true }).click()
  await expect(
    page.getByRole('region', { name: 'Report observation' }),
  ).toBeVisible()
  await expect(page.getByLabel('Mounted report route')).toContainText(report)
  expect(navigations).toBe(0)
})
