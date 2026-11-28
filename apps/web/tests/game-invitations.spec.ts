import { personalInvitation } from './fixtures/personal-invitation'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { test, expect } from './fixtures/test'
import { installGameFixture, binding, id } from './fixtures/game'
import { bootstrapFixture } from '../src/test-support/bootstrap'
import {
  withFixtureResponse,
  withFixtureResponseStatus,
} from './fixtures/responses'
import type { Page } from '@playwright/test'

const code = 'inv_fixture-A_9'
const art = readFileSync('crates/application/assets/insignias/compass.svg')
const asset = `/api/media/insignias/compass/${createHash('sha256').update(art).digest('hex')}.svg`
const presentation = personalInvitation(
  code,
  binding.universe,
  binding.epoch,
  asset,
)
async function fixture(
  page: Page,
  { authenticated = false, closed = false } = {},
) {
  await installGameFixture(page, {
    protocol: 4,
    csrf: 'fixture',
    missions: {
      fleets: [],
      incoming: [],
      score_value_micro: '0',
      fleet_slots: '1',
    },
  })
  let enrolled = false
  const enrollments: unknown[] = []
  await page.route('**/api/v1/bootstrap', (route) => {
    if (authenticated && enrolled) return route.fallback()
    const result = bootstrapFixture(4)
    if (!authenticated) result.result = { status: 'anonymous' }
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
  if (closed && view.universe) view.universe.signup_enabled = false
  await page.route(`**/api/v1/invitations/${code}`, (route) =>
    route.fulfill({ json: view }),
  )
  await page.route(`**${asset}`, (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: art }),
  )
  await page.route('**/api/v1/rewards/actions', async (route) => {
    const request = route.request()
    if (request.method() !== 'POST') return route.fallback()
    const { action } = request.postDataJSON()
    if (action?.type !== 'apply_invitation' || action.code !== code)
      return route.fallback()
    const owner = JSON.parse(
      readFileSync(
        new URL(
          '../../../contracts/fixtures/community-owner.json',
          import.meta.url,
        ),
        'utf8',
      ),
    )
    return route.fulfill({
      json: { contract_version: 1, result: { invitation: 'applied' }, owner },
    })
  })
  await page.route('**/api/auth/enroll', (route) => {
    enrollments.push(route.request().postDataJSON())
    if (closed)
      return route.fulfill({
        status: 403,
        json: { code: 'Forbidden', status: 403, type: 'about:blank' },
      })
    enrolled = true
    return route.fulfill({ status: 204 })
  })
  return {
    enrollments,
    openAdmission() {
      closed = false
    },
  }
}
const delivered = (response: import('@playwright/test').Response) =>
  new URL(response.url()).pathname === `/api/v1/invitations/${code}`
test('public invitation binds the returned sender and universe to its signup destination', async ({
  page,
}) => {
  await fixture(page)
  await withFixtureResponse(page, delivered, () => page.goto(`/invite/${code}`))
  await expect(page.getByText('Aurelia', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Andromeda', exact: true }),
  ).toBeVisible()
  const action = page.getByRole('link', {
    name: 'Join this universe',
    exact: true,
  })
  const destination = new URL((await action.getAttribute('href'))!, page.url())
  expect(destination.pathname).toBe('/api/auth/login')
  expect(destination.searchParams.get('signup')).toBe('true')
  expect(destination.searchParams.get('return_to')).toBe(`/invite/${code}`)
})

test('a refused bound invitation retries the original universe and opens its empire', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 1000 })
  const f = await fixture(page, { authenticated: true, closed: true })
  const enrollment = { universe: binding.universe, invitation_code: code }
  await withFixtureResponseStatus(
    page,
    (r) => new URL(r.url()).pathname === '/api/auth/enroll',
    () => page.goto(`/invite/${code}`),
    403,
  )
  await expect(page.getByRole('alert')).toContainText(
    'closed, full, or temporarily unavailable',
  )
  const retry = page.getByRole('button', { name: 'Try joining again' })
  await expect(retry).toBeEnabled()
  expect(f.enrollments).toEqual([enrollment])
  f.openAdmission()
  await withFixtureResponse(
    page,
    (r) =>
      new URL(r.url()).pathname === '/api/v1/bootstrap' &&
      f.enrollments.length === 2,
    () => retry.click(),
  )
  await expect(page.locator('main h1')).toContainText('Empire —')
  await expect(page).toHaveURL(/\/u\/andromeda\/b\/[^/]+\/overview$/)
  expect(f.enrollments).toEqual([enrollment, enrollment])
  await expect(
    page.getByRole('heading', { name: 'Choose your universe' }),
  ).toHaveCount(0)
})
