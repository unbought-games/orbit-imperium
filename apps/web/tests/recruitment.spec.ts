import { test, expect } from './fixtures/test'
import { binding } from './fixtures/game'
import { alliance, token, invitationPath } from './fixtures/recruitment'
import { installPublicToken, tokenReadPath } from './fixtures/public-invitation'
import { withFixtureResponse } from './fixtures/responses'

// Only the public entry boundary: no login, enrollment, or multi-document auth journey.
test('a public invitation resolves its token and links to the returned alliance', async ({
  page,
}) => {
  await installPublicToken(page)
  await withFixtureResponse(
    page,
    (response) =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname === tokenReadPath,
    () => page.goto(invitationPath),
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
