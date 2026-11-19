import { expect, test } from './fixture'

test('report notices disclose older failures, retry the uncertain row and return dismissal focus', async ({
  page,
  mount,
}) => {
  await mount('report-triage')
  const rows = page.getByRole('article')
  await expect(rows).toHaveCount(5)
  await page.evaluate(() => {
    const { port } = window.reportTriage
    const submit = port.submit
    let calls = 0
    port.receipt = async () => {
      throw { status: 404 }
    }
    port.submit = async (envelope) => {
      calls++
      if (calls === 1)
        return {
          protocol: 4,
          binding: envelope.binding,
          command_id: envelope.command_id,
          status: 'Rejected',
          code: 'NotFound',
          admitted_at: 1000,
          executed_at: 1000,
        }
      if (calls === 2) throw { status: 503, code: 'Unavailable' }
      return submit(envelope)
    }
  })
  const banner = page.getByTestId('game-error-banner')
  const first = rows.nth(0)
  await first.getByRole('button', { name: 'Archive report' }).click()
  await expect(banner.getByRole('alert')).toContainText(
    'Action rejected: Not Found',
  )
  await expect(
    first.getByRole('button', { name: 'Archive report' }),
  ).toBeEnabled()
  await expect(first).not.toContainText('Action rejected')
  const second = rows.nth(1)
  const secondPath = await second.getByRole('link').first().getAttribute('href')
  await second.getByRole('button', { name: 'Archive report' }).press('Enter')
  const retry = banner.getByRole('button', { name: 'Retry order' })
  await expect(retry).toBeEnabled()
  await expect(
    second.getByRole('button', { name: 'Archive report' }),
  ).toBeDisabled()
  await expect(second).not.toContainText('We’re checking')
  await expect(rows).toHaveCount(5)
  const disclosure = banner.getByText('1 more order needs attention')
  await expect(banner.getByRole('group', { name: 'Order status' })).toHaveCount(
    1,
  )
  await disclosure.press('Enter')
  await expect(banner.getByRole('group', { name: 'Order status' })).toHaveCount(
    2,
  )
  await retry.click()
  await expect
    .poll(() =>
      page.evaluate(() => {
        const { model, headers } = window.reportTriage
        return model.store.getState().reportHeaders.get(headers[1].id)?.header
          .hidden
      }),
    )
    .toBe(true)
  await expect(rows).toHaveCount(4)
  await expect(rows.locator(`a[href="${secondPath}"]`)).toHaveCount(0)
  await expect(banner.getByRole('alert')).toContainText(
    'Action rejected: Not Found',
  )
  await banner
    .getByRole('button', { name: 'Dismiss order notices' })
    .press('Enter')
  await expect(banner.getByRole('group', { name: 'Order status' })).toHaveCount(
    0,
  )
  await expect(
    page
      .getByRole('heading', { level: 1, name: 'Reports', exact: true })
      .first(),
  ).toBeFocused()
})

test('a throttled selection keeps a single quiet countdown and requires a fresh archive gesture', async ({
  page,
  mount,
}) => {
  await mount('report-triage')
  const rows = page.getByRole('article')
  await expect(rows).toHaveCount(5)
  const banner = page.getByTestId('game-error-banner')
  await page.evaluate(() => {
    const { port, submissions } = window.reportTriage
    const submit = port.submit
    port.submit = async (envelope) => {
      submissions.push(envelope)
      port.submit = submit
      throw { status: 429, code: 'RateLimited', retryAfterMs: 60_000 }
    }
  })
  await page.getByRole('button', { name: 'Select loaded reports (5)' }).click()
  const archive = page.getByRole('button', { name: 'Archive selected (4)' })
  await archive.click()
  await expect(archive).toBeDisabled()
  await expect(rows).toHaveCount(5)
  await expect(
    banner.getByText('Orders are coming in too fast. Try again in 60 seconds.'),
  ).toHaveAttribute('aria-live', 'off')
  const announcement = banner
    .getByRole('status')
    .filter({ hasText: 'Wait for the countdown, then try again.' })
  await expect(announcement).toHaveCount(1)
  const initial = await announcement.textContent()
  await expect(
    page.getByText(/Cleanup stopped|Unable to refresh your empire/),
  ).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Retry order' })).toHaveCount(0)
  await page.evaluate(() => window.reportTriage.advance(59_000))
  await expect(
    banner.getByText('Orders are coming in too fast. Try again in 1 second.'),
  ).toHaveAttribute('aria-live', 'off')
  await expect(announcement).toHaveText(initial!)
  await page.evaluate(() => window.reportTriage.advance(1_000))
  await expect(
    banner
      .locator('p[aria-live=off]')
      .filter({ hasText: 'Cooldown over. Refreshing your empire…' }),
  ).toBeVisible()
  await page.evaluate(() => window.reportTriage.model.refresh())
  await expect(banner.getByRole('alert')).toHaveText(
    'Cooldown over. Retry the remaining selected reports when you’re ready.',
  )
  await expect(archive).toBeEnabled()
  expect(
    await page.evaluate(() => window.reportTriage.submissions.length),
  ).toBe(1)
  await archive.click()
  await expect(rows).toHaveCount(1)
  await expect(
    rows.getByRole('button', { name: 'Archive report' }),
  ).toBeDisabled()
  await expect(banner.locator('[data-error-entry]')).toHaveCount(0)
  const ids = await page.evaluate(() =>
    window.reportTriage.submissions.map((order) => order.command_id),
  )
  expect(ids).toHaveLength(2)
  expect(ids[0]).not.toBe(ids[1])
})
