import { test, expect, type Page } from './fixtures/test'
import { binding, body, installGameFixture } from './fixtures/game'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'

const accounts = 'https://accounts.unbought.games'
const joinPath = `/join/${binding.universe}`
const empirePath = `/u/andromeda/b/${body.id}/overview`

async function hostedFixture(
  page: Page,
  baseURL: string | undefined,
  options: {
    returning?: boolean
    failEnrollment?: boolean
    mode?: 'local' | 'oidc'
    hostedUniverse?: string | null
    failConfig?: boolean
  } = {},
) {
  await installGameFixture(page)
  let authenticated = false
  let enrolled = options.returning ?? false
  let failures = options.failEnrollment ? 1 : 0
  let configFailures = options.failConfig ? 1 : 0
  const enrollments: unknown[] = []
  const automaticEnrollments: string[] = []
  function completeAuthentication() {
    authenticated = true
    if (!enrolled) {
      automaticEnrollments.push(binding.universe)
      if (failures-- > 0) return joinPath
      enrolled = true
    }
    return '/'
  }
  const config = {
    mode: options.mode ?? 'oidc',
    accounts_url: accounts,
    hosted_universe:
      options.hostedUniverse === undefined
        ? binding.universe
        : options.hostedUniverse,
    universes: [{ universe: binding.universe, name: 'Andromeda' }],
  }
  await page.route('**/api/auth/config', (route) => {
    if (configFailures-- > 0) return route.fulfill({ status: 503 })
    return route.fulfill({ json: config })
  })
  await page.route('**/api/v1/bootstrap', (route) => {
    if (authenticated && enrolled) return route.fallback()
    return route.fulfill({
      json: {
        version: 1,
        signup_enabled: !options.returning,
        result: authenticated
          ? {
              status: 'authenticated',
              session: {
                account: binding.account,
                csrf: 'fixture',
                expires_at: Date.now() + 1000000,
                memberships: [],
              },
              game: { status: 'no_membership' },
            }
          : { status: 'anonymous' },
      },
    })
  })
  // Playwright intercepts only the first request in a fulfilled redirect chain.
  // Start a fresh navigation here so the Accounts destination stays fixture-only;
  // native HTTP tests cover the server's actual 303 responses.
  await page.route('**/api/auth/entry*', (route) => {
    const target = `${accounts}/${new URL(route.request().url()).searchParams.get('signup') === 'true' ? 'sign-up' : 'sign-in'}?state=fixture`
    return route.fulfill({
      contentType: 'text/html',
      body: `<script>location.replace(${JSON.stringify(target)})</script>`,
    })
  })
  await page.route(`${accounts}/**`, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<h1>${new URL(route.request().url()).pathname === '/sign-up' ? 'Create your account' : 'Welcome back'}</h1><a href="${new URL('/api/auth/callback?code=fixture&state=fixture', baseURL).href}">Complete authentication</a>`,
    }),
  )
  await page.route('**/api/auth/callback?*', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<script>location.replace(${JSON.stringify(completeAuthentication())})</script>`,
    }),
  )
  await page.route('**/api/auth/enroll', async (route) => {
    expect(authenticated).toBe(true)
    expect(route.request().method()).toBe('POST')
    expect(route.request().headers()['x-csrf-token']).toBe('fixture')
    enrollments.push(route.request().postDataJSON())
    if (failures-- > 0) return route.fulfill({ status: 403 })
    enrolled = true
    return route.fulfill({ status: 204 })
  })
  return {
    enrollments,
    automaticEnrollments,
    completeAuthentication,
    authenticate: () => {
      authenticated = true
    },
  }
}

for (const width of [390, 1440]) {
  for (const returning of [false, true]) {
    test(`hosted ${returning ? 'sign-in' : 'registration'} takes one homepage click and returns to the game at ${width}px`, async ({
      page,
      baseURL,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      const fixture = await hostedFixture(page, baseURL, { returning })
      await page.goto('/')
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        'Victory isn’t for sale.',
      )
      await diagnosticScreenshot(page, {
        path: `test-results/hosted-home-${returning ? 'closed' : 'open'}-${width}x900.png`,
        fullPage: true,
      })
      await page
        .getByRole('link', {
          name: returning ? 'Sign in' : 'Join the current universe',
          exact: true,
        })
        .click()
      await expect(page).toHaveURL(
        `${accounts}/${returning ? 'sign-in' : 'sign-up'}?state=fixture`,
      )
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        returning ? 'Welcome back' : 'Create your account',
      )
      await page.getByRole('link', { name: 'Complete authentication' }).click()
      await expect(page).toHaveURL(`${baseURL}${empirePath}`)
      await expect(page.locator('main h1')).toContainText('Empire —')
      expect(fixture.enrollments).toEqual([])
      expect(fixture.automaticEnrollments).toEqual(
        returning ? [] : [binding.universe],
      )
      await diagnosticScreenshot(page, {
        path: `test-results/hosted-empire-${width}x900.png`,
      })
    })
  }

  test(`hosted enrollment failure keeps the account and retries into the game at ${width}px`, async ({
    page,
    baseURL,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    const fixture = await hostedFixture(page, baseURL, { failEnrollment: true })
    fixture.completeAuthentication()
    await page.goto(joinPath)
    await expect(page.getByRole('alert')).toContainText(
      'closed, full, or temporarily unavailable',
    )
    await diagnosticScreenshot(page, {
      path: `test-results/hosted-enrollment-error-${width}x900.png`,
    })
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/api/auth/enroll', async (route) => {
      await pending
      return route.fallback()
    })
    const retryPosition = (await page
      .getByRole('button', { name: 'Try again' })
      .boundingBox())!
    try {
      await page.getByRole('button', { name: 'Try again' }).click()
      await expect(page.getByRole('status')).toContainText(
        'Joining the current universe',
      )
      const pendingPosition = (await page
        .getByRole('button', { name: 'Joining…' })
        .boundingBox())!
      expect(Math.abs(pendingPosition.y - retryPosition.y)).toBeLessThan(1)
      await diagnosticScreenshot(page, {
        path: `test-results/hosted-enrollment-pending-${width}x900.png`,
      })
    } finally {
      release()
    }
    await expect(page).toHaveURL(`${baseURL}${empirePath}`)
    expect(fixture.enrollments).toEqual([{ universe: binding.universe }])
  })
}

test('opening a hosted recovery URL cannot automatically enroll a player', async ({
  page,
  baseURL,
}) => {
  const fixture = await hostedFixture(page, baseURL)
  fixture.authenticate()
  await page.goto(joinPath)
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
  expect(fixture.enrollments).toEqual([])
  expect(fixture.automaticEnrollments).toEqual([])
})

test('hosted enrollment configuration can be retried without losing the authenticated account', async ({
  page,
  baseURL,
}) => {
  const fixture = await hostedFixture(page, baseURL, {
    failConfig: true,
    returning: true,
  })
  fixture.authenticate()
  await page.goto(joinPath)
  await expect(page.getByRole('alert')).toHaveText(
    'Unable to load your universe. Please try again.',
  )
  expect(fixture.enrollments).toEqual([])
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page).toHaveURL(`${baseURL}${empirePath}`)
  expect(fixture.enrollments).toEqual([])
})

test('an enrollment failure can return to universe selection without an automatic retry', async ({
  page,
  baseURL,
}) => {
  const fixture = await hostedFixture(page, baseURL, { failEnrollment: true })
  fixture.completeAuthentication()
  await page.goto(joinPath)
  await expect(page.getByRole('alert')).toBeVisible()
  await page
    .getByRole('link', { name: 'Choose a universe', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Choose your universe' }),
  ).toBeVisible()
  expect(fixture.enrollments).toHaveLength(0)
})

for (const [mode, hostedUniverse] of [
  ['local', null],
  ['oidc', null],
  ['oidc', '00000000-0000-4000-8000-000000000099'],
] as const) {
  test(`a join return path cannot enroll using ${mode} configuration and binding ${hostedUniverse}`, async ({
    page,
    baseURL,
  }) => {
    const fixture = await hostedFixture(page, baseURL, { mode, hostedUniverse })
    fixture.authenticate()
    await page.goto(joinPath)
    await expect(page).toHaveURL(/\/$/)
    await expect(
      page.getByRole('heading', { name: 'Choose your universe' }),
    ).toBeVisible()
    expect(fixture.enrollments).toEqual([])
  })
}
