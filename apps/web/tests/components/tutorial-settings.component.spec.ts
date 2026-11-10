import { tutorialFixture } from '../../src/test-support/tutorial'
import { test, expect } from './fixture'
import { diagnosticScreenshot } from '../fixtures/diagnostic-screenshot'

for (const width of [1280, 390]) {
  test(`vacation confirmation and authoritative state changes at ${width}px`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await mount('settings-vacation')
    const section = page.getByRole('region', {
      name: 'Vacation mode',
      exact: true,
    })
    const enter = section.getByRole('button', {
      name: 'Enter vacation mode',
      exact: true,
    })
    await enter.click()
    await expect(
      section.getByRole('button', { name: 'Keep playing' }),
    ).toBeFocused()
    await section.getByRole('button', { name: 'Keep playing' }).click()
    await expect(enter).toBeFocused()
    await expect(page.getByLabel('Submitted vacation actions')).toBeEmpty()
    await enter.click()
    await section.getByRole('button', { name: 'Confirm vacation mode' }).click()
    await expect(page.getByLabel('Submitted vacation actions')).toHaveText(
      'enter',
    )
    await page.getByRole('button', { name: 'Set pending', exact: true }).click()
    await expect(
      section.getByRole('button', { name: 'Entering vacation…' }),
    ).toBeDisabled()
    await expect(
      section.getByRole('button', { name: 'Keep playing' }),
    ).toBeDisabled()
    await page
      .getByRole('button', { name: 'Receive vacation', exact: true })
      .click()
    const leave = section.getByRole('button', { name: 'Leave vacation mode' })
    await expect(leave).toBeDisabled()
    await expect(
      section.getByRole('button', { name: 'Confirm vacation mode' }),
    ).toHaveCount(0)
    await page
      .getByRole('button', { name: 'Receive eligible vacation' })
      .click()
    await expect(leave).toBeEnabled()
    await leave.click()
    await expect(page.getByLabel('Submitted vacation actions')).toHaveText(
      'enter,exit',
    )
    await page
      .getByRole('button', { name: 'Receive inactive vacation' })
      .click()
    await expect(enter).toBeVisible()
    await expect(
      section.getByRole('button', { name: 'Confirm vacation mode' }),
    ).toHaveCount(0)
    await enter.click()
    await expect(
      section.getByRole('button', { name: 'Keep playing' }),
    ).toBeFocused()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await diagnosticScreenshot(section, {
      path: `test-results/tutorial-settings/vacation-review-${width}x900.png`,
    })
  })

  test(`vacation blockers and rejection remain reviewable at ${width}px`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await mount('settings-vacation')
    const section = page.getByRole('region', { name: 'Vacation mode' })
    await page.getByRole('button', { name: 'Receive blockers' }).click()
    await expect(section.getByRole('listitem')).toHaveCount(6)
    await expect(
      section.getByRole('link', { name: 'Open research' }),
    ).toHaveAttribute('href', /research/)
    await expect(
      section.getByRole('button', { name: 'Enter vacation mode', exact: true }),
    ).toBeDisabled()
    await page
      .getByRole('button', { name: 'Receive inactive vacation' })
      .click()
    await section
      .getByRole('button', { name: 'Enter vacation mode', exact: true })
      .click()
    await section.getByRole('button', { name: 'Confirm vacation mode' }).click()
    await page.getByRole('button', { name: 'Receive rejection' }).click()
    await expect(section.getByRole('alert')).toHaveText(
      'The server rejected this change.',
    )
    await expect(
      section.getByRole('button', { name: 'Confirm vacation mode' }),
    ).toBeEnabled()
    await expect(
      section.getByRole('button', { name: 'Leave vacation mode' }),
    ).toHaveCount(0)
  })

  test(`empire deletion review, pending state and cancellation at ${width}px`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await mount('settings-deletion')
    const section = page.getByRole('region', { name: 'Delete empire' })
    await expect(section).toContainText('Your Unbought Games account')
    const request = section.getByRole('button', {
      name: 'Request empire deletion',
      exact: true,
    })
    await request.click()
    const dialog = page.getByRole('dialog', {
      name: 'Delete your empire in Andromeda?',
    })
    await expect(
      dialog.getByRole('button', { name: 'Keep my empire' }),
    ).toBeFocused()
    await diagnosticScreenshot(page, {
      path: `test-results/tutorial-settings/deletion-review-${width}x900.png`,
    })
    await dialog.getByRole('button', { name: 'Keep my empire' }).click()
    await expect(request).toBeFocused()
    await expect(page.getByLabel('Submitted deletion actions')).toBeEmpty()
    await request.click()
    await dialog
      .getByRole('button', { name: 'Schedule empire deletion' })
      .click()
    await expect(page.getByLabel('Submitted deletion actions')).toHaveText(
      'request',
    )
    await page.getByRole('button', { name: 'Set pending', exact: true }).click()
    await expect(request).toBeDisabled()
    await page
      .getByRole('button', { name: 'Receive requested deletion' })
      .click()
    await expect(section).toContainText('You requested deletion.')
    await section
      .getByRole('button', { name: 'Cancel empire deletion' })
      .click()
    await expect(page.getByLabel('Submitted deletion actions')).toHaveText(
      'request,cancel',
    )
    await page
      .getByRole('button', { name: 'Receive cancelled deletion' })
      .click()
    await expect(request).toBeEnabled()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  })

  test(`empire deletion leader, rejection and inactivity controls at ${width}px`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await mount('settings-deletion')
    const section = page.getByRole('region', { name: 'Delete empire' })
    await page
      .getByRole('button', { name: 'Receive sign-in rejection' })
      .click()
    await expect(section.getByRole('alert')).toContainText(
      'Sign out and sign in again',
    )
    await expect(
      section.getByRole('button', {
        name: 'Request empire deletion',
        exact: true,
      }),
    ).toBeEnabled()
    await page.getByRole('button', { name: 'Receive leader status' }).click()
    await expect(
      section.getByRole('button', {
        name: 'Request empire deletion',
        exact: true,
      }),
    ).toBeDisabled()
    await expect(section).toContainText('Transfer alliance leadership')
    await page
      .getByRole('button', { name: 'Receive inactivity deletion' })
      .click()
    await expect(section).toContainText(
      'This empire is scheduled for inactivity cleanup.',
    )
    await expect(
      section.getByRole('button', { name: 'Keep my empire', exact: true }),
    ).toBeEnabled()
    await section
      .getByRole('button', { name: 'Keep my empire', exact: true })
      .click()
    await expect(page.getByLabel('Submitted deletion actions')).toHaveText(
      'keep',
    )
  })
}

for (const width of [1440, 390]) {
  test(`chapter headings disclose independently with keyboard and reduced motion ${width}`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await mount('tutorial-chapters')
    const first = page
      .getByRole('heading', { level: 3, name: /Establish the colony/ })
      .getByRole('button')
    const second = page
      .getByRole('heading', { level: 3, name: /Build the first fleet/ })
      .getByRole('button')
    const firstPanel = page.getByRole('region', {
      name: /Establish the colony/,
    })
    const secondPanel = page.getByRole('region', {
      name: /Build the first fleet/,
    })
    await expect(first).toHaveAttribute('aria-expanded', 'false')
    await expect(firstPanel).toHaveCount(0)
    const titleBox = (await first
      .getByText('Establish the colony', { exact: true })
      .boundingBox())!
    const countBox = (await first.locator('small').boundingBox())!
    expect(countBox.y).toBeLessThan(titleBox.y + titleBox.height)
    expect(countBox.y + countBox.height).toBeGreaterThan(titleBox.y)
    await expect(first).not.toContainText('earned')
    const bounds = (await first.boundingBox())!
    expect(bounds.height).toBeGreaterThanOrEqual(44)
    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width)
    await first.press('Enter')
    await expect(first).toHaveAttribute('aria-expanded', 'true')
    await expect(first).toBeFocused()
    await expect(firstPanel.getByRole('listitem')).toHaveCount(20)
    const firstJob = firstPanel.getByRole('listitem').first()
    await expect(
      firstJob.getByRole('heading', {
        level: 4,
        name: 'Build Solar Plant level 1',
        exact: true,
      }),
    ).toBeVisible()
    await expect(
      firstJob.getByText('Power your colony before starting its mines.', {
        exact: true,
      }),
    ).toBeVisible()
    await expect(firstPanel).not.toContainText('Automatic homeworld reward')
    const reward = firstJob.getByLabel('Reward', { exact: true })
    await expect(
      reward.getByRole('img', { name: 'Metal', exact: true }),
    ).toBeVisible()
    await expect(
      reward.getByRole('img', { name: 'Crystal', exact: true }),
    ).toBeVisible()
    await expect(
      reward.getByRole('img', { name: 'Deuterium', exact: true }),
    ).toHaveCount(0)

    await expect(firstPanel).toHaveCSS('transition-duration', '0.28s, 0.2s')
    await expect(first.locator('svg')).toHaveCSS(
      'transform',
      'matrix(0, 1, -1, 0, 0, 0)',
    )
    await second.click()
    await expect(second).toHaveAttribute('aria-expanded', 'true')
    await expect(first).toHaveAttribute('aria-expanded', 'true')
    await expect(secondPanel.getByRole('listitem')).toHaveCount(5)
    await first.press('Space')
    await expect(first).toHaveAttribute('aria-expanded', 'false')
    await expect(firstPanel).toHaveCount(0)
    await expect(first.locator('svg')).toHaveCSS('transform', 'none')
    await expect(secondPanel).toBeVisible()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(secondPanel).toHaveCSS('transition-duration', '0s')
    await expect(second.locator('svg')).toHaveCSS('transition-duration', '0s')
    await second.press('Enter')
    await expect(secondPanel).toHaveCount(0)
    await expect(second).toBeFocused()
    await first.press('Enter')
    const crystalOpen = firstPanel.getByRole('link', {
      name: 'Open: Build Crystal Mine level 1',
      exact: true,
    })
    await expect(crystalOpen).toHaveText('Open')
    await expect(crystalOpen).toHaveAttribute(
      'href',
      `/u/andromeda/b/${tutorialFixture().homeworld}/resources/crystal-mine`,
    )
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await diagnosticScreenshot(page, {
      path: `test-results/tutorial-settings/chapters-${width}x900.png`,
    })
  })
}

for (const width of [1440, 390]) {
  test(`briefing distinguishes rewards from a legacy directive's next upgrade shortfall ${width}`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await mount('tutorial-reward')
    const card = page.getByRole('region', { name: 'Recommended next action' })
    await expect(card).toContainText(
      'Next Solar Plant upgrade (level 10) needs',
    )
    await expect(card.getByText('Reward', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: /01 Establish the colony/ }).click()
    const row = page
      .getByRole('region', { name: /01 Establish the colony/ })
      .locator('li')
      .filter({
        has: page.getByRole('heading', { name: /Build Solar Plant level\s1/ }),
      })
    await expect(row).toContainText('Next Solar Plant upgrade (level 10) needs')
    await expect(row.getByLabel('Reward', { exact: true })).toContainText('200')
    await expect(
      row.getByRole('img', { name: 'Metal', exact: true }),
    ).toBeVisible()
  })
}

test('full experience confirmation preserves focus and closes when authoritative preference changes', async ({
  page,
  mount,
}) => {
  await mount('tutorial-experience')
  const enter = page.getByRole('button', {
    name: 'Enter Full Experience',
    exact: true,
  })
  await expect(enter).toHaveAttribute('data-button-variant', 'secondary')
  await enter.click()
  const dialog = page.getByRole('dialog', { name: 'Leave beginner mode?' })
  const stay = dialog.getByRole('button', { name: 'Stay in beginner mode' })
  await expect(stay).toBeFocused()
  await expect(dialog).toContainText('earning every reward')
  await stay.click()
  await expect(enter).toBeFocused()
  await expect(page.getByLabel('Preference submissions')).toHaveText('0')
  await enter.click()
  const accept = dialog.getByRole('button', {
    name: 'Enter Full Experience',
    exact: true,
  })
  await expect(accept).toHaveAttribute('data-button-variant', 'primary')
  await accept.click()
  await expect(page.getByLabel('Preference submissions')).toHaveText('1')
  await page.getByRole('button', { name: 'Receive full experience' }).click()
  await expect(enter).toHaveCount(0)
  await expect(dialog).toHaveCount(0)
  await expect(page.getByLabel('Recorded receipts')).toHaveText('0')
})
