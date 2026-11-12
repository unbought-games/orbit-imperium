import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { test, expect } from './fixtures/test'
import { installGameFixture, binding, id } from './fixtures/game'
import { bootstrapFixture } from '../src/test-support/bootstrap'
import {
  withFixtureResponse,
  withFixtureResponseStatus,
} from './fixtures/responses'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import type { Page } from '@playwright/test'
import type { components } from '../src/contracts'

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
const art = readFileSync('crates/application/assets/insignias/compass.svg')
const asset = `/api/media/insignias/compass/${createHash('sha256').update(art).digest('hex')}.svg`
const presentation: components['schemas']['GameInvitationPresentation'] = {
  code,
  status: 'ready',
  kind: 'personal',
  alliance: null,
  inviter: {
    name: 'Aurelia',
    empire_name: 'The Aurora Accord',
    tagline: 'A wider horizon.',
    title: {
      id: 'commander',
      label: 'Commander',
      address: 'Commander',
      expires_at: null,
    },
    insignia: {
      recipe: {
        version: 1,
        symbol: 'compass',
        foreground: '#dfc698',
        background: '#173c4c',
        shape: 'hexagon',
      },
      asset_url: asset,
    },
  },
  universe: {
    id: binding.universe,
    epoch_id: binding.epoch,
    name: 'Andromeda',
    speed: 5,
    galaxies: 2,
    systems_per_galaxy: 100,
    players: 27,
    max_players: 500,
    signup_enabled: true,
    art_slot: 4,
  },
}
async function screenshot(page: Page, name: string, width: number) {
  if (process.env.ORBIT_TEST_SCREENSHOTS !== '1') return
  await page
    .locator('img[fetchpriority="high"]')
    .evaluateAll((images) =>
      Promise.all(
        images.map((image) =>
          (image as HTMLImageElement).decode().catch(() => undefined),
        ),
      ),
    )
  await diagnosticScreenshot(page, {
    path: `test-results/${name}-${width}x1000.png`,
  })
}
async function fixture(
  page: Page,
  {
    authenticated = false,
    member = false,
    unbound = false,
    closed = false,
    multiple = false,
  } = {},
) {
  await installGameFixture(page, {
    protocol: 4,
    missions: {
      fleets: [],
      incoming: [],
      score_value_micro: '0',
      fleet_slots: '1',
    },
  })
  let enrolled = member,
    created = false
  const actions: components['schemas']['CommunityActionRequest'][] = []
  const enrollments: unknown[] = []
  await page.route('**/api/v1/bootstrap', (route) => {
    if (authenticated && enrolled && !multiple) return route.fallback()
    const result = bootstrapFixture(4)
    if (!authenticated) result.result = { status: 'anonymous' }
    else if (multiple && result.result.status === 'authenticated')
      result.result.session.memberships.push({
        universe: id(91),
        player: id(92),
        universe_name: 'Orion Reach',
      })
    else
      result.result = {
        status: 'authenticated',
        session: {
          account: binding.account,
          csrf: 'fixture',
          expires_at: 9999999999999,
          memberships: [],
        },
        game: { status: 'no_membership' },
      }
    return route.fulfill({ json: result })
  })
  await page.route('**/api/auth/config', (route) =>
    route.fulfill({
      json: {
        mode: 'oidc',
        hosted_universe: id(91),
        client_id: 'fixture-orbit',
        accounts_url: 'https://accounts.example.test',
        universes: [
          { universe: id(91), name: 'Orion Reach' },
          { universe: binding.universe, name: 'Andromeda' },
        ],
      },
    }),
  )
  const view = structuredClone(presentation)
  if (unbound) {
    view.status = 'unavailable'
    view.universe = null
    view.inviter = null
  }
  if (closed && view.universe) view.universe.signup_enabled = false
  await page.route(`**/api/v1/invitations/${code}`, (route) =>
    route.fulfill({ json: view }),
  )
  await page.route(`**${asset}`, (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: art }),
  )
  const owner = (origin: string) => ({
    ...ownerFixture,
    invitations: created
      ? [
          {
            ...ownerFixture.invitations[0],
            code,
            url: `${origin}/invite/${code}`,
          },
        ]
      : [],
  })
  await page.route('**/api/v1/rewards', (route) =>
    route.fulfill({ json: owner(new URL(route.request().url()).origin) }),
  )
  await page.route('**/api/v1/rewards/actions', (route) => {
    const body = route.request().postDataJSON()
    actions.push(body)
    if (body.action.type === 'create_invitation') created = true
    return route.fulfill({
      json: {
        contract_version: 1,
        result:
          body.action.type === 'create_invitation'
            ? { code }
            : { invitation: 'applied' },
        owner: owner(new URL(route.request().url()).origin),
      },
    })
  })
  await page.route('**/api/auth/enroll', (route) => {
    enrollments.push(route.request().postDataJSON())
    if (closed && !member)
      return route.fulfill({
        status: 403,
        json: { code: 'Forbidden', status: 403, type: 'about:blank' },
      })
    enrolled = true
    return route.fulfill({ status: 204 })
  })
  return { actions, enrollments, view }
}
const delivered = (response: import('@playwright/test').Response) =>
  new URL(response.url()).pathname === `/api/v1/invitations/${code}`
for (const width of [1440, 390]) {
  test(`personal invitation presents actual identity, destination and signup entry at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    await fixture(page)
    await withFixtureResponse(page, delivered, () =>
      page.goto(`/invite/${code}`),
    )
    await expect(page.getByText('Aurelia', { exact: true })).toBeVisible()
    await expect(page.getByText(/The Aurora Accord/)).toBeVisible()
    await expect(
      page.getByRole('img', { name: 'Aurelia’s emblem' }),
    ).toHaveAttribute('data-shape', 'hexagon')
    await expect(
      page.getByRole('heading', { name: 'Andromeda', exact: true }),
    ).toBeVisible()
    const join = page.getByRole('link', {
      name: 'Join this universe',
      exact: true,
    })
    const auth = new URL((await join.getAttribute('href'))!, page.url())
    expect(auth.pathname).toBe('/api/auth/login')
    expect(auth.searchParams.get('signup')).toBe('true')
    expect(auth.searchParams.get('return_to')).toBe(`/invite/${code}`)
    const bounds = (await join.boundingBox())!
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(1000)
    await expect(page.getByText('Open Beta', { exact: true })).toHaveCount(0)
    expect(
      (await page.getByRole('heading', { name: /Start small/ }).boundingBox())!
        .y,
    ).toBeGreaterThanOrEqual(1000)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await screenshot(page, 'invitation-pass', width)
    const compactHeight = width === 1440 ? 720 : 740
    await page.setViewportSize({ width, height: compactHeight })
    const compact = (await join.boundingBox())!
    expect(compact.y + compact.height).toBeLessThanOrEqual(compactHeight)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    if (process.env.ORBIT_TEST_SCREENSHOTS === '1')
      await diagnosticScreenshot(page, {
        path: `test-results/invitation-pass-${width}x${compactHeight}.png`,
      })
  })
  test(`unbound invitations do not invent a universe at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    await fixture(page, { unbound: true })
    await withFixtureResponse(page, delivered, () =>
      page.goto(`/invite/${code}`),
    )
    await expect(
      page.getByText(/Ask your friend for a fresh link/),
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Join this universe' }),
    ).toHaveCount(0)
    await screenshot(page, 'invitation-unbound', width)
  })
  test(`bound invitation enters its universe without a hosted-default chooser at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    const f = await fixture(page, { authenticated: true })
    await withFixtureResponse(
      page,
      (r) =>
        new URL(r.url()).pathname === '/api/v1/bootstrap' &&
        f.enrollments.length === 1,
      () => page.goto(`/invite/${code}`),
    )
    await expect(page.locator('main h1')).toContainText('Empire —')
    expect(new URL(page.url()).pathname).toContain('/u/andromeda')
    expect(f.enrollments).toEqual([
      { universe: binding.universe, invitation_code: code },
    ])
    await expect(
      page.getByRole('heading', { name: 'Choose your universe' }),
    ).toHaveCount(0)
    await screenshot(page, 'invitation-bound-entry', width)
  })
  test(`bound invitation keeps authoritative admission recovery at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    const f = await fixture(page, { authenticated: true, closed: true })
    await withFixtureResponseStatus(
      page,
      (r) => new URL(r.url()).pathname === '/api/auth/enroll',
      () => page.goto(`/invite/${code}`),
      403,
    )
    await expect(page.getByRole('alert')).toContainText(
      'closed, full, or temporarily unavailable',
    )
    await expect(
      page.getByRole('button', { name: 'Try joining again' }),
    ).toBeEnabled()
    expect(f.enrollments).toHaveLength(1)
    await screenshot(page, 'invitation-bound-closed', width)
  })
}
test('sharing requires an explicit universe for an inviter with multiple memberships', async ({
  page,
}) => {
  const f = await fixture(page, { authenticated: true, multiple: true })
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw Error('fixture denied')
        },
      },
    }),
  )
  await withFixtureResponse(
    page,
    (r) => new URL(r.url()).pathname === '/api/v1/rewards',
    () => page.goto('/invitations'),
  )
  await expect(
    page.getByRole('button', { name: 'Copy invite link', exact: true }),
  ).toBeDisabled()
  await page
    .getByRole('combobox', { name: 'Invite to universe' })
    .selectOption(binding.universe)
  await withFixtureResponse(
    page,
    (r) => new URL(r.url()).pathname === '/api/v1/rewards/actions',
    () =>
      page
        .getByRole('button', { name: 'Copy invite link', exact: true })
        .click(),
  )
  expect(f.actions[0].action).toEqual({
    type: 'create_invitation',
    kind: 'personal',
    game_id: 'orbit-imperium',
    universe_id: binding.universe,
  })
  await expect(
    page.getByRole('textbox', { name: 'Invitation link', exact: true }),
  ).toHaveValue(new URL(`/invite/${code}`, page.url()).href)
})
