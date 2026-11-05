import { test, expect } from './fixtures/test'
import { installTutorialFixture } from './fixtures/tutorial'
import { body } from './fixtures/game'
import {
  withFixtureResponse,
  withProgressionResponse,
} from './fixtures/responses'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { mkdir } from 'node:fs/promises'
const overview = `/u/andromeda/b/${body.id}/overview`
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
  test(`later-queue recommendations and offline completion history ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const state = await installTutorialFixture(page, 'research')
    await withFixtureResponse(page, tutorial, () => page.goto(overview))
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
    await withFixtureResponse(page, tutorial, () => page.goto(overview))
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
    await withFixtureResponse(page, tutorial, () => page.goto(overview))
    await capture(page, 'reinvestment', width)
    state.setStage('complete')
    await withFixtureResponse(page, tutorial, () => page.reload())
    await expect(
      page.getByRole('button', { name: 'Show full interface' }),
    ).toHaveCount(0)
    await page
      .getByRole('button', { name: 'View guidance & reward history' })
      .click()
    await page
      .getByText('Automatic reward history · 27 accomplishments', {
        exact: true,
      })
      .click()
    await expect(
      page.getByText(
        'These rewards were paid at accomplishment, even while you were away.',
        { exact: false },
      ),
    ).toBeVisible()
    await capture(page, 'completion-history', width)
    expect(
      state.commands.filter(
        (c) => c.type === 'World' && c.action.type === 'OpenTutorial',
      ),
    ).toHaveLength(0)
  })
}
for (const width of [1440, 390])
  test(`guidance error recovery and hidden-route escape keep ordinary access ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    const state = await installTutorialFixture(page)
    state.error = true
    const failed = page.waitForResponse(tutorial)
    await page.goto(overview)
    expect((await failed).status()).toBe(500)
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
      page.getByText('This area is part of the full interface.', {
        exact: false,
      }),
    ).toBeVisible()
    await withFixtureResponse(page, tutorial, () =>
      page
        .getByRole('button', { name: 'Show full interface', exact: true })
        .click(),
    )
    await expect(page).toHaveURL(/\/defense$/)
    await expect(
      page.getByText('This area is part of the full interface.', {
        exact: false,
      }),
    ).toHaveCount(0)
    expect(state.data.receipts).toHaveLength(0)
  })
