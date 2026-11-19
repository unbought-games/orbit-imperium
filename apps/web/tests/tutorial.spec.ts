import { test, expect } from './fixtures/test'
import { installTutorialFixture } from './fixtures/tutorial'
import { body } from './fixtures/game'
import { withFixtureResponse } from './fixtures/responses'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
const briefing = `/u/andromeda/b/${body.id}/briefing`
const tutorial = (r: import('@playwright/test').Response) =>
  r.url().endsWith('/world') && r.request().postDataJSON().type === 'Tutorial'

test(
  'full experience confirmation preserves progress and rewards across reload',
  { tag: '@journey' },
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
