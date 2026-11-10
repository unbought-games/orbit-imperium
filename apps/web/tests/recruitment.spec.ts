import { test, expect } from './fixtures/test'
import { binding } from './fixtures/game'
import {
  recruitmentFixture as fixture,
  pathMatches,
} from './fixtures/recruitment'
import { withFixtureResponse } from './fixtures/responses'

// Keep real public-route entry and populated-row layout. Filtering/empty results
// and manager preference/invitation controls live in isolated component specs.
for (const width of [1440, 390]) {
  test.describe(`public recruitment entry ${width}px`, () => {
    test.use({
      viewport: { width, height: 900 },
      isMobile: width < 768,
      hasTouch: width < 768,
    })
    test('public directory loads alliance links without overflowing', async ({
      page,
    }) => {
      await fixture(page)
      await withFixtureResponse(page, pathMatches('/recruitment'), () =>
        page.goto(`/alliances/${binding.universe}`),
      )
      await expect(
        page.getByRole('link', { name: 'View STAR', exact: true }),
      ).toBeVisible()
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
    })
  })
}
