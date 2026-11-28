import { expect, test } from './fixture'
import { id } from '../../src/test-support/bootstrap'

test('published identity opens the recorded alliance without a game session', async ({
  page,
  mount,
}) => {
  await mount('published-report')
  await page
    .getByRole('button', { name: 'Commander Vega profile details' })
    .click()
  const alliance = page.getByRole('link', {
    name: 'Alliance Original alliance [OLD]',
  })
  await expect(alliance).toBeVisible()
  await expect(alliance).toHaveAttribute(
    'href',
    `/alliances/${id(3)}/${id(85)}`,
  )
})

test('published coordinates allow copying while keeping private game destinations out of the public reader', async ({
  page,
}) => {
  await page.goto('/?scenario=published-report&coordinates=1')
  await expect(page.locator('html')).toHaveAttribute(
    'data-component-ready',
    'published-report',
  )
  await expect(page.getByText('Commander Vega', { exact: true })).toBeVisible()
  await expect(page.locator('[data-body-name]')).toHaveText(
    'Historical planet ·',
  )
  const location = page.getByText('[1:2:3]', { exact: true })
  await expect(location).toBeVisible()
  await location.click({ button: 'right' })
  await expect(
    page.getByRole('menuitem', { name: 'Copy coordinates' }),
  ).toBeVisible()
  await expect(
    page.getByRole('menuitem', { name: 'View in Galaxy' }),
  ).toHaveCount(0)
  await expect(page.locator('a[href*="/u/"]')).toHaveCount(0)
})
