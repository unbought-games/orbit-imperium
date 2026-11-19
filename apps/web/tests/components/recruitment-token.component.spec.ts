import { test, expect } from './fixture'
import {
  tokenReadPath,
  installPublicToken,
} from '../fixtures/public-invitation'
import { invitationPath } from '../fixtures/recruitment'
import { withFixtureResponse } from '../fixtures/responses'
test('a recruitment reward link returns to its actual native token path', async ({
  page,
}) => {
  await installPublicToken(page)
  await withFixtureResponse(
    page,
    (r) => new URL(r.url()).pathname === tokenReadPath,
    () =>
      page.goto(
        invitationPath +
          '?rewards_invitation=inv_fixture&scenario=recruitment-token',
      ),
  )
  await expect(page.locator('html')).toHaveAttribute(
    'data-component-ready',
    'recruitment-token',
  )
  const action = page.getByRole('link', { name: /Apply to Starlight Assembly/ })
  const url = new URL(
    (await action.getAttribute('href'))!,
    'https://orbit.invalid',
  )
  expect(url.pathname).toBe('/invite/inv_fixture')
  expect(url.searchParams.get('continue')).toBe(invitationPath)
})
