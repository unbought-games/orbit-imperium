import { readFileSync } from 'node:fs'
import { test, expect } from './fixtures/test'
import { installGameFixture, binding } from './fixtures/game'
import { withFixtureResponse } from './fixtures/responses'
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
  existingInvitation = true,
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
  let previewVersion = 'v1'
  let accepted = false
  const actions: {
    request_id: string
    action: {
      type: string
      code?: string
      preview_version?: string
      game_id?: string
    }
  }[] = []
  const owner = (origin: string) => ({
    ...ownerFixture,
    invitations: existingInvitation
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
    route.fulfill({
      json: {
        code,
        kind: previewVersion === 'v1' ? 'combined' : 'personal',
        inviter_name: 'Fixture commander',
        alliance_name: previewVersion === 'v1' ? 'Fixture alliance' : null,
        alliance:
          previewVersion === 'v1'
            ? { universe_id: binding.universe, alliance_id: binding.player }
            : null,
        game_id: 'orbit-imperium',
        game_name: 'Orbit Imperium',
        url: `${new URL(route.request().url()).origin}/invite/${code}`,
        requires_game_check: !authenticated,
        preview_version: previewVersion,
        accepted,
        attribution_locked: accepted,
      },
    }),
  )
  await page.route('**/api/v1/rewards/actions', (route) => {
    const body = route.request().postDataJSON()
    actions.push(body)
    if (body.action.type === 'create_invitation') existingInvitation = true
    expect(route.request().headers()['x-csrf-token']).toBe('invitation-csrf')
    if (actions.length === 1 && body.action.type === 'accept_invitation') {
      previewVersion = 'v2'
      return route.fulfill({ status: 409, json: { code: 'StalePreview' } })
    }
    if (body.action.type === 'accept_invitation') accepted = true
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
            : { accepted: true },
        owner: owner(new URL(route.request().url()).origin),
      },
    })
  })
  return actions
}

for (const width of [1440, 390]) {
  test(`an existing attribution suppresses acceptance on both game entry points at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    const actions = await fixture(page, true)
    await page.route('**/api/v1/rewards/invitation-preview?*', (route) =>
      route.fulfill({
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
          preview_version: 'locked',
          accepted: false,
          attribution_locked: true,
        },
      }),
    )
    await withFixtureResponse(page, previewResponse, () =>
      page.goto(`/invite/${code}`),
    )
    await expect(
      page
        .getByRole('status')
        .filter({ hasText: 'already accepted another invitation' }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', {
        name: 'Accept this attribution',
        exact: true,
      }),
    ).toHaveCount(0)
    await diagnosticScreenshot(page, {
      path: `test-results/invitation-locked-${width}x1000.png`,
      fullPage: true,
    })
    await withFixtureResponse(
      page,
      (r) => new URL(r.url()).pathname === '/api/v1/rewards',
      () => page.goto('/invitations'),
    )
    await page
      .getByRole('textbox', { name: 'Invitation code', exact: true })
      .fill(code)
    await withFixtureResponse(page, previewResponse, () =>
      page
        .getByRole('button', { name: 'Preview invitation', exact: true })
        .click(),
    )
    await expect(
      page
        .getByRole('status')
        .filter({ hasText: 'already accepted another invitation' }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', {
        name: 'Accept this attribution',
        exact: true,
      }),
    ).toHaveCount(0)
    expect(actions).toEqual([])
    await diagnosticScreenshot(page, {
      path: `test-results/invitation-code-locked-${width}x1000.png`,
      fullPage: true,
    })
  })
  test(`game invitation offers exact signup/sign-in continuation without accepting at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    const actions = await fixture(page, false)
    await withFixtureResponse(page, previewResponse, () =>
      page.goto(`/invite/${code}`),
    )
    await expect(
      page.getByRole('heading', { name: 'You’re invited to Orbit Imperium.' }),
    ).toBeVisible()
    await expect(
      page.getByText('Alliance credit: Fixture alliance.'),
    ).toBeVisible()
    for (const [name, signup] of [
      ['Create your account', 'true'],
      ['Sign in', null],
    ] as const) {
      const href = await page
        .getByRole('link', { name, exact: true })
        .getAttribute('href')
      const url = new URL(href!, page.url())
      expect(url.pathname).toBe('/api/auth/login')
      expect(url.searchParams.get('return_to')).toBe(`/invite/${code}`)
      expect(url.searchParams.get('signup')).toBe(signup)
    }
    await withFixtureResponse(page, previewResponse, () => page.reload())
    await expect(
      page.getByRole('button', { name: 'Accept this attribution' }),
    ).toHaveCount(0)
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
  // This boundary starts after a verified login. Real OAuth/signup is explicit acceptance,
  // not a recreated multi-document mocked authentication journey.
  test(`signed-in invitee without an empire reviews changed attribution before enrollment at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    const actions = await fixture(page, true)
    await withFixtureResponse(page, previewResponse, () =>
      page.goto(`/invite/${code}`),
    )
    await expect(
      page.getByRole('heading', { name: 'Choose your universe' }),
    ).toHaveCount(0)
    expect(actions).toEqual([])
    await diagnosticScreenshot(page, {
      path: `test-results/invitation-review-${width}x1000.png`,
      fullPage: true,
    })
    await page
      .getByRole('button', { name: 'Accept this attribution', exact: true })
      .click()
    await withFixtureResponse(page, previewResponse, () =>
      page
        .getByRole('button', { name: 'Accept invitation', exact: true })
        .click(),
    )
    await expect(page.getByText('No alliance receives credit.')).toBeVisible()
    expect(actions).toHaveLength(1)
    await page
      .getByRole('button', { name: 'Accept this attribution', exact: true })
      .click()
    await withFixtureResponse(page, previewResponse, () =>
      page
        .getByRole('button', { name: 'Accept invitation', exact: true })
        .click(),
    )
    await expect(
      page.getByRole('heading', { name: 'Welcome aboard.' }),
    ).toBeVisible()
    await withFixtureResponse(page, previewResponse, () => page.reload())
    await expect(
      page.getByRole('heading', { name: 'Welcome aboard.' }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', {
        name: 'Accept this attribution',
        exact: true,
      }),
    ).toHaveCount(0)
    expect(actions.map((a) => a.action.preview_version)).toEqual(['v1', 'v2'])
    expect(actions[1].request_id).not.toBe(actions[0].request_id)
    await diagnosticScreenshot(page, {
      path: `test-results/invitation-accepted-${width}x1000.png`,
      fullPage: true,
    })
    await withFixtureResponse(
      page,
      (r) => new URL(r.url()).pathname === '/api/auth/config',
      () =>
        page
          .getByRole('link', {
            name: 'Continue to Orbit Imperium',
            exact: true,
          })
          .click(),
    )
    await expect(
      page.getByRole('heading', { name: 'Choose your universe' }),
    ).toBeVisible()
  })
  test(`game invitation management works before universe enrollment at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    const actions = await fixture(page, true, false)
    await withFixtureResponse(
      page,
      (r) => new URL(r.url()).pathname === '/api/v1/rewards',
      () => page.goto('/invitations'),
    )
    await expect(
      page.getByRole('heading', { name: 'Invite friends to Orbit Imperium' }),
    ).toBeVisible()
    await withFixtureResponse(
      page,
      (r) => new URL(r.url()).pathname === '/api/v1/rewards/actions',
      () =>
        page
          .getByRole('button', {
            name: 'Create personal invitation',
            exact: true,
          })
          .click(),
    )
    expect(actions[0].action).toEqual({
      type: 'create_invitation',
      kind: 'personal',
      game_id: 'orbit-imperium',
    })
    await expect(
      page.getByRole('button', { name: 'Copy link', exact: true }),
    ).toBeEnabled()
    await expect(
      page.getByRole('heading', { name: 'Choose your universe' }),
    ).toHaveCount(0)
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
