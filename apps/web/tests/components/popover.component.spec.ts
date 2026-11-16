import { diagnosticScreenshot } from '../fixtures/diagnostic-screenshot'
import { test, expect } from './fixture'

test('popover honors a changed motion preference, restores focus and submits its native form', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.clock.pauseAt(new Date('2040-01-01T00:00:00Z'))
  await mount('popover')
  const opener = page.getByRole('button', { name: 'Open action' })
  const dialog = page.getByRole('dialog', {
    name: 'Review order',
    includeHidden: true,
  })
  await opener.click()
  await expect(dialog).toBeVisible()
  await page.clock.runFor(200)
  const quantity = page.getByRole('textbox', { name: 'Quantity' })
  await expect(quantity).toBeFocused()
  await quantity.fill('12')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.keyboard.press('Escape')
  await expect(opener).toBeFocused()
  await page.clock.runFor(1)
  // With the clock paused, a stale 100ms exit cannot satisfy this assertion.
  await expect(dialog).toHaveCount(0)
  await opener.click()
  await expect(dialog).toBeVisible()
  // The popup schedules initial focus on the next animation frame.
  await page.clock.runFor(16)
  await expect(quantity).toBeFocused()
  await expect(quantity).toHaveValue('12')
  await quantity.press('Enter')
  await page.clock.runFor(1)
  await expect(dialog).toHaveCount(0)
  await expect(page.getByLabel('Submitted order')).toHaveText('12')
  await expect(opener).toBeFocused()
})

for (const width of [1280, 390]) {
  test(`details keep hover, keyboard re-entry and Escape inside a native dialog at ${width}px`, async ({
    page,
    mount,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    await mount('popover-details')
    await page.getByRole('button', { name: 'Open resource review' }).click()
    const review = page.getByRole('dialog', {
      name: 'Resource review',
      exact: true,
    })
    const trigger = page.getByRole('button', { name: 'Metal details' })
    const details = page.getByRole('dialog', { name: 'Metal', exact: true })
    await trigger.hover()
    await expect(details).toBeVisible()
    await details.getByRole('link', { name: 'Open ledger' }).hover()
    await expect(details).toBeVisible()
    await expect(details).toBeInViewport({ ratio: 1 })
    await diagnosticScreenshot(page, {
      path: testInfo.outputPath(`resource-details-${width}x900.png`),
    })
    await page.keyboard.press('Escape')
    await expect(details).toHaveCount(0)
    await expect(review).toBeVisible()
    await page.getByRole('button', { name: 'Before details' }).focus()
    await page.keyboard.press('Tab')
    await expect(trigger).toBeFocused()
    await expect(details).toBeVisible()
    await page.keyboard.press('Tab')
    await expect(
      details.getByRole('link', { name: 'Open ledger' }),
    ).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(details).toHaveCount(0)
    await expect(trigger).toBeFocused()
    await expect(review).toBeVisible()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Tab')
    await expect(details).toBeVisible()
    await page.getByRole('button', { name: 'Before details' }).click()
    await expect(details).toHaveCount(0)
  })
}

test('link previews retain link semantics and keyboard navigation from both trigger and content', async ({
  page,
  mount,
}) => {
  await mount('popover-details')
  await page.getByRole('button', { name: 'Open resource review' }).click()
  const link = page.getByRole('link', { name: 'Energy', exact: true })
  await link.focus()
  await link.press('Tab')
  await page.keyboard.press('Shift+Tab')
  await expect(link).toBeFocused()
  const preview = page.getByRole('tooltip', { name: 'Energy', exact: true })
  await expect(preview).toBeVisible()
  await expect(link).toHaveAttribute(
    'aria-describedby',
    (await preview.getAttribute('id'))!,
  )
  await page.keyboard.press('Tab')
  const ledger = preview.getByRole('link', { name: 'Energy ledger' })
  await expect(ledger).toBeFocused()
  await ledger.press('Enter')
  await expect(page).toHaveURL(/#energy-ledger$/)
  await expect(preview).toHaveCount(0)
  await link.press('Enter')
  await expect(page).toHaveURL(/#production-settings$/)
})

test.describe('touch details', () => {
  test.use({ hasTouch: true })
  test('tap opens button details and link triggers still navigate', async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mount('popover-details')
    await page.getByRole('button', { name: 'Open resource review' }).tap()
    const details = page.getByRole('dialog', { name: 'Metal', exact: true })
    await page.getByRole('button', { name: 'Metal details' }).tap()
    await expect(details).toBeVisible()
    await page.getByRole('button', { name: 'Before details' }).tap()
    await expect(details).toHaveCount(0)
    await page.getByRole('link', { name: 'Energy', exact: true }).tap()
    await expect(page).toHaveURL(/#production-settings$/)
  })
})

test('unsolicited guidance allows outside clicks and focus without dismissing or stealing focus', async ({
  page,
  mount,
}) => {
  await mount('advisor-bubble')
  const bubble = page.getByRole('dialog', { name: 'Advisor message' })
  await expect(bubble).toBeVisible()
  await expect(bubble.getByRole('button')).not.toBeFocused()
  const outside = page.getByRole('button', { name: 'Outside action' })
  await outside.click()
  await expect(outside).toBeFocused()
  await expect(bubble).toBeVisible()
  await bubble.getByRole('button').focus()
  await outside.focus()
  await expect(bubble).toBeVisible()
  await expect(outside).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(bubble).toHaveCount(0)
  const trigger = page.getByRole('button', { name: 'Toggle advisor' })
  await trigger.click()
  await expect(bubble).toBeVisible()
  await bubble.getByRole('button').click()
  await expect(bubble).toHaveCount(0)
  await expect(trigger).toBeFocused()
})

test('nonanimated details dismiss immediately without waiting for a clock frame', async ({
  page,
  mount,
}) => {
  await page.clock.pauseAt(new Date('2040-01-01T00:00:00Z'))
  await mount('popover-details')
  await page.getByRole('button', { name: 'Open resource review' }).click()
  const trigger = page.getByRole('button', { name: 'Metal details' })
  const details = page.getByRole('dialog', { name: 'Metal', exact: true })
  await trigger.click()
  await expect(details).toBeVisible()
  await details.getByRole('link', { name: 'Open ledger' }).focus()
  await page.keyboard.press('Escape')
  await expect(details).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await trigger.press('Enter')
  await expect(details).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(details).toHaveCount(0)
})
