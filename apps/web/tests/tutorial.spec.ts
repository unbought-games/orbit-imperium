import { test, expect } from './fixtures/test'
import { installTutorialFixture } from './fixtures/tutorial'
import { body } from './fixtures/game'
import { withFixtureResponse } from './fixtures/responses'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
const briefing = `/u/andromeda/b/${body.id}/briefing`
const tutorial = (r: import('@playwright/test').Response) =>
  r.url().endsWith('/world') && r.request().postDataJSON().type === 'Tutorial'

for (const width of [1440]) {
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
    const headingBox = await heading.boundingBox()
    const totalsBox = await page
      .getByLabel('Empire resource totals', { exact: true })
      .boundingBox()
    const iconBox = await icon.boundingBox()
    // The name now shares the header with an emblem and rename control. Keep
    // its compact gap to the ledger and keep briefing independent of the name.
    const gap = totalsBox!.y - (headingBox!.y + headingBox!.height)
    expect(gap).toBeGreaterThanOrEqual(0)
    expect(gap).toBeLessThanOrEqual(16)
    expect(iconBox!.x).toBeGreaterThanOrEqual(headingBox!.x + headingBox!.width)
    expect(iconBox!.y + iconBox!.height).toBeLessThanOrEqual(totalsBox!.y)
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

test(
  'full experience confirmation preserves progress and rewards across reload',
  async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
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
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      const titleBounds = (await page
        .getByRole('heading', { name: 'Briefing', level: 1, exact: true })
        .boundingBox())!
      const buttonBounds = (await enter.boundingBox())!
      expect(buttonBounds.x).toBeGreaterThan(titleBounds.x + titleBounds.width)
      expect(buttonBounds.y).toBeLessThan(titleBounds.y + titleBounds.height)
      expect(buttonBounds.x + buttonBounds.width).toBeLessThanOrEqual(width)
    }
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
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      await expect(
        page.getByRole('link', { name: 'Fleets', exact: true }),
      ).toBeVisible()
    }
    await withFixtureResponse(page, tutorial, () =>
      page.goto(`/u/andromeda/b/${body.id}/overview`),
    )
    const book = page.getByRole('link', { name: /^Open briefing/ })
    await expect(book).toBeVisible()
    await expect(sidebarBriefing).toHaveCount(0)
    await diagnosticScreenshot(page, {
      path: 'test-results/briefing-full-mode-390x900.png',
    })
    await book.click()
    await expect(page).toHaveURL(briefing)
    await expect(
      page.getByRole('region', { name: 'Briefing', exact: true }),
    ).toBeVisible()
  },
)
