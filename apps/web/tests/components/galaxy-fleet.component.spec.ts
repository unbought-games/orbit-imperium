import { test, expect, type Page } from './fixture'
import { diagnosticScreenshot } from '../fixtures/diagnostic-screenshot'

async function openHarvest(page: Page) {
  await page
    .getByRole('button', { name: 'Actions for [1:371:2]', exact: true })
    .click()
  await page.getByRole('menuitem', { name: 'Harvest', exact: true }).click()
  const surface = page.getByRole('dialog', {
    name: 'Harvest mission',
    exact: true,
  })
  await expect(surface).toBeVisible()
  return surface
}

for (const width of [390, 1280]) {
  test(`harvest surface preserves input, focus, bounds and explicit form callbacks at ${width}px`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mount('galaxy-harvest')
    const surface = await openHarvest(page)
    const count = surface.getByRole('textbox', {
      name: 'Recyclers',
      exact: true,
    })
    await expect(count).toHaveValue('8')
    await expect(surface).toContainText('8 available · 16 needed')
    await expect(surface.getByLabel('Available debris')).toContainText('20,000')
    if (width < 768) {
      const sheet = surface.getByRole('region', {
        name: 'Harvest mission sheet',
        exact: true,
      })
      await expect
        .poll(async () => (await sheet.boundingBox())?.y)
        .toBeCloseTo(444, 0)
      await expect(
        page.getByRole('button', { name: 'Resize action sheet' }),
      ).toBeFocused()
    } else {
      await expect(count).toBeFocused()
      await expect
        .poll(() =>
          count.evaluate((el: HTMLInputElement) => [
            el.selectionStart,
            el.selectionEnd,
          ]),
        )
        .toEqual([0, 1])
      const anchor = (await page
        .getByRole('button', { name: 'Actions for [1:371:2]' })
        .boundingBox())!
      const bounds = (await surface.boundingBox())!
      expect(
        Math.abs(bounds.x + bounds.width - anchor.x - anchor.width),
      ).toBeLessThan(2)
    }
    await count.fill('9')
    await expect(
      surface.getByRole('button', { name: 'Send', exact: true }),
    ).toBeDisabled()
    await expect(surface).toContainText('Not enough recyclers')
    await count.fill('3')
    await expect(
      surface.getByRole('button', { name: 'Send', exact: true }),
    ).toBeEnabled()
    await diagnosticScreenshot(page, {
      path: `test-results/galaxy-harvest-component-${width}x844.png`,
    })
    await page.keyboard.press('Escape')
    await expect(surface).not.toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Actions for [1:371:2]', exact: true }),
    ).toBeFocused()
    await openHarvest(page)
    await expect(count).toHaveValue('3')
    await surface
      .getByRole('button', { name: 'Customize', exact: true })
      .click()
    await expect(page.getByLabel('Harvest callback')).toHaveText(
      'Customize 3 at 2',
    )
    await expect(surface).not.toBeVisible()
    await openHarvest(page)
    await count.fill('2')
    await count.press('Enter')
    await expect(page.getByLabel('Harvest callback')).toHaveText(
      'Submit 2 at 2',
    )
    await expect(surface).not.toBeVisible()
  })
}

test('harvest edits survive popover/sheet changes and release scroll locking', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mount('galaxy-harvest')
  const surface = await openHarvest(page)
  await surface
    .getByRole('textbox', { name: 'Recyclers', exact: true })
    .fill('2')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(
    page.getByRole('button', { name: 'Resize action sheet' }),
  ).toBeFocused()
  await expect(
    surface.getByRole('textbox', { name: 'Recyclers', exact: true }),
  ).toHaveValue('2')
  await page.setViewportSize({ width: 1280, height: 900 })
  await expect(
    surface.getByRole('textbox', { name: 'Recyclers', exact: true }),
  ).toBeFocused()
  await expect(
    surface.getByRole('textbox', { name: 'Recyclers', exact: true }),
  ).toHaveValue('2')
  expect(await page.evaluate(() => document.body.style.position)).toBe('')
  await page.getByRole('button', { name: 'Change target' }).click()
  await expect(surface).not.toBeVisible()
})

test('blocked desktop harvest stays inside a short viewport and restores its opener', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 800, height: 550 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mount('galaxy-harvest')
  await page.getByRole('button', { name: 'Toggle unavailable ships' }).click()
  const surface = await openHarvest(page)
  await expect(surface).toContainText('No recyclers available')
  await expect(surface).toContainText('No fleet slots available')
  await expect(
    surface.getByRole('button', { name: 'Send', exact: true }),
  ).toBeDisabled()
  await expect(
    surface.getByRole('button', { name: 'Dismiss popover' }),
  ).toBeFocused()
  const bounds = (await surface.boundingBox())!
  expect(bounds.x).toBeGreaterThanOrEqual(12)
  expect(bounds.y).toBeGreaterThanOrEqual(12)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(788)
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(538)
  await surface.getByRole('button', { name: 'Dismiss popover' }).click()
  await expect(surface).not.toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Actions for [1:371:2]' }),
  ).toBeFocused()
})

for (const width of [320, 390, 1280]) {
  test(`inventory table preserves exact accessible counts, groups and links at ${width}px`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await mount('fleet-inventory')
    const panel = page.getByRole('region', {
      name: 'Stationed ships',
      exact: true,
    })
    const row = panel.getByRole('row').filter({
      has: page.getByRole('rowheader', {
        name: 'Build more Small Cargo in Shipyard',
        exact: true,
      }),
    })
    await expect(row.getByRole('cell')).toHaveText([
      '9,223,372,036,854,775,807',
      '5',
      '5',
    ])
    await expect(panel.getByRole('columnheader')).toHaveText([
      'Ship',
      'Stationed',
      'Flying',
      'Queued',
    ])
    await expect(row.getByRole('link')).toHaveAttribute(
      'href',
      '/u/andromeda/b/00000000-0000-4000-8000-000000000005/shipyard/small-cargo',
    )
    expect(
      (await panel.getByRole('row').first().boundingBox())!.height,
    ).toBeLessThan(44)
    expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
      true,
    )
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await diagnosticScreenshot(page, {
      path: `test-results/fleet-inventory-component-${width}x900.png`,
      fullPage: true,
    })
    await page.getByRole('button', { name: 'Show all groups' }).click()
    await expect(panel.getByRole('rowheader')).toHaveText([
      'Military',
      'Light Fighter',
      'Civil',
      'Solar Satellite',
      'Small Cargo',
    ])
    expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
      true,
    )
    await page.getByRole('button', { name: 'Switch world' }).click()
    await expect(panel).toContainText('No ships stationed here.')
    await expect(row.getByRole('cell')).toHaveText(['0', '9', '7'])
    await expect(
      panel.getByRole('link', { name: 'Open Shipyard', exact: true }),
    ).toHaveAttribute(
      'href',
      '/u/andromeda/b/00000000-0000-4000-8000-000000000006/shipyard',
    )
  })
}

test('flight summary preserves native disclosure through refreshed countdowns', async ({
  page,
  mount,
}) => {
  await mount('galaxy-disclosure')
  const disclosure = page.getByLabel('Your fleets to [1:371:2]', {
    exact: true,
  })
  const trigger = disclosure.locator('summary')
  await expect(trigger).toHaveAccessibleName('Show 6 fleets to [1:371:2]')
  await expect(disclosure.locator('ul')).toBeHidden()
  await trigger.focus()
  await trigger.press('Enter')
  await expect(disclosure.locator('li')).toHaveCount(6)
  await expect(disclosure.locator('ul')).toBeVisible()
  await page.getByRole('button', { name: 'Refresh snapshot' }).click()
  await expect(disclosure.locator('ul')).toBeVisible()
  await expect(disclosure.locator('li')).toHaveCount(5)
  await expect(trigger).toHaveAccessibleName('Show 5 fleets to [1:371:2]')
  await expect(trigger).toContainText('1m 0s')
  await trigger.click()
  await expect(disclosure.locator('ul')).toBeHidden()
})

test.describe('status interaction', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } })
  test('simultaneous statuses support keyboard, touch and outside dismissal', async ({
    page,
    mount,
  }) => {
    await mount('galaxy-disclosure')
    for (const label of [
      'Vacation mode',
      'Inactive for 7 days or more',
      'Beginner protection',
    ]) {
      const trigger = page.getByRole('button', { name: label, exact: true })
      await trigger.focus()
      // The previous phase used touch. Base UI correctly ignores non-focus-visible
      // programmatic focus after touch; traverse with the actual keyboard before
      // asserting the keyboard-triggered tooltip.
      await page.keyboard.press('Tab')
      await page.keyboard.press('Shift+Tab')
      await expect(trigger).toBeFocused()
      await expect(page.getByRole('tooltip')).toContainText(label)
      await page.keyboard.press('Escape')
      await expect(page.getByRole('tooltip')).toBeHidden()
      await trigger.tap()
      await expect(page.getByRole('tooltip')).toContainText(label)
      await page.getByRole('button', { name: 'Outside target' }).tap()
      await expect(page.getByRole('tooltip')).toBeHidden()
    }
    await page.getByRole('button', { name: 'Mark long inactivity' }).click()
    await expect(
      page.getByRole('button', { name: 'Inactive for 7 days or more' }),
    ).toHaveCount(0)
    await page
      .getByRole('button', { name: 'Inactive for 28 days or more' })
      .tap()
    await expect(page.getByRole('tooltip')).toContainText(
      'Inactive for 28 days or more',
    )
  })
})

test('empty inventory retains its useful Shipyard destination without fabricated catalog rows', async ({
  page,
  mount,
}) => {
  await mount('fleet-inventory')
  await page.getByRole('button', { name: 'Clear inventory' }).click()
  const panel = page.getByRole('region', {
    name: 'Stationed ships',
    exact: true,
  })
  await expect(panel).toContainText('No ships stationed here.')
  await expect(panel.getByRole('table')).toHaveCount(0)
  await expect(
    panel.getByRole('link', { name: 'Open Shipyard', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Clear catalog' }).click()
  await expect(panel).toContainText('Ship details are unavailable.')
  await expect(
    panel.getByRole('link', { name: 'Open Shipyard', exact: true }),
  ).toHaveAttribute(
    'href',
    '/u/andromeda/b/00000000-0000-4000-8000-000000000005/shipyard',
  )
})
