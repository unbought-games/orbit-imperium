import { test, expect } from './fixtures/test'
import { installTutorialFixture } from './fixtures/tutorial'
import { body } from './fixtures/game'
import {
  withFixtureResponse,
  withProgressionResponse,
} from './fixtures/responses'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { mkdir } from 'node:fs/promises'
const briefing = `/u/andromeda/b/${body.id}/briefing`
const tutorial = (r: import('@playwright/test').Response) =>
  r.url().endsWith('/world') && r.request().postDataJSON().type === 'Tutorial'
async function capture(
  page: import('@playwright/test').Page,
  state: string,
  width: number,
) {
  if (process.env.ORBIT_TEST_SCREENSHOTS !== '1') return
  await page.evaluate(() => scrollTo(0, 0))
  await mkdir('test-results/chat-5', { recursive: true })
  await page
    .locator('img')
    .evaluateAll(async (imgs) =>
      Promise.all(
        imgs
          .filter(
            (i) =>
              i.getBoundingClientRect().width &&
              i.getBoundingClientRect().top < 900,
          )
          .map((i) => i.decode().catch(() => {})),
      ),
    )
  await diagnosticScreenshot(page, {
    path: `test-results/chat-5/${state}-${width}x900.png`,
    fullPage: true,
  })
  await diagnosticScreenshot(page, {
    path: `test-results/chat-5/${state}-viewport-${width}x900.png`,
  })
}
for (const width of [1440, 390]) {
  test(`later-queue recommendations and offline completion without reward history ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const state = await installTutorialFixture(page, 'research')
    await withFixtureResponse(page, tutorial, () => page.goto(briefing))
    await expect(
      page.getByRole('region', { name: 'Recommended next action' }),
    ).toContainText('Energy Technology')
    await withProgressionResponse(
      page,
      (r) => r.type === 'Research',
      () =>
        page
          .getByRole('link', { name: 'Open Energy Technology', exact: true })
          .click(),
    )
    await expect(
      page.getByRole('heading', { name: 'Energy Technology', exact: true }),
    ).toBeVisible()
    await capture(page, 'research-detail', width)
    state.setStage('manufacture')
    await withFixtureResponse(page, tutorial, () => page.goto(briefing))
    await withProgressionResponse(
      page,
      (r) => r.type === 'Manufacture',
      () =>
        page
          .getByRole('link', { name: 'Open Light Fighter', exact: true })
          .click(),
    )
    await expect(
      page.getByRole('heading', { name: 'Light Fighter', exact: true }),
    ).toBeVisible()
    await capture(page, 'manufacture-detail', width)
    state.setStage('reinvest')
    await withFixtureResponse(page, tutorial, () => page.goto(briefing))
    await capture(page, 'reinvestment', width)
    state.setStage('complete')
    await withFixtureResponse(page, tutorial, () => page.reload())
    await expect(
      page.getByRole('button', { name: 'Show full interface' }),
    ).toHaveCount(0)
    await expect(page.getByText(/Automatic reward history/)).toHaveCount(0)
    await expect(
      page.getByRole('link', { name: 'Reward history', exact: true }),
    ).toHaveCount(0)
    await expect(
      page.getByRole('heading', { name: 'An empire of your own', exact: true }),
    ).toBeVisible()
    expect(state.data.receipts).toHaveLength(31)
    await capture(page, 'completion', width)
    expect(
      state.commands.filter(
        (c) => c.type === 'World' && c.action.type === 'OpenTutorial',
      ),
    ).toHaveLength(0)
  })
}
for (const width of [1440, 390])
  test(`guidance failure keeps Overview and Briefing reachable and ordinary pages stay clean ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const state = await installTutorialFixture(page)
    state.error = true
    const failed = page.waitForResponse(tutorial)
    await page.goto(`/u/andromeda/b/${body.id}/overview`)
    const failure = await failed
    expect(failure.status()).toBe(500)
    expect(await failure.finished()).toBeNull()
    const status = page.getByRole('region', { name: 'Briefing status', exact: true })
    await expect(status.getByRole('button', { name: 'Retry briefing', exact: true })).toBeVisible()
    await expect(status.getByRole('link', { name: 'Briefing', exact: true })).toHaveAttribute('href', briefing)
    await capture(page, 'overview-briefing-unavailable', width)
    await status.getByRole('link', { name: 'Briefing', exact: true }).click()
    await expect(
      page.getByRole('button', { name: 'Retry guidance', exact: true }),
    ).toBeVisible()
    state.error = false
    await withFixtureResponse(page, tutorial, () =>
      page.getByRole('button', { name: 'Retry guidance', exact: true }).click(),
    )
    await expect(
      page.getByRole('region', { name: 'Recommended next action' }),
    ).toBeVisible()
    await withFixtureResponse(page, tutorial, () =>
      page.goto(`/u/andromeda/b/${body.id}/defense`),
    )
    await expect(
      page.getByLabel('Opening guidance', { exact: true }),
    ).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: 'Show full interface', exact: true }),
    ).toHaveCount(0)
    await expect(page).toHaveURL(/\/defense$/)
    if (width < 1024)
      await page.getByRole('link', { name: 'Menu', exact: true }).click()
    await page.getByRole('link', { name: 'Briefing', exact: true }).click()
    await expect(
      page.getByRole('region', { name: 'Recommended next action' }),
    ).toBeVisible()
    expect(state.commands).toHaveLength(0)
    expect(state.data.receipts).toHaveLength(0)
  })

for (const width of [1440, 390]) {
  test(`first deuterium directive reveals Facilities under Develop ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    const state = await installTutorialFixture(page)
    const resources = `/u/andromeda/b/${body.id}/resources`
    state.data.recommended_objectives = ['deuterium-2']
    await withFixtureResponse(page, tutorial, () => page.goto(resources))
    const develop = page.getByRole('navigation', {
      name: 'Develop navigation',
      exact: true,
    })
    await expect(
      develop.getByRole('link', { name: 'Facilities', exact: true }),
    ).toHaveCount(0)
    const directive = state.data.chapters
      .flatMap((c) => c.objectives)
      .find((o) => o.id === 'deuterium-1')!
    directive.completed = true
    directive.next_action = null
    directive.inspection = null
    await withFixtureResponse(page, tutorial, () => page.reload())
    const facilities = develop.getByRole('link', {
      name: 'Facilities',
      exact: true,
    })
    await expect(facilities).toBeVisible()
    await withProgressionResponse(
      page,
      (r) => r.type === 'Upgrade',
      () => facilities.click(),
    )
    await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/facilities`)
    await expect(facilities).toHaveAttribute('aria-current', 'page')
    await capture(page, 'deuterium-unlocks-facilities', width)
    expect(state.commands).toHaveLength(0)
  })
}

for (const width of [1100, 390]) {
  test(`Briefing navigation preserves the original command HUD and issues no orders ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    const state = await installTutorialFixture(page)
    await withFixtureResponse(page, tutorial, () =>
      page.goto(`/u/andromeda/b/${body.id}/overview`),
    )
    await expect(
      page.getByRole('region', { name: 'Empire overview', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByLabel('Opening guidance', { exact: true }),
    ).toHaveCount(0)
    await expect(
      page.getByRole('region', { name: 'Recommended next action' }),
    ).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: 'Show full interface', exact: true }),
    ).toHaveCount(0)
    const orb = page.getByRole('button', {
      name: 'Open command HUD',
      exact: true,
    })
    await expect(orb).toBeVisible()
    await expect(page.getByLabel(/Fleet slots:/)).toBeVisible()
    await orb.click()
    const panel = page.getByRole('dialog', {
      name: 'Command uplink',
      exact: true,
    })
    await expect(panel).toBeVisible()
    await expect(
      panel.getByRole('region', { name: 'Your next priority' }),
    ).toHaveCount(0)
    await expect(
      panel.getByRole('link', { name: 'All fleets', exact: true }),
    ).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(orb).toBeFocused()
    await page
      .getByRole('link', { name: 'Read your briefing', exact: true })
      .click()
    await expect(page).toHaveURL(briefing)
    if (width >= 1024) {
      const sidebar = page.getByLabel('Game navigation', { exact: true })
      await expect(
        sidebar.getByRole('link', { name: 'Briefing', exact: true }),
      ).toHaveAttribute('aria-current', 'page')
      await expect(
        sidebar.getByRole('link', { name: 'Empire', exact: true }),
      ).not.toHaveAttribute('aria-current', 'page')
    } else {
      await expect(
        page.getByRole('link', { name: 'Menu', exact: true }),
      ).toHaveAttribute('aria-current', 'page')
      await expect(
        page.getByRole('link', { name: 'Empire', exact: true }),
      ).not.toHaveAttribute('aria-current', 'page')
    }
    await expect(
      page.getByRole('heading', { name: 'Briefing', exact: true }),
    ).toBeFocused()
    await expect(
      page.getByRole('region', { name: 'Recommended next action' }),
    ).toContainText('Solar Plant')
    const job = page.getByRole('region', { name: 'Recommended next action' })
    await expect(
      job.getByRole('img', { name: 'Solar Plant', exact: true }),
    ).toBeVisible()
    const reward = job.getByLabel('Reward', { exact: true })
    await expect(
      reward.getByRole('img', { name: 'Metal', exact: true }),
    ).toBeVisible()
    await expect(
      reward.getByRole('img', { name: 'Crystal', exact: true }),
    ).toBeVisible()
    await expect(
      reward.getByRole('img', { name: 'Deuterium', exact: true }),
    ).toHaveCount(0)
    await expect(reward).toContainText('200')
    await expect(reward).toContainText('100')
    await expect(job).not.toContainText('On accomplishment')
    await expect(job).not.toContainText(
      'Build solar power and crystal production next',
    )
    const cardBounds = (await job.boundingBox())!
    const actionBounds = (await job
      .getByRole('link', { name: 'Open Solar Plant', exact: true })
      .boundingBox())!
    expect(cardBounds.x).toBeGreaterThanOrEqual(0)
    expect(cardBounds.x + cardBounds.width).toBeLessThanOrEqual(width)
    expect(
      cardBounds.x + cardBounds.width - actionBounds.x - actionBounds.width,
    ).toBeLessThanOrEqual(26)
    await withFixtureResponse(page, tutorial, () => page.reload())
    await expect(job).toBeVisible()
    await withFixtureResponse(page, tutorial, () =>
      page.goto(`/u/andromeda/briefing?body=${body.id}`),
    )
    await expect(page).toHaveURL(briefing)
    await withProgressionResponse(
      page,
      (r) => r.type === 'Upgrade',
      () =>
        page
          .getByRole('link', { name: 'Open Solar Plant', exact: true })
          .click(),
    )
    await expect(
      page.getByRole('heading', { name: 'Solar Plant', exact: true }),
    ).toBeVisible()
    expect(state.commands).toHaveLength(0)
  })
}

for (const width of [1100, 390]) {
  test(`opening More keeps messages reachable and promotes navigation with progress ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    const state = await installTutorialFixture(page)
    await withFixtureResponse(page, tutorial, () => page.goto(briefing))
    const menu = page.getByRole('link', { name: 'Menu', exact: true })
    const navigation =
      width >= 1024
        ? page.getByLabel('Game navigation', { exact: true })
        : page.getByRole('navigation', {
            name: 'Menu destinations',
            exact: true,
          })
    if (width < 1024) {
      await expect(
        page.getByRole('link', { name: 'Fleets', exact: true }),
      ).not.toBeVisible()
      await menu.click()
    }
    for (const name of ['Messages', 'Reports', 'Fleets', 'Facilities'])
      await expect(
        navigation.getByRole('link', { name, exact: true }),
      ).not.toBeVisible()
    await navigation
      .locator('summary')
      .filter({ hasText: 'More' })
      .press('Enter')
    const more = navigation.getByRole('navigation', {
      name: 'More navigation',
      exact: true,
    })
    for (const name of ['Messages', 'Reports', 'Fleets', 'Facilities'])
      await expect(more.getByRole('link', { name, exact: true })).toBeVisible()
    await withFixtureResponse(
      page,
      (r) => r.url().endsWith('/social/query'),
      () => more.getByRole('link', { name: 'Messages', exact: true }).click(),
    )
    await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/messages`)
    await expect(
      page.getByRole('heading', { name: 'Messages', exact: true, level: 1 }),
    ).toBeVisible()
    if (width < 1024) {
      await expect(menu).toHaveAttribute('aria-current', 'page')
      await menu.click()
      await navigation.locator('summary').filter({ hasText: 'More' }).click()
    } else {
      await expect(
        more.getByRole('link', { name: 'Messages', exact: true }),
      ).toHaveAttribute('aria-current', 'page')
    }
    await withProgressionResponse(
      page,
      (r) => r.type === 'Upgrade',
      () => more.getByRole('link', { name: 'Facilities', exact: true }).click(),
    )
    await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/facilities`)
    if (width < 1024) {
      await expect(menu).toHaveAttribute('aria-current', 'page')
      await menu.click()
    } else {
      await expect(
        more.getByRole('link', { name: 'Facilities', exact: true }),
      ).toHaveAttribute('aria-current', 'page')
    }
    if (width >= 1024)
      await expect(
        navigation.getByRole('link', { name: 'Develop', exact: true }),
      ).not.toHaveAttribute('aria-current', 'page')
    state.setStage('fighter-site')
    await withFixtureResponse(page, tutorial, () => page.goto(briefing))
    if (width < 1024) {
      await expect(
        page.getByRole('link', { name: 'Fleets', exact: true }),
      ).toBeVisible()
      await menu.click()
    }
    for (const name of width >= 1024
      ? ['Reports', 'Fleets', 'Facilities']
      : ['Reports']) {
      await expect(
        navigation.getByRole('link', { name, exact: true }),
      ).toBeVisible()
      await expect(more.getByRole('link', { name, exact: true })).toHaveCount(0)
    }
    expect(state.commands).toHaveLength(0)
  })
}

for (const width of [1440, 390]) {
  test(`overview briefing shrinks after one accomplishment and orb keeps its link until completion ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    const state = await installTutorialFixture(page)
    const overview = `/u/andromeda/b/${body.id}/overview`
    await withFixtureResponse(page, tutorial, () => page.goto(overview))
    await expect(
      page.getByRole('region', { name: 'Your advisor', exact: true }),
    ).toBeVisible()
    const orb = page.getByTestId('command-orb')
    await orb.click()
    const panel = page.getByRole('dialog', {
      name: 'Command uplink',
      exact: true,
    })
    const briefingButton = panel.getByRole('link', {
      name: 'Briefing',
      exact: true,
    })
    await expect(briefingButton).toHaveAttribute(
      'data-button-variant',
      'secondary',
    )
    const titleBounds = (await panel
      .getByRole('heading', { name: 'Command uplink', exact: true })
      .boundingBox())!
    const buttonBounds = (await briefingButton.boundingBox())!
    expect(buttonBounds.x).toBeGreaterThanOrEqual(
      titleBounds.x + titleBounds.width,
    )
    expect(buttonBounds.y).toBeLessThan(titleBounds.y + titleBounds.height)
    expect(buttonBounds.y + buttonBounds.height).toBeGreaterThan(titleBounds.y)
    await briefingButton.click()
    await expect(page).toHaveURL(briefing)
    await expect(panel).toHaveCount(0)
    state.earnMine()
    await withFixtureResponse(page, tutorial, () => page.goto(overview))
    await expect(
      page.getByRole('region', { name: 'Your advisor', exact: true }),
    ).toHaveCount(0)
    const progress = page.getByRole('region', {
      name: 'Briefing progress',
      exact: true,
    })
    await expect(progress).toContainText('Step 2 of 31')
    await expect(progress).toContainText('30 steps remaining')
    await expect(
      progress.getByRole('link', { name: 'Open briefing', exact: true }),
    ).toHaveAttribute('href', briefing)
    const box = (await progress.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(width)
    expect(box.height).toBeLessThan(130)
    await page
      .getByRole('dialog', { name: 'Nicely done!', exact: true })
      .getByRole('button', { name: 'Command uplink', exact: true })
      .click()
    await expect(
      panel.getByRole('link', { name: 'Briefing', exact: true }),
    ).toBeVisible()
    await page.keyboard.press('Escape')
    state.setStage('complete')
    await withFixtureResponse(page, tutorial, () => page.reload())
    await expect(progress).toHaveCount(0)
    await expect(
      page.getByRole('region', { name: 'Your advisor', exact: true }),
    ).toHaveCount(0)
    await page
      .getByRole('dialog', { name: 'Nicely done!', exact: true })
      .getByRole('button', { name: 'Command uplink', exact: true })
      .click()
    await expect(panel).toBeVisible()
    await expect(
      panel.getByRole('link', { name: 'Briefing', exact: true }),
    ).toHaveCount(0)
    expect(state.commands).toHaveLength(0)
  })
}

for (const width of [1440, 390]) {
  test(`chapter headings disclose independently with keyboard and reduced motion ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    const chapterState = await installTutorialFixture(page)
    await withFixtureResponse(page, tutorial, () => page.goto(briefing))
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
      `/u/andromeda/b/${body.id}/resources/crystal-mine`,
    )
    await withProgressionResponse(
      page,
      (request) =>
        request.type === 'Upgrade' && request.building === 'CrystalMine',
      () => crystalOpen.click(),
    )
    await expect(page).toHaveURL(
      `/u/andromeda/b/${body.id}/resources/crystal-mine`,
    )
    await expect(
      page.getByRole('heading', { name: 'Crystal Mine', exact: true }),
    ).toBeVisible()
    expect(chapterState.commands).toHaveLength(0)
  })
}

for (const width of [1440, 390]) {
  test(`full experience confirmation preserves briefing progress and rewards ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    const state = await installTutorialFixture(page)
    state.earnMine()
    const receipts = structuredClone(state.data.receipts)
    const objectives = structuredClone(state.data.chapters)
    await withFixtureResponse(page, tutorial, () => page.goto(briefing))
    const enter = page.getByRole('button', {
      name: 'Enter Full Experience',
      exact: true,
    })
    await expect(enter).toHaveAttribute('data-button-variant', 'secondary')
    const titleBounds = (await page
      .getByRole('heading', { name: 'Briefing', level: 1, exact: true })
      .boundingBox())!
    const buttonBounds = (await enter.boundingBox())!
    expect(buttonBounds.x).toBeGreaterThan(titleBounds.x + titleBounds.width)
    expect(buttonBounds.y).toBeLessThan(titleBounds.y + titleBounds.height)
    expect(buttonBounds.x + buttonBounds.width).toBeLessThanOrEqual(width)
    await enter.click()
    const confirm = page.getByRole('dialog', {
      name: 'Leave beginner mode?',
      exact: true,
    })
    await expect(confirm).toContainText('earning every reward')
    await expect(confirm).toContainText('appears naturally')
    const stay = confirm.getByRole('button', {
      name: 'Stay in beginner mode',
      exact: true,
    })
    await expect(stay).toBeFocused()
    await stay.click()
    await expect(enter).toBeFocused()
    expect(state.commands).toHaveLength(0)
    expect(state.data.beginner).toBe(true)
    await enter.click()
    const accept = confirm.getByRole('button', {
      name: 'Enter Full Experience',
      exact: true,
    })
    await expect(accept).toHaveAttribute('data-button-variant', 'primary')
    await withFixtureResponse(page, tutorial, () => accept.click())
    await expect(confirm).toHaveCount(0)
    await expect(enter).toHaveCount(0)
    await expect(
      page.getByRole('region', { name: 'Recommended next action' }),
    ).toBeVisible()
    expect(state.commands).toEqual([
      {
        type: 'World',
        action: { type: 'SetTutorialPresentation', beginner: false },
      },
    ])
    expect(state.data.receipts).toEqual(receipts)
    expect(state.data.chapters).toEqual(objectives)
    await withFixtureResponse(page, tutorial, () => page.reload())
    await expect(enter).toHaveCount(0)
    await expect(
      page.getByRole('link', { name: 'Fleets', exact: true }),
    ).toBeVisible()
  })
}
