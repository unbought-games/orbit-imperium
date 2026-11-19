import { expect, test } from './fixture'
import { id } from '../../src/test-support/bootstrap'
import { withFixtureResponse } from '../fixtures/responses'

test('copy fallback selects the complete public URL and Escape returns focus to Share', async ({
  page,
  mount,
}) => {
  const path = `/api/v4/universes/${id(3)}/reports/${id(70)}/share`
  await page.route('**' + path, (route) => {
    expect(route.request().postDataJSON().action).toEqual({ type: 'Status' })
    return route.fulfill({
      json: {
        token: id(75),
        options: { include_identity: false, include_coordinates: false },
        viewer_revision: '1',
        header: {
          id: id(70),
          kind: 'Espionage',
          observed_at: 1000,
          read: true,
          hidden: false,
          starred: true,
          shared: true,
        },
      },
    })
  })
  await mount('report-sharing-controls')
  const trigger = page.getByRole('button', { name: 'Share report' })
  await trigger.focus()
  await withFixtureResponse(
    page,
    (res) => new URL(res.url()).pathname === path,
    () => page.keyboard.press('Enter'),
  )
  const dialog = page.getByRole('dialog', { name: 'Share an unlisted report' })
  const link = dialog.getByRole('textbox', { name: 'Share link' })
  await expect(link).toHaveValue(new RegExp('/reports/shared/' + id(75) + '$'))
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: () =>
          Promise.reject(new DOMException('Denied', 'NotAllowedError')),
      },
    })
    document.execCommand = () => false
  })
  await dialog.getByRole('button', { name: 'Copy link' }).click()
  await expect(dialog.getByRole('status')).toContainText(
    'Automatic copying is unavailable.',
  )
  await expect(link).toBeFocused()
  expect(
    await link.evaluate((input: HTMLInputElement) => [
      input.selectionStart,
      input.selectionEnd,
    ]),
  ).toEqual([0, (await link.inputValue()).length])
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    })
    document.execCommand = (name) => name === 'copy'
  })
  await dialog.getByRole('button', { name: 'Copy link' }).click()
  await expect(dialog.getByRole('status')).toContainText('Link copied.')
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    const bounds = (await dialog.boundingBox())!
    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width)
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true)
  }
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
})

test('a newer unstar while confirmation is open cannot submit the opposite action', async ({
  page,
  mount,
}) => {
  await mount('report-sharing-controls')
  const opener = page.getByRole('button', {
    name: 'Unstar report',
    exact: true,
  })
  await opener.click()
  const dialog = page.getByRole('dialog', {
    name: 'Unstar this shared report?',
  })
  await expect(dialog).toContainText(
    'Archiving from the list keeps its public link active.',
  )
  await dialog.getByRole('button', { name: 'Keep starred' }).click()
  await expect(opener).toBeFocused()
  await expect(opener).toHaveAttribute('aria-pressed', 'true')
  expect(
    await page.evaluate(() => window.reportSharingControls!.attempts()),
  ).toBe(0)
  await opener.click()
  await expect(dialog).toBeVisible()
  await page.evaluate(() => window.reportSharingControls!.receiveUnstar())
  await expect(
    page.locator('button[aria-label="Star report"]'),
  ).toHaveAttribute('aria-pressed', 'false')
  await dialog
    .getByRole('button', { name: 'Unstar report', exact: true })
    .click()
  await expect(dialog).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Star report' }),
  ).toHaveAttribute('aria-pressed', 'false')
  expect(
    await page.evaluate(() => window.reportSharingControls!.attempts()),
  ).toBe(0)
})
