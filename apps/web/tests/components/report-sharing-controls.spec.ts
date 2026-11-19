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

test('publishing and revoking a private report link leaves its confirmed star on the real toolbar', async ({
  page,
}) => {
  const path = `/api/v4/universes/${id(3)}/reports/${id(70)}/share`
  const token = id(75)
  const actions: string[] = []
  let published = false,
    starred = false
  await page.route('**' + path, async (route) => {
    const req = route.request()
    if (req.method() !== 'POST') return route.fallback()
    expect(req.headers()['x-csrf-token']).toBe('csrf')
    const { context, action } = req.postDataJSON()
    expect(context.binding).toEqual({
      account: id(1),
      player: id(2),
      universe: id(3),
      epoch: id(4),
    })
    if (action.type === 'Create') {
      expect(action.options).toEqual({
        include_identity: false,
        include_coordinates: false,
      })
      published = true
      starred = true
    } else if (action.type === 'Revoke') published = false
    else if (action.type !== 'Status') return route.fallback()
    actions.push(action.type)
    return route.fulfill({
      json: {
        token: published ? token : null,
        options: published
          ? { include_identity: false, include_coordinates: false }
          : null,
        viewer_revision: String(actions.length),
        header: {
          id: id(70),
          kind: 'Espionage',
          observed_at: 1000,
          read: true,
          hidden: false,
          starred,
          shared: published,
        },
      },
    })
  })
  await page.goto('/?scenario=report-sharing-controls&unpublished')
  await expect(page.locator('html')).toHaveAttribute(
    'data-component-ready',
    'report-sharing-controls',
  )
  const trigger = page.getByRole('button', {
    name: 'Share report',
    exact: true,
  })
  const delivered = (action: () => Promise<unknown>) =>
    withFixtureResponse(
      page,
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === path,
      action,
    )
  await trigger.focus()
  await delivered(() => page.keyboard.press('Enter'))
  const create = page.getByRole('button', { name: 'Create share link' })
  await expect(create).toBeVisible()
  await expect(
    page.getByRole('checkbox', { name: 'Include player and planet names' }),
  ).not.toBeChecked()
  await expect(
    page.getByRole('checkbox', {
      name: 'Include coordinates (target and origins)',
    }),
  ).not.toBeChecked()
  await delivered(() => create.click())
  await expect(page.getByRole('textbox', { name: 'Share link' })).toHaveValue(
    new URL(`/reports/shared/${token}`, page.url()).href,
  )
  await delivered(() =>
    page.getByRole('button', { name: 'Stop sharing', exact: true }).click(),
  )
  await expect(create).toBeVisible()
  expect(actions).toEqual(['Status', 'Create', 'Revoke'])
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  await expect(
    page.getByRole('button', { name: 'Unstar report', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
})
