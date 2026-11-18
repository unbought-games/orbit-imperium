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

test('a reward invitation carries normal entry back to its native alliance token page', async ({
  page,
}) => {
  await fixture(page, { authenticated: false, enrolled: false })
  await withFixtureResponse(page, pathMatches(`/invitations/${token}`), () =>
    page.goto(`${invitationPath}?rewards_invitation=inv_fixture`),
  )
  const href = await page
    .getByRole('link', { name: 'Apply to Starlight Assembly', exact: false })
    .getAttribute('href')
  const destination = new URL(href!, 'https://orbit.invalid')
  expect(destination.pathname).toBe('/invite/inv_fixture')
  expect(destination.searchParams.get('continue')).toBe(invitationPath)
})

test('public directory entry loads linked alliances at desktop and mobile widths', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await fixture(page)
  await withFixtureResponse(page, pathMatches('/recruitment'), () =>
    page.goto(`/alliances/${binding.universe}`),
  )
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    const link = page.getByRole('link', { name: 'View STAR', exact: true })
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute(
      'href',
      `/alliances/${binding.universe}/${alliance}`,
    )
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  }
})
