import { test, expect } from './fixtures/test'
import { installTutorialFixture } from './fixtures/tutorial'
import { body } from './fixtures/game'
import {
  withBootstrapResponse,
  withFixtureResponse,
  withProgressionResponse,
} from './fixtures/responses'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { mkdir } from 'node:fs/promises'
const briefing = `/u/andromeda/b/${body.id}/briefing`
const tutorial = (r: import('@playwright/test').Response) =>
  r.url().endsWith('/world') && r.request().postDataJSON().type === 'Tutorial'

test('opening the book before guidance arrives acknowledges the delivered briefing', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 })
  const state = await installTutorialFixture(page)
  state.data.beginner = false
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  state.hold = () => held
  const overview = `/u/andromeda/b/${body.id}/overview`
  await withBootstrapResponse(page, () => page.goto(overview))
  await page.getByRole('link', { name: 'Open briefing', exact: true }).click()
  await expect(
    page.getByRole('region', { name: 'Briefing', exact: true }),
  ).toContainText('Receiving your briefing')
  await withFixtureResponse(page, tutorial, async () => {
    state.hold = null
    release()
  })
  await expect(
    page.getByRole('region', { name: 'Recommended next action' }),
  ).toBeVisible()
  await withFixtureResponse(page, tutorial, () => page.goto(overview))
  await expect(
    page.getByRole('link', { name: 'Open briefing', exact: true }),
  ).toHaveAttribute('data-attention', 'false')
  state.earnMine()
  await withFixtureResponse(page, tutorial, () => page.reload())
  await expect(
    page.getByRole('link', {
      name: 'Open briefing — unread updates',
      exact: true,
    }),
  ).toHaveAttribute('data-attention', 'true')
  expect(state.commands).toHaveLength(0)
})

for (const width of [1440, 390]) {
  test(`Empire briefing icon opens by keyboard or touch and remembers acknowledged progress at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const state = await installTutorialFixture(page)
    state.data.beginner = false
    const overview = `/u/andromeda/b/${body.id}/overview`
    const icon = page.getByRole('link', { name: /^Open briefing/ })
    await withFixtureResponse(page, tutorial, () => page.goto(overview))
    await expect(icon).toHaveAttribute('data-attention', 'true')
    await expect(icon).toHaveAttribute('href', briefing)
    const heading = page.getByRole('heading', { name: 'Empire', exact: true })
    const spacing = await heading.evaluate((el) => {
      const header = el.parentElement!
      return {
        gap:
          header.nextElementSibling!.getBoundingClientRect().top -
          el.getBoundingClientRect().bottom,
        extraHeight:
          header.getBoundingClientRect().height -
          el.getBoundingClientRect().height,
      }
    })
    expect(spacing.gap).toBe(8)
    expect(spacing.extraHeight).toBe(8)
    expect(
      await icon.evaluate(
        (el) => getComputedStyle(el, '::before').animationName,
      ),
    ).toBe('none')
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    expect(
      await icon
        .locator('span > span')
        .first()
        .evaluate((el) => el.getAnimations({ subtree: true }).length),
    ).toBeGreaterThan(0)
    expect(
      await icon.evaluate(
        (el) => getComputedStyle(el, '::before').animationName,
      ),
    ).not.toBe('none')
    expect(
      await icon
        .locator('span > span')
        .first()
        .evaluate((el) => getComputedStyle(el, '::before').animationName),
    ).not.toBe('none')
    await diagnosticScreenshot(page, {
      path: `test-results/briefing-unread-${width}x900.png`,
    })
    if (process.env.ORBIT_TEST_SCREENSHOTS === '1') {
      const book = await icon.locator('svg').boundingBox()
      const bar = await page
        .getByRole('group', { name: 'Planet and resources' })
        .boundingBox()
      const edgeScroll = book!.y + book!.height / 2 - (bar!.y + bar!.height)
      for (const [state, scroll] of [
        ['crossing', edgeScroll],
        ['hidden', edgeScroll + 48],
      ] as const) {
        await page.evaluate((y) => window.scrollTo(0, y), scroll)
        await diagnosticScreenshot(page, {
          path: `test-results/briefing-${state}-${width}x900.png`,
        })
      }
      await page.evaluate(() => window.scrollTo(0, 0))
    }
    if (width === 1440) {
      await icon.hover()
      const enterTransitions = await icon.evaluate(async (el) => {
        const transitions = el
          .getAnimations({ subtree: true })
          .filter(
            (animation): animation is CSSTransition =>
              animation instanceof CSSTransition,
          )
        const properties = transitions.map(
          (animation) => animation.transitionProperty,
        )
        await Promise.all(transitions.map((animation) => animation.finished))
        return properties
      })
      expect(enterTransitions).toContain('opacity')
      expect(enterTransitions).toContain('filter')
      expect(
        await icon.evaluate(
          (el) => getComputedStyle(el, '::after').animationName,
        ),
      ).not.toBe('none')
      expect(
        await icon.evaluate((el) => getComputedStyle(el).backgroundColor),
      ).toBe('rgba(0, 0, 0, 0)')
      expect(
        await icon.evaluate((el) => getComputedStyle(el, '::after').opacity),
      ).toBe('0.75')
      await diagnosticScreenshot(page, {
        path: `test-results/briefing-hover-${width}x900.png`,
      })
      await page.mouse.move(0, 0)
      const exitTransitions = await icon.evaluate(async (el) => {
        const transitions = el
          .getAnimations({ subtree: true })
          .filter(
            (animation): animation is CSSTransition =>
              animation instanceof CSSTransition,
          )
        const properties = transitions.map(
          (animation) => animation.transitionProperty,
        )
        await Promise.all(transitions.map((animation) => animation.finished))
        return properties
      })
      expect(exitTransitions).toContain('opacity')
      expect(exitTransitions).toContain('filter')
      expect(
        await icon.evaluate((el) => getComputedStyle(el, '::after').opacity),
      ).toBe('0')
      await icon.focus()
      await page.keyboard.press('Enter')
    } else {
      const bounds = await icon.boundingBox()
      expect(bounds?.width).toBeGreaterThanOrEqual(44)
      expect(bounds?.height).toBeGreaterThanOrEqual(44)
      await icon.click()
    }
    await expect(page).toHaveURL(briefing)
    await expect(
      page.getByRole('region', { name: 'Briefing', exact: true }),
    ).toBeVisible()
    await withFixtureResponse(page, tutorial, () => page.goto(overview))
    await expect(icon).toHaveAttribute('data-attention', 'false')
    await page.mouse.move(0, 0)
    await diagnosticScreenshot(page, {
      path: `test-results/briefing-read-${width}x900.png`,
    })
    state.earnMine()
    await withFixtureResponse(page, tutorial, () => page.reload())
    await expect(icon).toHaveAttribute('data-attention', 'true')
    await icon.click()
    await expect(page).toHaveURL(briefing)
    await withFixtureResponse(page, tutorial, () => page.goto(overview))
    await expect(icon).toHaveAttribute('data-attention', 'false')
    if (width === 390) await page.setViewportSize({ width: 320, height: 900 })
    expect(
      await icon.evaluate((element) => {
        // Check the glow at its largest instead of relying on the render phase.
        const animations = element.getAnimations({ subtree: true })
        const glow = animations.find(
          (animation): animation is CSSAnimation =>
            animation instanceof CSSAnimation &&
            animation.animationName.includes('breathe'),
        )!
        const peak = Number(glow.effect!.getTiming().duration) / 2
        for (const animation of animations) {
          animation.pause()
          animation.currentTime = peak
        }
        return document.documentElement.scrollWidth - innerWidth
      }),
    ).toBe(0)
    if (width === 390) {
      await diagnosticScreenshot(page, {
        path: 'test-results/briefing-glow-320x900.png',
      })
    }
    expect(state.commands).toHaveLength(0)
  })
}

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
    const status = page.getByRole('region', {
      name: 'Briefing status',
      exact: true,
    })
    await expect(
      status.getByRole('button', { name: 'Retry briefing', exact: true }),
    ).toBeVisible()
    await expect(
      status.getByRole('link', { name: 'Briefing', exact: true }),
    ).toHaveAttribute('href', briefing)
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
    if (width < 1024) {
      await page.getByRole('link', { name: 'Menu', exact: true }).click()
      await expect(
        page
          .getByRole('region', { name: 'Guidance', exact: true })
          .getByRole('link', { name: 'Briefing', exact: true }),
      ).toBeVisible()
      await expect(
        page.getByRole('heading', { name: 'Guidance', exact: true }),
      ).toBeVisible()
    }
    await page.getByRole('link', { name: 'Briefing', exact: true }).click()
    await expect(
      page.getByRole('region', { name: 'Recommended next action' }),
    ).toBeVisible()
    expect(state.commands).toHaveLength(0)
    expect(state.data.receipts).toHaveLength(0)
    await withFixtureResponse(page, tutorial, () =>
      page.goto(`/u/andromeda/b/${body.id}/overview`),
    )
    await expect(
      page.getByRole('link', { name: 'Open briefing', exact: true }),
    ).toHaveAttribute('data-attention', 'false')
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
  test(`Briefing navigation preserves the original command HUD and issues no orders ${width}`, { tag: (width === 390) ? '@journey' : [] }, async ({
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
      page.goto(`/u/andromeda/b/${body.id}/briefing`),
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
    for (const name of ['Messages', 'Alliance', 'Reports', 'Fleets', 'Facilities'])
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
    for (const name of ['Messages', 'Alliance', 'Reports', 'Fleets', 'Facilities'])
      await expect(more.getByRole('link', { name, exact: true })).toBeVisible()
    await expect(more.getByRole('link', { name: 'Alliance', exact: true })).toHaveAttribute(
      'href',
      `/u/andromeda/b/${body.id}/alliance`,
    )
    await diagnosticScreenshot(page, {
      path: `test-results/beginner-more-${width}x900.png`,
    })
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
  test(`chapter links navigate to the actual catalog without issuing orders ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    const state = await installTutorialFixture(page)
    await withFixtureResponse(page, tutorial, () => page.goto(briefing))
    await page
      .getByRole('heading', { level: 3, name: /Establish the colony/ })
      .getByRole('button')
      .click()
    const link = page.getByRole('link', {
      name: 'Open: Build Crystal Mine level 1',
      exact: true,
    })
    await expect(link).toHaveAttribute(
      'href',
      `/u/andromeda/b/${body.id}/resources/crystal-mine`,
    )
    await withProgressionResponse(
      page,
      (request) =>
        request.type === 'Upgrade' && request.building === 'CrystalMine',
      () => link.click(),
    )
    await expect(page).toHaveURL(
      `/u/andromeda/b/${body.id}/resources/crystal-mine`,
    )
    await expect(
      page.getByRole('heading', { name: 'Crystal Mine', exact: true }),
    ).toBeVisible()
    expect(state.commands).toHaveLength(0)
  })
}

for (const width of [1440, 390]) {
  test(`full experience confirmation preserves briefing progress and rewards ${width}`, { tag: (width === 1440) ? '@journey' : [] }, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    const state = await installTutorialFixture(page)
    state.earnMine()
    const receipts = structuredClone(state.data.receipts)
    const objectives = structuredClone(state.data.chapters)
    await withFixtureResponse(page, tutorial, () => page.goto(briefing))
    const sidebarBriefing = page
      .getByLabel('Game navigation', { exact: true })
      .getByRole('link', { name: 'Briefing', exact: true, includeHidden: true })
    await expect(sidebarBriefing).toHaveCount(1)
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
    await expect(sidebarBriefing).toHaveCount(0)
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
    await expect(sidebarBriefing).toHaveCount(0)
    await expect(
      page.getByRole('link', { name: 'Fleets', exact: true }),
    ).toBeVisible()
    await withFixtureResponse(page, tutorial, () =>
      page.goto(`/u/andromeda/b/${body.id}/overview`),
    )
    const book = page.getByRole('link', { name: /^Open briefing/ })
    await expect(book).toBeVisible()
    await expect(sidebarBriefing).toHaveCount(0)
    await diagnosticScreenshot(page, {
      path: `test-results/briefing-full-mode-${width}x900.png`,
    })
    await book.click()
    await expect(page).toHaveURL(briefing)
    await expect(
      page.getByRole('region', { name: 'Briefing', exact: true }),
    ).toBeVisible()
  })
}
