import { join } from 'node:path'
import type { Locator, Page } from '@playwright/test'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { expect, test } from './fixtures/test'
import { installTutorialFixture } from './fixtures/tutorial'
import { body, refreshGame } from './fixtures/game'
import {
  withFixtureResponse,
  withProgressionResponse,
} from './fixtures/responses'
const tutorial = (r: import('@playwright/test').Response) =>
  r.url().endsWith('/world') && r.request().postDataJSON().type === 'Tutorial'
const briefing = `/u/andromeda/b/${body.id}/briefing`

async function orbPositions(page: Page, orb: Locator) {
  const positions = []
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(orb).toBeVisible()
    const bounds = (await orb.boundingBox())!
    positions.push({ width, bounds })
  }
  return positions
}

async function expectAnchoredAtBothWidths(
  page: Page,
  orb: Locator,
  bubble: Locator,
  positions: Awaited<ReturnType<typeof orbPositions>>,
) {
  for (const { width, bounds } of positions) {
    await page.setViewportSize({ width, height: 900 })
    await expect.poll(() => orb.boundingBox()).toEqual(bounds)
    // The anchored popover repositions on resize. Read the bounds together.
    await expect
      .poll(async () => {
        const box = await bubble.boundingBox()
        return (
          !!box &&
          box.x >= 0 &&
          box.x + box.width <= width &&
          box.y >= 0 &&
          box.y + box.height <= bounds.y
        )
      })
      .toBe(true)
  }
}

test('the Metal Mine lesson keeps the same anchored orb through catalog navigation, reload and keyboard handoff', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const state = await installTutorialFixture(page)
  state.data.recommended_objectives = ['metal-1']
  await withFixtureResponse(page, tutorial, () => page.goto(briefing))
  const orb = page.getByTestId('command-orb')
  await expect(orb).toBeVisible()
  const positions = await orbPositions(page, orb)
  await orb.evaluate((el) => el.setAttribute('data-instance', 'original'))
  await withProgressionResponse(
    page,
    (r) => r.type === 'Upgrade',
    () =>
      page.getByRole('link', { name: 'Open Metal Mine', exact: true }).click(),
  )
  const bubble = page.getByRole('dialog', {
    name: 'Your Metal Mine',
    exact: true,
  })
  await expect(bubble).toBeVisible()
  await expect(bubble).toContainText('It needs energy to work at full output.')
  await expect(
    bubble.getByRole('link', { name: 'Open briefing', exact: true }),
  ).toHaveAttribute('href', briefing)
  await expect(
    page.getByLabel('Opening guidance', { exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('main').getByRole('link', { name: 'Briefing', exact: true }),
  ).toHaveCount(0)
  await expect(orb).toHaveAttribute('data-instance', 'original')
  await expectAnchoredAtBothWidths(page, orb, bubble, positions)
  await expect(
    page.getByRole('button', { name: 'Confirm upgrade', exact: true }),
  ).toBeEnabled()
  await orb.click()
  await expect(bubble).toHaveCount(0)
  await expect(orb).toHaveAttribute('aria-expanded', 'false')
  await orb.click()
  await expect(bubble).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(bubble).toHaveCount(0)
  await orb.press('Enter')
  await expect(bubble).toBeVisible()
  await bubble
    .getByRole('button', { name: 'Command uplink', exact: true })
    .press('Escape')
  await expect(bubble).toHaveCount(0)
  await expect(orb).toBeFocused()
  await orb.press('Enter')
  await bubble
    .getByRole('button', { name: 'Command uplink', exact: true })
    .click()
  await expect(
    page.getByRole('dialog', { name: 'Command uplink', exact: true }),
  ).toBeVisible()
  await expect(bubble).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(orb).toBeFocused()
  await withFixtureResponse(page, tutorial, () =>
    withProgressionResponse(
      page,
      (r) => r.type === 'Upgrade',
      () => page.reload(),
    ),
  )
  await expect(
    page.getByRole('heading', { name: 'Metal Mine', exact: true }),
  ).toBeVisible()
  await expect(bubble).toHaveCount(0)
  await orb.click()
  await expect(bubble).toBeVisible()
  await page.getByRole('link', { name: 'Empire', exact: true }).click()
  await expect(
    page.getByRole('region', { name: 'Empire overview', exact: true }),
  ).toBeVisible()
  await expect(bubble).toHaveCount(0)
  await expect(orb).toHaveAttribute('aria-label', 'Open command HUD')
  expect(state.commands).toHaveLength(0)
  expect(state.data.receipts).toHaveLength(0)
})

for (const width of [1440, 390]) {
  test(`dismissing a briefing reward restores Command uplink and later rewards still appear ${width}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const state = await installTutorialFixture(page)
    state.data.recommended_objectives = ['metal-1']
    await withFixtureResponse(page, tutorial, () => page.goto(briefing))
    await withProgressionResponse(
      page,
      (r) => r.type === 'Upgrade',
      () =>
        page
          .getByRole('link', { name: 'Open Metal Mine', exact: true })
          .click(),
    )
    const orb = page.getByTestId('command-orb')
    await expect(
      page.getByRole('dialog', { name: 'Your Metal Mine', exact: true }),
    ).toBeVisible()
    const celebration = page.getByRole('dialog', {
      name: 'Nicely done!',
      exact: true,
    })
    await expect(celebration).toHaveCount(0)
    state.earnMine()
    await withFixtureResponse(page, tutorial, () => refreshGame(page))
    await expect(celebration).toBeVisible()
    await expect(
      page.getByRole('dialog', { name: 'Your Metal Mine', exact: true }),
    ).toHaveCount(0)
    await diagnosticScreenshot(page, {
      path: join(testInfo.outputDir, `directive-celebration-${width}x900.png`),
    })
    await orb.click()
    await expect(celebration).toHaveCount(0)
    await expect(orb).toHaveAttribute('aria-label', 'Open command HUD')
    await diagnosticScreenshot(page, {
      path: join(testInfo.outputDir, `dismissed-celebration-${width}x900.png`),
    })
    await withFixtureResponse(
      page,
      (response) =>
        response.url().includes('/api/') &&
        response.url().endsWith('/overview'),
      () => refreshGame(page),
    )
    await expect(celebration).toHaveCount(0)
    await orb.click()
    const uplink = page.getByRole('dialog', {
      name: 'Command uplink',
      exact: true,
    })
    await expect(uplink).toBeVisible()
    await expect(celebration).toHaveCount(0)
    await diagnosticScreenshot(page, {
      path: join(
        testInfo.outputDir,
        `command-uplink-after-dismissal-${width}x900.png`,
      ),
    })
    await page.keyboard.press('Escape')
    await expect(uplink).toHaveCount(0)
    await expect(orb).toBeFocused()
    await orb.press('Enter')
    await expect(uplink).toBeVisible()

    // A genuinely new receipt still waits for commands to close, then appears.
    state.setStage('complete')
    await withFixtureResponse(page, tutorial, () => refreshGame(page))
    await expect(celebration).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(celebration).toBeVisible()
    await expect(celebration).toContainText('Briefing complete.')
    await celebration
      .getByRole('button', { name: 'Command uplink', exact: true })
      .focus()
    if (width === 1440) await page.keyboard.press('Escape')
    else {
      await celebration
        .getByRole('button', { name: 'Command uplink', exact: true })
        .click()
      await expect(uplink).toBeVisible()
      await expect(celebration).toHaveCount(0)
      await page.keyboard.press('Escape')
    }
    await expect(celebration).toHaveCount(0)
    await expect(orb).toBeFocused()
    await orb.press('Enter')
    await expect(uplink).toBeVisible()
    await expect(celebration).toHaveCount(0)
    expect(state.commands).toHaveLength(0)
  })
}

test('a confirmed reward replaces the anchored lesson and opens its next catalog job', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const state = await installTutorialFixture(page)
  state.data.recommended_objectives = ['metal-1']
  await withFixtureResponse(page, tutorial, () => page.goto(briefing))
  await withProgressionResponse(
    page,
    (r) => r.type === 'Upgrade',
    () =>
      page.getByRole('link', { name: 'Open Metal Mine', exact: true }).click(),
  )
  const orb = page.getByTestId('command-orb')
  await expect(
    page.getByRole('dialog', { name: 'Your Metal Mine', exact: true }),
  ).toBeVisible()
  const positions = await orbPositions(page, orb)
  const celebration = page.getByRole('dialog', {
    name: 'Nicely done!',
    exact: true,
  })
  await expect(celebration).toHaveCount(0)
  state.earnMine()
  await withFixtureResponse(page, tutorial, () => refreshGame(page))
  await expect(celebration).toBeVisible()
  await expect(
    page.getByRole('dialog', { name: 'Your Metal Mine', exact: true }),
  ).toHaveCount(0)
  await expect(celebration).toContainText('Metal Mine · level 1')
  await expect(celebration).toContainText('Rewards added automatically.')
  await expect(celebration.getByText('Reward', { exact: true })).toBeVisible()
  await expect(celebration).not.toContainText('Click me to hide this.')
  await expect(
    celebration.getByRole('img', { name: 'Metal', exact: true }),
  ).toBeVisible()
  await expect(
    celebration.getByRole('img', { name: 'Deuterium', exact: true }),
  ).toHaveCount(0)
  await expect(
    celebration.getByRole('link', { name: 'Briefing', exact: true }),
  ).toHaveAttribute('href', briefing)
  await expectAnchoredAtBothWidths(page, orb, celebration, positions)
  const next = celebration.getByRole('region', { name: 'Next directive' })
  const link = next.getByRole('link')
  const destination = await link.getAttribute('href')
  await withProgressionResponse(
    page,
    (r) => r.type === 'Upgrade',
    () => link.click(),
  )
  await expect(page).toHaveURL(destination!)
  await expect(celebration).toHaveCount(0)
  await withFixtureResponse(page, tutorial, () => page.reload())
  await expect(celebration).toHaveCount(0)
  expect(state.commands).toHaveLength(0)
})

test('production review completes explicitly without changing allocations', async ({
  page,
}, testInfo) => {
  const width = 390
  await page.setViewportSize({ width, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const state = await installTutorialFixture(page, 'energy-settings')
  state.data.beginner = false
  await withFixtureResponse(page, tutorial, () => page.goto(briefing))
  await page.getByRole('button', { name: /01 Establish the colony/ }).click()
  const checklist = page.getByRole('region', {
    name: /01 Establish the colony/,
  })
  const completedRows = checklist.locator('li[data-completed]')
  await expect(completedRows).toHaveCount(5)
  await expect(completedRows.getByRole('link')).toHaveCount(0)
  await expect(completedRows.locator('p')).toHaveCount(0)
  await expect(completedRows.getByLabel('Reward', { exact: true })).toHaveCount(
    0,
  )
  const directive = checklist
    .locator('li')
    .filter({ hasText: 'Review resource settings' })
  await expect(
    directive.getByRole('heading', {
      name: 'Review resource settings',
      exact: true,
    }),
  ).toBeVisible()
  await expect(directive.getByLabel('Reward', { exact: true })).toContainText(
    '200',
  )
  await expect(directive.getByLabel('Reward', { exact: true })).toContainText(
    '100',
  )
  if (process.env.ORBIT_TEST_SCREENSHOTS === '1')
    await directive.scrollIntoViewIfNeeded()
  await diagnosticScreenshot(page, {
    path: join(testInfo.outputDir, `review-checklist-${width}x900.png`),
  })
  await page
    .getByRole('link', { name: 'Open resource settings', exact: true })
    .click()
  const lesson = page.getByRole('dialog', {
    name: 'Put your power to work',
    exact: true,
  })
  await expect(lesson).toBeVisible()
  await expect(
    page.getByRole('table', { name: 'Production settings' }),
  ).toBeVisible()
  await expect(lesson).toContainText('Changes save automatically.')
  await expect(lesson.getByLabel('Reward', { exact: true })).toContainText(
    '200',
  )
  await expect(
    lesson.getByRole('button', { name: 'Understood', exact: true }),
  ).toBeEnabled()
  await diagnosticScreenshot(page, {
    path: join(testInfo.outputDir, `production-review-${width}x900.png`),
  })
  await withFixtureResponse(page, tutorial, () =>
    lesson.getByRole('button', { name: 'Understood', exact: true }).click(),
  )
  const celebration = page.getByRole('dialog', {
    name: 'Nicely done!',
    exact: true,
  })
  await expect(celebration).toBeVisible()
  await expect(celebration).toContainText('Production controls reviewed')
  await expect(celebration).toContainText('Rewards added automatically.')
  await expect(celebration.getByText('Reward', { exact: true })).toBeVisible()
  await expect(celebration).not.toContainText('Click me to hide this.')
  await expect(
    celebration.getByRole('region', { name: 'Next directive' }),
  ).toContainText('Upgrade Crystal Mine to level 2')
  expect(state.commands).toEqual([
    { type: 'World', action: { type: 'ReviewProductionSettings' } },
  ])
  await withFixtureResponse(page, tutorial, () => page.reload())
  await expect(lesson).toHaveCount(0)
  await withFixtureResponse(page, tutorial, () => page.goto(briefing))
  await page.getByRole('button', { name: /01 Establish the colony/ }).click()
  await expect(directive.getByLabel('Accomplished')).toBeVisible()
  await expect(
    directive.getByRole('heading', {
      name: 'Review resource settings',
      exact: true,
    }),
  ).toBeVisible()
  await expect(directive.getByRole('link')).toHaveCount(0)
  await expect(directive.locator('p')).toHaveCount(0)
  await expect(directive.getByLabel('Reward', { exact: true })).toHaveCount(0)
  if (process.env.ORBIT_TEST_SCREENSHOTS === '1')
    await directive.scrollIntoViewIfNeeded()
  await diagnosticScreenshot(page, {
    path: join(testInfo.outputDir, `review-complete-${width}x900.png`),
  })
})
