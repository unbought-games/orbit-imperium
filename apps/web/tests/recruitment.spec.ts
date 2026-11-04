import { test, expect, type Page } from './fixtures/test'
import { binding } from './fixtures/game'
import { recruitmentFixture as fixture, pathMatches, invitationPath } from './fixtures/recruitment'
import { withFixtureResponse } from './fixtures/responses'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
async function capture(page: Page, name: string, width: number) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await diagnosticScreenshot(page, {
    path: `test-results/recruitment-${name}-${width}x900.png`,
    fullPage: true,
  })
}
for (const width of [1440, 390]) {
  test.describe(`recruitment ${width}px`, () => {
    test.use({
      viewport: { width, height: 900 },
      isMobile: width < 768,
      hasTouch: width < 768,
    })
    test('public discovery filters are usable and no-result states preserve the search controls', async ({
      page,
    }) => {
      await fixture(page)
      await withFixtureResponse(page, pathMatches('/recruitment'), () =>
        page.goto(`/alliances/${binding.universe}`),
      )
      await expect(
        page.getByRole('link', { name: 'View STAR', exact: true }),
      ).toBeVisible()
      await capture(page, 'directory', width)
      await page.getByLabel('Language', { exact: true }).selectOption('de')
      await withFixtureResponse(page, pathMatches('/recruitment'), () =>
        page.getByRole('button', { name: 'Find recruiting alliances' }).click(),
      )
      await expect(
        page.getByText('No recruiting alliances match.', { exact: false }),
      ).toBeVisible()
      await expect(page.getByLabel('Language', { exact: true })).toHaveValue(
        'de',
      )
      await capture(page, 'directory-empty', width)
    })
    test('recruitment managers opt into discovery and create or disable a reusable invitation', async ({
      page,
    }) => {
      const f = await fixture(page, { manager: true })
      await withFixtureResponse(page, pathMatches('/alliances/query'), () =>
        page.goto('/u/andromeda/alliance'),
      )
      await page.getByRole('button', { name: 'Settings', exact: true }).click()
      await page.getByLabel('List in recruitment directory').uncheck()
      await page
        .getByLabel('Activity expectations', { exact: true })
        .selectOption('')
      await page
        .getByRole('button', { name: 'Save recruitment preferences' })
        .click()
      await expect(
        page.getByRole('button', { name: 'Create invitation link' }),
      ).toBeEnabled()
      await page.getByRole('button', { name: 'Create invitation link' }).click()
      await expect(
        page.getByLabel('Invitation link', { exact: true }),
      ).toHaveValue(new RegExp(`${invitationPath}$`))
      await capture(page, 'settings', width)
      await page
        .getByRole('button', { name: 'Disable invitation link', exact: true })
        .click()
      await page
        .getByRole('button', {
          name: 'Confirm disable invitation link',
          exact: true,
        })
        .click()
      await expect(
        page.getByRole('button', { name: 'Create invitation link' }),
      ).toBeVisible()
      expect(f.commands.map((c) => c.action.type)).toEqual([
        'SetRecruitmentProfile',
        'SetInvitation',
        'SetInvitation',
      ])
      expect(f.commands[0].action).toMatchObject({
        profile: { listed: false, activity: null },
      })
    })
  })
}
