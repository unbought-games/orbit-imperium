import { test, expect, type Page } from './fixtures/test'
import { binding, body, installGameFixture } from './fixtures/game'
import { withBootstrapResponse } from './fixtures/responses'
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
    if (failures-- > 0)
      return route.fulfill({
        status: 403,
        json: { code: 'Forbidden', status: 403, type: 'about:blank' },
      })
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

test(
  'hosted sign-in takes one homepage click and returns to the game at 1440px',
  { tag: '@journey' },
  async ({ page, baseURL }) => {
    const width = 1440
    await page.setViewportSize({ width, height: 900 })
    const fixture = await hostedFixture(page, baseURL, { returning: true })
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Victory isn’t for sale.',
    )
    await diagnosticScreenshot(page, {
      path: `test-results/hosted-home-closed-${width}x900.png`,
      fullPage: true,
    })
    await page
      .getByRole('navigation', { name: 'Get started' })
      .getByRole('link', {
        name: 'Sign in',
        exact: true,
      })
      .click()
    await expect(page).toHaveURL(`${accounts}/sign-in?state=fixture`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Welcome back',
    )
    await page.getByRole('link', { name: 'Complete authentication' }).click()
    await expect(page).toHaveURL(`${baseURL}${empirePath}`)
    await expect(page.locator('main h1')).toContainText('Empire —')
    expect(fixture.enrollments).toEqual([])
    expect(fixture.automaticEnrollments).toEqual([])
    await diagnosticScreenshot(page, {
      path: `test-results/hosted-empire-${width}x900.png`,
    })
  },
)

test(
  `hosted enrollment failure keeps the account and retries into the game across widths`,
  { tag: '@journey' },
  async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 390, height: 900 })
    const fixture = await hostedFixture(page, baseURL, { failEnrollment: true })
    fixture.completeAuthentication()
    await withBootstrapResponse(page, () => page.goto(joinPath))
    await expect(page.getByRole('alert')).toContainText(
      'closed, full, or temporarily unavailable',
    )
    expect(fixture.enrollments).toEqual([])
    await diagnosticScreenshot(page, {
      path: `test-results/hosted-enrollment-error-390x900.png`,
    })
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/api/auth/enroll', async (route) => {
      await pending
      return route.fallback()
    })
    const retryPositions = new Map<number, number>()
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      const position = (await page
        .getByRole('button', { name: 'Try again' })
        .boundingBox())!
      retryPositions.set(width, position.y)
    }
    try {
      await page.getByRole('button', { name: 'Try again' }).click()
      await expect(page.getByRole('status')).toContainText(
        'Joining the current universe',
      )
      for (const [width, retryY] of retryPositions) {
        await page.setViewportSize({ width, height: 900 })
        const position = (await page
          .getByRole('button', { name: 'Joining…' })
          .boundingBox())!
        expect(Math.abs(position.y - retryY)).toBeLessThan(1)
        await diagnosticScreenshot(page, {
          path: `test-results/hosted-enrollment-pending-${width}x900.png`,
        })
      }
    } finally {
      release()
    }
    await expect(page).toHaveURL(`${baseURL}${empirePath}`)
    expect(fixture.enrollments).toEqual([{ universe: binding.universe }])
  },
)

test('a join return path with a different hosted binding opens universe selection without enrolling', async ({
  page,
  baseURL,
}) => {
  const fixture = await hostedFixture(page, baseURL, {
    mode: 'oidc',
    hostedUniverse: '00000000-0000-4000-8000-000000000099',
  })
  fixture.authenticate()
  await withBootstrapResponse(page, () => page.goto(joinPath))
  await expect(page).toHaveURL(/\/$/)
  await expect(
    page.getByRole('heading', { name: 'Choose your universe' }),
  ).toBeVisible()
  expect(fixture.enrollments).toEqual([])
})
