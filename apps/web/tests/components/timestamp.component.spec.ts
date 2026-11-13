import { test, expect } from './fixture'

test.use({ locale: 'en-US', timezoneId: 'America/New_York' })

test('timestamp supports keyboard selection, exact copying, composed triggers and shared view control', async ({
  page,
  context,
  mount,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.clock.pauseAt(new Date('2026-11-13T20:00:00Z'))
  await mount('timestamp')
  const trigger = page.getByRole('button', { name: 'Fleet return time' })
  await expect(trigger).toHaveText('Home in 2m 11s')
  await expect(
    page.getByRole('button', { name: 'Report time', exact: true }),
  ).toHaveText('5m ago')
  await trigger.focus()
  await page.keyboard.press('Enter')
  const popup = page.getByRole('dialog', { name: 'Time display' })
  await expect(popup).toBeVisible()
  await expect(popup.locator('button[aria-pressed]')).toHaveCount(3)
  await expect(popup.getByRole('button', { name: /^Relative/ })).toHaveCount(0)
  await expect(
    popup.getByRole('button', { name: /Countdown/ }),
  ).toHaveAttribute('aria-pressed', 'true')
  await popup.getByRole('button', { name: 'Copy UTC', exact: true }).click()
  await expect(
    popup.getByRole('status').filter({ hasText: 'UTC copied' }),
  ).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    '2026-11-13T20:02:11.000Z',
  )
  await expect(trigger).toHaveText('Home in 2m 11s')
  await popup
    .getByRole('button', { name: 'Copy Local time', exact: true })
    .click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    '2026-11-13T15:02:11.000-05:00 [America/New_York]',
  )
  await popup.getByRole('button', { name: /^UTC Nov/ }).click()
  // Base UI unmounts and restores focus on animation frames, even without CSS motion.
  await page.clock.runFor(32)
  await expect(popup).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await expect(trigger).toHaveText('Home at Nov 13, 2026, 20:02:11 UTC')
  await trigger.press('Enter')
  await page.keyboard.press('Escape')
  // Base UI unmounts and restores focus on animation frames, even without CSS motion.
  await page.clock.runFor(32)
  await expect(popup).toHaveCount(0)
  await expect(trigger).toBeFocused()
  const second = page.getByRole('button', { name: 'Second wave', exact: true })
  await second.click()
  await popup.getByRole('button', { name: /^UTC Nov/ }).click()
  await page.clock.runFor(32)
  await expect(popup).toHaveCount(0)
  await expect(second).toBeFocused()
  await expect(second).toHaveText('Nov 13, 2026, 20:02:14 UTC')
  await expect(
    page.getByRole('button', { name: 'First wave', exact: true }),
  ).toHaveText('Nov 13, 2026, 20:02:11 UTC')
})

test.describe('touch interactions', () => {
  test.use({ hasTouch: true, isMobile: true })

  test('touch picker stays within a narrow viewport, exposes copy failure and ticks through expiry', async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.clock.pauseAt(new Date('2026-11-13T20:00:00Z'))
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: () => Promise.reject(new Error('denied')) },
      })
    })
    await mount('timestamp')
    const trigger = page.getByRole('button', { name: 'Fleet return time' })
    await trigger.tap()
    const popup = page.getByRole('dialog', { name: 'Time display' })
    await expect(popup).toBeVisible()
    const bounds = await popup.boundingBox()
    expect(bounds!.y).toBeGreaterThanOrEqual(12)
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(832)
    expect(bounds!.x).toBeGreaterThanOrEqual(12)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(378)
    await popup.getByRole('button', { name: /^UTC Nov/ }).tap()
    await page.clock.runFor(32)
    await expect(popup).toHaveCount(0)
    await trigger.tap()
    await expect(popup).toBeVisible()
    await popup.getByRole('button', { name: 'Copy UTC', exact: true }).tap()
    await expect(
      popup.getByRole('status').filter({ hasText: 'Clipboard unavailable' }),
    ).toBeVisible()
    await expect(
      popup.getByRole('textbox', { name: 'UTC to copy' }),
    ).toHaveValue('2026-11-13T20:02:11.000Z')
    await page.clock.runFor(32)
    await expect(popup).toBeInViewport({ ratio: 1 })
    await popup.getByRole('button', { name: /^Countdown/ }).tap()
    await page.clock.runFor(1000)
    await expect(trigger).toHaveText('Home in 2m 10s')
    await page.clock.runFor(130000)
    await expect(trigger).toHaveText('Awaiting confirmation')
    await expect(
      page.getByRole('button', { name: 'Time unavailable' }),
    ).toBeDisabled()
  })
})
