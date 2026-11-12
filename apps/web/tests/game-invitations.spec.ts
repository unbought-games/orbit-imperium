import { readFileSync } from 'node:fs'
import { test, expect } from './fixtures/test'
import { installGameFixture, binding } from './fixtures/game'
import {
  withFixtureResponse,
  withFixtureResponseStatus,
} from './fixtures/responses'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import type { Page } from '@playwright/test'

const code = 'inv_fixture-A_9'
const ownerFixture = JSON.parse(
  readFileSync(
    new URL(
      '../../../contracts/fixtures/community-owner.json',
      import.meta.url,
    ),
    'utf8',
  ),
)
const previewResponse = (response: import('@playwright/test').Response) =>
  new URL(response.url()).pathname === '/api/v1/rewards/invitation-preview'
async function fixture(
  page: Page,
  authenticated: boolean,
  unavailable = false,
) {
  await installGameFixture(page, { protocol: 4 })
  await page.route('**/api/v1/bootstrap', (route) =>
    route.fulfill({
      json: {
        version: 1,
        signup_enabled: true,
        result: authenticated
          ? {
              status: 'authenticated',
              session: {
                account: binding.account,
                csrf: 'invitation-csrf',
                expires_at: 9999999999999,
                memberships: [],
              },
              game: { status: 'no_membership' },
            }
          : { status: 'anonymous' },
      },
    }),
  )
  await page.route('**/api/auth/config', (route) =>
    route.fulfill({
      json: {
        mode: 'oidc',
        client_id: 'fixture-orbit',
        hosted_universe: binding.universe,
        accounts_url: 'https://accounts.example.test',
        universes: [{ universe: binding.universe, name: 'Andromeda' }],
      },
    }),
  )
  let hasInvitation = false
  const actions: {
    request_id: string
    action: { type: string; code?: string; game_id?: string }
  }[] = []
  const owner = (origin: string) => ({
    ...ownerFixture,
    invitations: hasInvitation
      ? [
          {
            ...ownerFixture.invitations[0],
            code,
            url: `${origin}/invite/${code}`,
          },
        ]
      : [],
    games: [
      {
        ...ownerFixture.games[0],
        invitation_management_url: `${origin}/invitations`,
      },
    ],
  })
  await page.route('**/api/v1/rewards', (route) =>
    route.fulfill({ json: owner(new URL(route.request().url()).origin) }),
  )
  await page.route('**/api/v1/rewards/invitation-preview?*', (route) =>
    route.fulfill(
      unavailable
        ? { status: 503, json: { code: 'Unavailable' } }
        : {
            json: {
              code,
              kind: 'personal',
              inviter_name: 'Fixture commander',
              alliance_name: null,
              alliance: null,
              game_id: 'orbit-imperium',
              game_name: 'Orbit Imperium',
              url: `${new URL(route.request().url()).origin}/invite/${code}`,
              requires_game_check: false,
              preview_version: 'v1',
              accepted: false,
              attribution_locked: false,
            },
          },
    ),
  )
  await page.route('**/api/v1/rewards/actions', (route) => {
    const body = route.request().postDataJSON()
    actions.push(body)
    expect(route.request().headers()['x-csrf-token']).toBe('invitation-csrf')
    if (unavailable)
      return route.fulfill({ status: 503, json: { code: 'Unavailable' } })
    if (body.action.type === 'create_invitation') hasInvitation = true
    return route.fulfill({
      json: {
        contract_version: 1,
        result:
          body.action.type === 'create_invitation'
            ? {
                code,
                game_id: 'orbit-imperium',
                game_name: 'Orbit Imperium',
                url: `${new URL(route.request().url()).origin}/invite/${code}`,
              }
            : { invitation: 'applied' },
        owner: owner(new URL(route.request().url()).origin),
      },
    })
  })
  return actions
}

for (const width of [1440, 390]) {
  test(`invitation entry has one normal Play action and preserves its auth return at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    const actions = await fixture(page, false)
    await withFixtureResponse(page, previewResponse, () =>
      page.goto(`/invite/${code}`),
    )
    await expect(page.getByText('Invited by Fixture commander.')).toBeVisible()
    const href = await page
      .getByRole('link', { name: 'Play Orbit Imperium', exact: true })
      .getAttribute('href')
    const url = new URL(href!, page.url())
    expect(url.pathname).toBe('/api/auth/login')
    expect(url.searchParams.get('return_to')).toBe(`/invite/${code}`)
    await expect(page.getByRole('button', { name: /accept/i })).toHaveCount(0)
    expect(actions).toEqual([])
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await diagnosticScreenshot(page, {
      path: `test-results/invitation-public-${width}x1000.png`,
      fullPage: true,
    })
  })
  test(`unavailable invitation context leaves Play available at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    const actions = await fixture(page, false, true)
    await withFixtureResponseStatus(
      page,
      previewResponse,
      () => page.goto(`/invite/${code}`),
      503,
    )
    await expect(
      page.getByRole('link', { name: 'Play Orbit Imperium', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: /accept|retry/i }),
    ).toHaveCount(0)
    expect(actions).toEqual([])
    await diagnosticScreenshot(page, {
      path: `test-results/invitation-unavailable-${width}x1000.png`,
      fullPage: true,
    })
  })
  test(`game invitation management creates a game link without a referral acceptance UI at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.addInitScript(() =>
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async () => {
            throw Error('fixture clipboard denied')
          },
        },
      }),
    )
    const actions = await fixture(page, true)
    await withFixtureResponse(
      page,
      (r) => new URL(r.url()).pathname === '/api/v1/rewards',
      () => page.goto('/invitations'),
    )
    await page
      .getByRole('button', { name: 'Copy invite link', exact: true })
      .click()
    await expect(
      page.getByRole('button', { name: 'Copy invite link', exact: true }),
    ).toBeEnabled()
    const link = page.getByRole('textbox', {
      name: 'Invitation link',
      exact: true,
    })
    await expect(link).toHaveValue(new URL(`/invite/${code}`, page.url()).href)
    await expect(
      page
        .getByRole('status')
        .filter({ hasText: 'Select and copy the invitation link above.' }),
    ).toBeVisible()
    await link.focus()
    expect(
      await link.evaluate(
        (input: HTMLInputElement) =>
          input.selectionEnd! - input.selectionStart!,
      ),
    ).toBe((await link.inputValue()).length)
    expect(actions[0].action).toEqual({
      type: 'create_invitation',
      kind: 'personal',
      game_id: 'orbit-imperium',
    })
    await expect(page.getByRole('button', { name: /accept/i })).toHaveCount(0)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await diagnosticScreenshot(page, {
      path: `test-results/invitation-management-${width}x1000.png`,
      fullPage: true,
    })
  })
}
// The real OAuth signup chain remains explicit acceptance. This fixture starts
// with its resulting authenticated account and verifies no invitation interstitial.
test('authenticated entry reaches normal enrollment despite rewards being unavailable', async ({
  page,
}) => {
  await fixture(page, true, true)
  const dispatched = page.waitForRequest(
    (request) => new URL(request.url()).pathname === '/api/v1/rewards/actions',
  )
  await withFixtureResponse(
    page,
    (r) => new URL(r.url()).pathname === '/api/auth/config',
    () => page.goto(`/invite/${code}`),
  )
  await expect(
    page.getByRole('heading', { name: 'Choose your universe' }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: /accept/i })).toHaveCount(0)
  expect((await dispatched).postDataJSON().action.code).toBe(code)
})
