import { installEmptyMessageMembership } from './fixtures/message-membership'
import { navigate, signOut } from './fixtures/navigation'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { test, expect } from './fixtures/test'
import {
  refuseFixtureReads,
  binding,
  body,
  shellFixture,
  installGameFixture,
  installSessionRenewal,
} from './fixtures/game'
import { productionFixture } from '../src/test-support/production'
import { bootstrapFixture } from '../src/test-support/bootstrap'
import {
  withBootstrapResponse,
  withFixtureResponse,
} from './fixtures/responses'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/config', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ json: { mode: 'local', universes: [] } })
      : route.fallback(),
  )
  await page.route(
    (url) => url.pathname === '/api/auth/entry',
    (route) =>
      route.request().method() !== 'GET'
        ? route.fallback()
        : route.fulfill({
            status: 303,
            headers: {
              location:
                new URL(route.request().url()).searchParams.get('signup') ===
                'true'
                  ? '/signup'
                  : '/login',
            },
          }),
  )
})

test('content blockers cannot prevent startup, navigation, or logout (scripts)', async ({
  page,
}) => {
  refuseFixtureReads(page, { progression: ['Upgrade'] })
  await page.setViewportSize({ width: 390, height: 844 })
  await shellFixture(page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  let intercepted = 0
  await page.route(/analytics/i, async (route) => {
    if (route.request().resourceType() !== 'script') return route.fallback()
    intercepted++
    await route.abort('blockedbyclient')
  })
  await withBootstrapResponse(page, () => page.reload())
  await expect(page.locator('main h1')).toContainText('Empire —')
  await expect.poll(() => intercepted).toBeGreaterThan(0)
  await navigate(page, 'Resources')
  await expect(page.locator('main h1')).toHaveText('Resources')
  // DELETE succeeds with 204 and no body. The UI leaves the private game as
  // soon as fetch receives those headers; the following bootstrap has a body.
  const [logout] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.request().method() === 'DELETE' &&
        new URL(r.url()).pathname === '/api/v1/session',
    ),
    signOut(page),
  ])
  expect(logout.status()).toBe(204)
  await expect(page).toHaveURL(/\/login$/)
  const signIn = page.getByRole('button', { name: 'Sign in', exact: true })
  await expect(signIn).toBeVisible()
  await expect(
    page.getByRole('navigation', { name: 'Menu destinations' }),
  ).toHaveCount(0)
  await expect(page.getByLabel('Current resources')).toHaveCount(0)
  let anonymous!: import('@playwright/test').Response
  await withFixtureResponse(
    page,
    (response) => {
      if (
        response.request().method() !== 'GET' ||
        new URL(response.url()).pathname !== '/api/v1/bootstrap'
      )
        return false
      anonymous = response
      return true
    },
    () => page.reload(),
  )
  expect((await anonymous.json()).result.status).toBe('anonymous')
  await expect(signIn).toBeVisible()
  expect(errors).toEqual([])
})

test('login and signup preserve the requested game destination', async ({
  page,
}) => {
  await shellFixture(page, { protocol: 4, csrf: 'csrf' })
  await installEmptyMessageMembership(page)
  for (const path of ['/login', '/signup']) {
    await withBootstrapResponse(page, () => page.goto(path))
    await expect(page.getByRole('heading', { name: /^Empire —/ })).toBeVisible()
    await expect(page.getByLabel('Password')).toHaveCount(0)
    await expect(
      page.getByRole('link', { name: 'Source', exact: true }),
    ).toHaveCount(0)
    await expect(page.getByRole('contentinfo')).toHaveCount(0)
  }
  await page.route('**/api/v1/bootstrap', (route) =>
    route.fulfill({
      json: {
        version: 1,
        signup_enabled: true,
        result: { status: 'anonymous' },
      },
    }),
  )
  const payload = bootstrapFixture(4)
  if (
    payload.result.status !== 'authenticated' ||
    payload.result.game.status !== 'ready'
  )
    throw Error('fixture')
  payload.result.game.snapshot.view.bodies = [body]
  if (payload.result.game.snapshot.view.protocol !== 2)
    payload.result.game.snapshot.view.progression.production = [
      productionFixture(body),
    ]
  await page.route('**/api/v1/session?bootstrap=true', (route) =>
    route.fulfill({ json: payload }),
  )
  const peer = '00000000-0000-4000-8000-000000000800'
  const destination = `/u/andromeda/b/${body.id}/messages?player=${peer}#details`
  await withBootstrapResponse(page, () => page.goto(destination))
  await expect(page).toHaveURL(/\/login\?/)
  await expect(
    page.getByRole('link', { name: 'Source', exact: true }),
  ).toHaveCount(0)
  expect(new URL(page.url()).searchParams.get('redirect')).toBe(destination)
  await page
    .getByRole('link', { name: 'Create an account', exact: true })
    .click()
  await expect(page).toHaveURL(/\/signup\?/)
  await expect(
    page.getByRole('link', { name: 'Source', exact: true }),
  ).toHaveCount(0)
  expect(new URL(page.url()).searchParams.get('redirect')).toBe(destination)
  await withBootstrapResponse(page, () => page.reload())
  await page.getByRole('link', { name: 'Back to sign in', exact: true }).click()
  await expect(page.getByLabel('Password')).toHaveAttribute(
    'autocomplete',
    'current-password',
  )
  await page.getByLabel('Account', { exact: true }).fill('player')
  await page.getByLabel('Password').fill('password')
  await withFixtureResponse(
    page,
    (response) => {
      if (
        response.request().method() !== 'POST' ||
        !new URL(response.url()).pathname.endsWith('/social/query')
      )
        return false
      const query = response.request().postDataJSON().query
      return query?.type === 'Messages' && query.player === peer
    },
    () => page.getByRole('button', { name: 'Sign in', exact: true }).click(),
  )
  await expect(
    page.getByRole('heading', { name: 'Messages', level: 1, exact: true }),
  ).toBeVisible()
  await expect(page).toHaveURL(destination)
})

test(
  'fetched startup uses one bootstrap request and never inserts the sign-in form',
  { tag: '@journey' },
  async ({ page }) => {
    const requests: string[] = []
    page.on('request', (r) => {
      if (r.url().includes('/api/')) requests.push(new URL(r.url()).pathname)
    })
    await page.addInitScript(() => {
      Reflect.set(window, 'startupFlashes', [])
      new MutationObserver((records) => {
        for (const record of records)
          for (const node of record.addedNodes) {
            if (
              node instanceof Element &&
              (node.matches('input[name="password"]') ||
                node.querySelector('input[name="password"]'))
            )
              (Reflect.get(window, 'startupFlashes') as string[]).push(
                node.textContent ?? 'form',
              )
          }
      }).observe(document, { subtree: true, childList: true })
    })
    await shellFixture(page)
    expect(requests.filter((p) => p === '/api/v1/bootstrap')).toHaveLength(1)
    expect(
      requests.filter(
        (p) =>
          p === '/api/v1/session' ||
          p === '/api/v1/registration' ||
          p.endsWith('/binding') ||
          p.endsWith('/settings'),
      ),
    ).toEqual([])
    expect(
      await page.evaluate(() => Reflect.get(window, 'startupFlashes')),
    ).toEqual([])
  },
)

test(`explicit login records presence after retry; reload and cached-page restore do not`, async ({
  page,
}) => {
  const { bootstrapFixture } = await import('../src/test-support/bootstrap')
  const { body } = await import('./fixtures/game')
  const payload = bootstrapFixture(4)
  if (
    payload.result.status !== 'authenticated' ||
    payload.result.game.status !== 'ready'
  )
    throw Error('fixture')
  const snapshot = payload.result.game.snapshot
  snapshot.view.bodies = [body]
  if (snapshot.view.protocol !== 2)
    snapshot.view.progression.production = [productionFixture(body)]
  await installGameFixture(page, {
    protocol: 4,
    csrf: payload.result.session.csrf,
  })
  let signedIn = false,
    logins = 0,
    bootstrapReads = 0
  await page.route('**/api/**', async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname
    if (request.method() === 'GET' && path === '/api/v1/bootstrap') {
      bootstrapReads++
      return route.fulfill({
        json: signedIn
          ? payload
          : {
              version: 1,
              signup_enabled: true,
              result: { status: 'anonymous' },
            },
      })
    }
    if (
      request.method() === 'POST' &&
      path === '/api/v1/session' &&
      new URL(request.url()).searchParams.get('bootstrap') === 'true'
    ) {
      signedIn = true
      const failed = structuredClone(payload)
      if (failed.result.status === 'authenticated')
        failed.result.game = { status: 'unavailable', code: 'Unavailable' }
      return route.fulfill({ json: failed })
    }
    if (
      request.method() === 'POST' &&
      path === `/api/v4/universes/${binding.universe}/presence` &&
      request.postDataJSON()?.command?.action?.type ===
        'RecordForegroundPresence'
    ) {
      const e = request.postDataJSON()
      if (e.command.action.cause === 'Login') logins++
      return route.fulfill({
        json: {
          protocol: 4,
          binding: snapshot.candidate.binding,
          command_id: e.command_id,
          admitted_at: 1000,
          executed_at: 1000,
          status: 'Committed',
          result_ids: [],
          minimum_viewer_revision: '0',
        },
      })
    }
    if (
      request.method() === 'POST' &&
      path === `/api/v4/universes/${binding.universe}/overview`
    )
      return route.fulfill({
        json: {
          ...snapshot.view,
          request_id: request.postDataJSON().request_id,
        },
      })
    return route.fallback()
  })
  await withBootstrapResponse(page, () => page.goto('/login'))
  await page.getByLabel('Account', { exact: true }).fill('test')
  await page.getByLabel('Password').fill('p')
  await page
    .getByRole('button', {
      name: 'Sign in',
      exact: true,
    })
    .click()
  await expect(
    page.getByRole('button', { name: 'Retry connection' }),
  ).toBeVisible()
  expect(logins).toBe(0)
  await page.getByRole('button', { name: 'Retry connection' }).click()
  await expect(page.getByRole('heading', { name: /^Empire —/ })).toBeVisible()
  await expect.poll(() => logins).toBe(1)
  await withBootstrapResponse(page, () => page.reload())
  await expect(page.getByRole('heading', { name: /^Empire —/ })).toBeVisible()
  expect(logins).toBe(1)
  const before = bootstrapReads
  signedIn = false
  await page.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent('pageshow', { persisted: true }),
    ),
  )
  await expect(page.getByLabel('Password')).toBeVisible()
  expect(bootstrapReads).toBe(before + 1)
  expect(logins).toBe(1)
})

test('mobile startup automatically recovers from a transient restart without signing in again', async ({
  page,
}) => {
  // Allow cold route compilation while other validation runs share the host.
  const ready = expect.configure({ timeout: 30000 })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.clock.pauseAt(new Date())
  const payload = bootstrapFixture(4)
  if (
    payload.result.status !== 'authenticated' ||
    payload.result.game.status !== 'ready'
  )
    throw Error('fixture')
  const snapshot = payload.result.game.snapshot
  snapshot.view.bodies = [body]
  if (snapshot.view.protocol !== 2)
    snapshot.view.progression.production = [productionFixture(body)]
  const preparing = structuredClone(payload)
  if (preparing.result.status !== 'authenticated') throw Error('fixture')
  preparing.result.game = { status: 'unavailable', code: 'Unavailable' }
  await installGameFixture(page, {
    protocol: 4,
    csrf: payload.result.session.csrf,
  })
  let reads = 0
  await page.route('**/api/**', async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname
    if (request.method() === 'GET' && path === '/api/v1/bootstrap') {
      reads++
      return route.fulfill({
        json:
          reads === 2
            ? preparing
            : reads > 2
              ? payload
              : {
                  version: 1,
                  signup_enabled: true,
                  result: { status: 'unavailable', code: 'Unavailable' },
                },
      })
    }
    if (
      request.method() === 'POST' &&
      path === `/api/v4/universes/${binding.universe}/overview`
    )
      return route.fulfill({
        json: {
          ...snapshot.view,
          request_id: request.postDataJSON().request_id,
        },
      })
    return route.fallback()
  })
  await withBootstrapResponse(page, () =>
    page.goto(`/u/andromeda/b/${body.id}/overview`),
  )
  await ready(
    page.getByText(
      'Connection temporarily unavailable. Reconnecting automatically…',
    ),
  ).toBeVisible()
  await ready(page.getByLabel('Password')).toHaveCount(0)
  await diagnosticScreenshot(page, {
    path: 'test-results/transient-recovery-mobile.png',
    fullPage: true,
  })
  await withBootstrapResponse(page, () => page.clock.runFor(1000))
  await ready(
    page.getByRole('button', { name: 'Sign out', exact: true }),
  ).toBeVisible()
  await withBootstrapResponse(page, () => page.clock.runFor(2000))
  await ready(page.getByRole('heading', { name: /^Empire —/ })).toBeVisible()
  expect(reads).toBe(3)
  await ready(page.getByLabel('Password')).toHaveCount(0)
  await diagnosticScreenshot(page, {
    path: 'test-results/transient-recovered-mobile.png',
    fullPage: true,
  })
})

test('automatic outage retries preserve Retry and Sign out focus without manual-error alerts', async ({
  page,
}) => {
  const ready = expect.configure({ timeout: 30000 })
  await page.clock.pauseAt(new Date())
  const payload = bootstrapFixture(4)
  if (payload.result.status !== 'authenticated') throw Error('fixture')
  payload.result.game = { status: 'unavailable', code: 'Unavailable' }
  let reads = 0
  const release = new Map<number, () => void>()
  const completed = new Set<number>()
  await installSessionRenewal(page, payload.result.session.csrf)
  await page.route('**/api/v1/bootstrap', async (route) => {
    const read = ++reads
    if (read === 1) return route.fulfill({ json: payload })
    await new Promise<void>((resolve) => release.set(read, resolve))
    if (read === 2)
      await route.fulfill({ status: 503, json: { code: 'Unavailable' } })
    else await route.abort('failed')
    completed.add(read)
  })
  await withBootstrapResponse(page, () => page.goto('/login'))
  const retry = page.getByRole('button', { name: 'Retry connection' })
  const signout = page.getByRole('button', { name: 'Sign out', exact: true })
  await ready(retry).toBeVisible()
  for (const [read, control, delay] of [
    [2, retry, 1000],
    [3, signout, 2000],
  ] as const) {
    await control.focus()
    await page.clock.runFor(delay)
    await ready.poll(() => release.has(read)).toBe(true)
    await ready(control).toBeFocused()
    await ready(retry).toBeEnabled()
    await ready(signout).toBeEnabled()
    release.get(read)!()
    await ready.poll(() => completed.has(read)).toBe(true)
    // Flush response handling without crossing the next backoff boundary.
    await page.clock.runFor(100)
    await ready(control).toBeFocused()
    await ready(page.getByRole('alert')).toHaveCount(1)
    await ready(page.getByRole('alert')).toHaveText(
      'Connection temporarily unavailable. Reconnecting automatically…',
    )
    await ready(page.getByText('Unable to connect. Please retry.')).toHaveCount(
      0,
    )
  }
})
