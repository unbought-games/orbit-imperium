import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { expect, test } from './fixtures/test'
import { installTutorialFixture } from './fixtures/tutorial'
import { binding, body, refreshGame } from './fixtures/game'
import { tutorialFixture } from '../src/test-support/tutorial'
import {
  withFixtureResponse,
  withProgressionResponse,
} from './fixtures/responses'
const tutorial = (r: import('@playwright/test').Response) =>
  r.url().endsWith('/world') && r.request().postDataJSON().type === 'Tutorial'
const briefing = `/u/andromeda/b/${body.id}/briefing`

for (const width of [1440, 390]) {
  test(`out-of-order lab completion continues to Energy Technology and Briefing has no receipt block ${width}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const state = await installTutorialFixture(page, 'research')
    state.data.recommended_objectives = ['solar-1']
    const lab = state.data.chapters
      .flatMap((c) => c.objectives)
      .find((o) => o.id === 'lab-2')!
    lab.completed = true
    lab.next_action = null
    lab.inspection = null
    const receipt = tutorialFixture(true).receipts.find(
      (r) => r.objective === 'lab-2',
    )!
    receipt.beneficiary = binding.player
    receipt.homeworld = body.id
    state.data.receipts = [receipt]
    await withFixtureResponse(page, tutorial, () => page.goto(briefing))
    const celebration = page.getByRole('dialog', {
      name: 'Nicely done!',
      exact: true,
    })
    await expect(celebration).toContainText('Research Lab · level 2')
    const next = celebration.getByRole('region', { name: 'Next directive' })
    await expect(next).toContainText('Research Energy Technology level 1')
    await expect(
      page.getByLabel('Latest accomplishment', { exact: true }),
    ).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: 'Dismiss receipt', exact: true }),
    ).toHaveCount(0)
    await diagnosticScreenshot(page, {
      path: testInfo.outputPath(`lab-next-energy-${width}x900.png`),
    })
    await withProgressionResponse(
      page,
      (r) => r.type === 'Research',
      () =>
        next
          .getByRole('link', { name: 'Open Energy Technology', exact: true })
          .click(),
    )
    await expect(
      page.getByRole('heading', { name: 'Energy Technology', exact: true }),
    ).toBeVisible()
    await withFixtureResponse(page, tutorial, () => page.goto(briefing))
    await expect(celebration).toHaveCount(0)
    await expect(
      page.getByLabel('Latest accomplishment', { exact: true }),
    ).toHaveCount(0)
    await page.getByRole('button', { name: /02 Build the first fleet/ }).click()
    const fleet = page.getByRole('region', { name: /02 Build the first fleet/ })
    await expect(
      fleet.getByRole('heading', { name: /Upgrade Research Lab to level\s2/ }),
    ).toBeVisible()
    await expect(
      fleet.getByRole('heading', { name: /Upgrade Shipyard to level\s2/ }),
    ).toBeVisible()
    if (process.env.ORBIT_TEST_SCREENSHOTS === '1')
      await fleet.evaluate((el) =>
        window.scrollBy(0, el.getBoundingClientRect().top - 100),
      )
    await diagnosticScreenshot(page, {
      path: testInfo.outputPath(`briefing-without-receipt-${width}x900.png`),
    })
    expect(state.commands).toHaveLength(0)
  })
}

for (const width of [1440, 390]) {
  test(`Metal Mine first visit explains production without moving the orb or issuing orders ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const state = await installTutorialFixture(page)
    state.data.recommended_objectives = ['metal-1']
    await withFixtureResponse(page, tutorial, () => page.goto(briefing))
    const orb = page.getByTestId('command-orb')
    await expect(orb).toBeVisible()
    const original = await orb.boundingBox()
    await orb.evaluate((el) => el.setAttribute('data-instance', 'original'))
    await withProgressionResponse(
      page,
      (r) => r.type === 'Upgrade',
      () =>
        page
          .getByRole('link', { name: 'Open Metal Mine', exact: true })
          .click(),
    )
    const bubble = page.getByRole('dialog', {
      name: 'Your Metal Mine',
      exact: true,
    })
    await expect(bubble).toBeVisible()
    await expect(bubble).toContainText(
      'It needs energy to work at full output.',
    )
    await expect(
      bubble.getByRole('link', { name: 'Open briefing', exact: true }),
    ).toHaveAttribute('href', briefing)
    await expect(
      page.getByLabel('Opening guidance', { exact: true }),
    ).toHaveCount(0)
    await expect(
      page
        .getByRole('main')
        .getByRole('link', { name: 'Briefing', exact: true }),
    ).toHaveCount(0)
    await expect(orb).toHaveAttribute('data-instance', 'original')
    expect(await orb.boundingBox()).toEqual(original)
    const bounds = (await bubble.boundingBox())!
    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width)
    expect(bounds.y).toBeGreaterThanOrEqual(0)
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(original!.y)
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
}

for (const width of [1440, 390]) {
  test(`confirmed briefing reward opens the orb, toggles, and navigates to the next job ${width}`, async ({
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
    const position = await orb.boundingBox()
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
    await expect(
      celebration.getByRole('img', { name: 'Metal', exact: true }),
    ).toBeVisible()
    await expect(
      celebration.getByRole('img', { name: 'Deuterium', exact: true }),
    ).toHaveCount(0)
    await expect(
      celebration.getByRole('link', { name: 'Briefing', exact: true }),
    ).toHaveAttribute('href', briefing)
    expect(await orb.boundingBox()).toEqual(position)
    const box = (await celebration.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(width)
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.y + box.height).toBeLessThanOrEqual(position!.y)
    await diagnosticScreenshot(page, {
      path: testInfo.outputPath(`directive-celebration-${width}x900.png`),
    })
    await orb.click()
    await expect(celebration).toHaveCount(0)
    await withFixtureResponse(page, (r) => r.url().includes('/api/') && r.url().endsWith('/overview'), () => refreshGame(page))
    await expect(celebration).toHaveCount(0)
    await orb.click()
    await expect(celebration).toBeVisible()
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
}

test('unseen offline rewards and final job remain celebratable in the full interface', async ({
  page,
}) => {
  const state = await installTutorialFixture(page)
  state.data.beginner = false
  state.earnMine()
  await withFixtureResponse(page, tutorial, () =>
    page.goto(`/u/andromeda/b/${body.id}/overview`),
  )
  const celebration = page.getByRole('dialog', {
    name: 'Nicely done!',
    exact: true,
  })
  await expect(celebration).toBeVisible()
  await celebration.getByRole('link', { name: 'Briefing', exact: true }).click()
  await expect(page).toHaveURL(briefing)
  await expect(celebration).toHaveCount(0)
  await page.getByTestId('command-orb').click()
  await expect(
    page.getByRole('dialog', { name: 'Command uplink', exact: true }),
  ).toBeVisible()
  state.setStage('complete')
  await withFixtureResponse(page, tutorial, () => refreshGame(page))
  await expect(celebration).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(celebration).toBeVisible()
  await expect(celebration).toContainText('30 directives completed.')
  await expect(celebration).toContainText('Briefing complete.')
  await expect(
    celebration.getByRole('region', { name: 'Next directive' }),
  ).toHaveCount(0)
  await celebration.getByRole('link', { name: 'Briefing', exact: true }).click()
  await expect(celebration).toHaveCount(0)
  await withFixtureResponse(page, tutorial, () => page.reload())
  await expect(celebration).toHaveCount(0)
  expect(state.commands).toHaveLength(0)
})

for (const width of [1440, 390]) {
  test(`energy-first briefing opens Solar Plant before mines ${width}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const state = await installTutorialFixture(page, 'opening')
    await withFixtureResponse(page, tutorial, () => page.goto(briefing))
    await expect(
      page.getByRole('region', { name: 'Recommended next action' }),
    ).toContainText('Build Solar Plant level 1')
    await page.getByRole('button', { name: /01 Establish the colony/ }).click()
    const titles = await page
      .getByRole('region', { name: /01 Establish the colony/ })
      .locator('h4')
      .allTextContents()
    expect(
      titles.slice(0, 7).map((title) => title.replaceAll('\u00a0', ' ')),
    ).toEqual([
      'Build Solar Plant level 1',
      'Build Metal Mine level 1',
      'Build Crystal Mine level 1',
      'Upgrade Metal Mine to level 2',
      'Upgrade Solar Plant to level 2',
      'Review resource settings',
      'Upgrade Crystal Mine to level 2',
    ])
    await diagnosticScreenshot(page, {
      path: testInfo.outputPath(`energy-briefing-${width}x900.png`),
    })
    const normalized = titles.map((title) => title.replaceAll('\u00a0', ' '))
    const robotics = normalized.indexOf('Upgrade Robotics Factory to level 2')
    expect(normalized.slice(robotics + 1)).toEqual([
      'Upgrade Deuterium Synthesizer to level 5',
      'Upgrade Crystal Mine to level 6',
      'Upgrade Metal Mine to level 7',
      'Upgrade Solar Plant to level 9',
    ])
    if (process.env.ORBIT_TEST_SCREENSHOTS === '1') {
      await page
        .locator('h4')
        .filter({ hasText: /Upgrade Robotics Factory to level\s2/ })
        .evaluate((el) => {
          window.scrollBy(0, el.getBoundingClientRect().top - 100)
        })
      await diagnosticScreenshot(page, {
        path: testInfo.outputPath(`colony-final-targets-${width}x900.png`),
      })
    }
    const metalFour = normalized.indexOf('Upgrade Metal Mine to level 4')
    expect(normalized.slice(metalFour, metalFour + 4)).toEqual([
      'Upgrade Metal Mine to level 4',
      'Upgrade Solar Plant to level 5',
      'Build Deuterium Synthesizer level 1',
      'Upgrade Deuterium Synthesizer to level 2',
    ])
    if (process.env.ORBIT_TEST_SCREENSHOTS === '1') {
      await page
        .getByRole('region', { name: /01 Establish the colony/ })
        .getByRole('heading', { name: /Upgrade Solar Plant to level\s5/ })
        .scrollIntoViewIfNeeded()
    }
    await diagnosticScreenshot(page, {
      path: testInfo.outputPath(`solar-five-order-${width}x900.png`),
    })
    await withProgressionResponse(
      page,
      (r) => r.type === 'Upgrade',
      () =>
        page
          .getByRole('link', { name: 'Open Solar Plant', exact: true })
          .click(),
    )
    const lesson = page.getByRole('dialog', {
      name: 'Power comes first',
      exact: true,
    })
    await expect(lesson).toBeVisible()
    await diagnosticScreenshot(page, {
      path: testInfo.outputPath(`solar-guidance-${width}x900.png`),
    })
    expect(state.commands).toHaveLength(0)
  })
  test(`production review completes explicitly without changing allocations ${width}`, async ({
    page,
  }, testInfo) => {
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
    await expect(
      completedRows.getByLabel('Reward', { exact: true }),
    ).toHaveCount(0)
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
      path: testInfo.outputPath(`review-checklist-${width}x900.png`),
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
      path: testInfo.outputPath(`production-review-${width}x900.png`),
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
      path: testInfo.outputPath(`review-complete-${width}x900.png`),
    })
  })
}
