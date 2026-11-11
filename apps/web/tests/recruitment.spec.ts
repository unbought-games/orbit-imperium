import { test, expect } from './fixtures/test'
import { binding } from './fixtures/game'
import {
  recruitmentFixture as fixture,
  pathMatches,
  alliance,
  token,
  invitationPath,
} from './fixtures/recruitment'
import { withFixtureResponse } from './fixtures/responses'

// Only the public entry boundary: no login, enrollment, or multi-document auth journey.
test('a public invitation resolves its token and links to the returned alliance', async ({
  page,
}) => {
  await fixture(page, { authenticated: false, enrolled: false })
  await withFixtureResponse(page, pathMatches(`/invitations/${token}`), () =>
    page.goto(invitationPath),
  )
  await expect(
    page.getByRole('heading', { name: 'Starlight Assembly', exact: true }),
  ).toBeVisible()
  const link = page.getByRole('link', {
    name: 'Apply to Starlight Assembly',
    exact: false,
  })
  const href = await link.getAttribute('href')
  const login = new URL(href!, 'https://orbit.invalid')
  const destination = new URL(login.searchParams.get('redirect')!, login.origin)
  expect(destination.pathname).toBe(`/join/${binding.universe}`)
  expect(destination.searchParams.get('alliance')).toBe(alliance)
  expect(destination.searchParams.get('invitation')).toBe(token)
})

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
