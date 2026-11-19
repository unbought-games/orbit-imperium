import { expect, test, type Page } from './fixture'
import type {} from './authentication.scenario'

// HostedJoin uses a real native document navigation to /. Serve the destination
// feature there using this fixture's prebuilt entry; normal game bootstrap and
// membership retrieval remain covered at the application's hosted boundary.
async function expectLanding(page: Page, mode: 'member-home' | 'choice') {
  const writes: string[] = []
  let documents = 0
  await page.exposeFunction('recordHostedEnrollment', (universe: string) => {
    writes.push(universe)
  })
  await page.route(
    (url) => url.pathname === '/' && !url.search,
    (route) => {
      const req = route.request()
      if (req.method() !== 'GET' || req.resourceType() !== 'document')
        return route.fallback()
      documents++
      return route.fulfill({
        status: 302,
        headers: { location: `/?scenario=authentication&mode=${mode}` },
      })
    },
  )
  return { writes, documents: () => documents }
}

for (const mode of ['login', 'signup'] as const) {
  test(`native ${mode} keeps edits and busy state until the real controller handles refusal`, async ({
    page,
  }) => {
    await page.goto('/?scenario=authentication&mode=' + mode)
    await expect(page.locator('html')).toHaveAttribute(
      'data-component-ready',
      'authentication',
    )
    const signup = mode === 'signup'
    const account = page.getByLabel('Account', { exact: true }),
      password = page.getByLabel('Password', { exact: true })
    await expect(account).toHaveAttribute('autocomplete', 'username')
    await expect(account).toHaveAttribute('required', '')
    await expect(password).toHaveAttribute('required', '')
    await expect(password).toHaveAttribute(
      'autocomplete',
      signup ? 'new-password' : 'current-password',
    )
    if (signup)
      await expect(
        page.getByText('Join Andromeda', { exact: true }),
      ).toBeVisible()
    await page
      .getByRole('button', {
        name: signup ? 'Create account' : 'Sign in',
        exact: true,
      })
      .click()
    expect(
      await page.evaluate(() => window.authenticationScene.requests),
    ).toEqual([])
    await account.fill('native-player')
    await password.focus()
    await page.keyboard.insertText('pasted-password')
    await password.press('Enter')
    try {
      await expect(
        page.getByRole('button', {
          name: signup ? 'Creating account…' : 'Signing in…',
          exact: true,
        }),
      ).toBeDisabled()
      await expect(page.locator('form')).toHaveAttribute('aria-busy', 'true')
      await password.press('Enter')
      expect(
        await page.evaluate(() => window.authenticationScene.requests),
      ).toEqual([
        { kind: mode, name: 'native-player', password: 'pasted-password' },
      ])
    } finally {
      await page.evaluate(() => window.authenticationScene.release())
    }
    await expect(page.getByRole('alert')).toBeFocused()
    await expect(account).toHaveValue('native-player')
    await expect(password).toHaveValue('pasted-password')
    await expect(page.locator('form')).toHaveAttribute('aria-busy', 'false')
    await page
      .getByRole('link', {
        name: signup ? 'Back to sign in' : 'Create an account',
        exact: true,
      })
      .click()
    await expect(password).toHaveAttribute(
      'autocomplete',
      signup ? 'current-password' : 'new-password',
    )
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(
      page.getByRole('status', { name: 'Current route' }),
    ).toHaveText(signup ? '/login' : '/signup')
  })
}
test('retrying unavailable sign-in configuration renders the hosted account link', async ({
  page,
}) => {
  await page.goto('/?scenario=authentication&config=retry')
  await expect(page.locator('html')).toHaveAttribute(
    'data-component-ready',
    'authentication',
  )
  await expect(page.getByRole('alert')).toBeVisible()
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(
    page.getByRole('link', {
      name: 'Continue with your Unbought Account',
      exact: true,
    }),
  ).toHaveAttribute('href', /\/api\/auth\/login\?return_to=/)
  expect(
    await page.evaluate(() => window.authenticationScene.configReads()),
  ).toBe(2)
})

test('the named universe chooser submits its UUID and displays authoritative refusal', async ({
  page,
}) => {
  await page.goto('/?scenario=authentication&mode=choice')
  await expect(page.locator('html')).toHaveAttribute(
    'data-component-ready',
    'authentication',
  )
  const join = page.getByRole('button', { name: 'Join Andromeda', exact: true })
  await expect(join).toBeVisible()
  await join.click()
  await expect(page.getByRole('alert')).toHaveText(
    'Universe admission refused.',
  )
  expect(
    await page.evaluate(() => window.authenticationScene.enrollments),
  ).toEqual(['00000000-0000-4000-8000-000000000003'])
})
test('a direct hosted recovery visit waits for the player to retry before attempting enrollment', async ({
  page,
}) => {
  const landing = await expectLanding(page, 'choice')
  await page.goto('/?scenario=authentication&mode=join')
  await expect(page.locator('html')).toHaveAttribute(
    'data-component-ready',
    'authentication',
  )
  const retry = page.getByRole('button', { name: 'Try again', exact: true })
  await expect(retry).toBeEnabled()
  expect(
    await page.evaluate(() => window.authenticationScene.enrollments),
  ).toEqual([])
  await expect(
    page.getByRole('link', { name: 'Choose a universe' }),
  ).toHaveAttribute('href', '/')
  await retry.click()
  await expect(page.getByRole('alert')).toHaveText(
    'Universe admission refused.',
  )
  expect(
    await page.evaluate(() => window.authenticationScene.enrollments),
  ).toEqual(['00000000-0000-4000-8000-000000000003'])
  await page.getByRole('link', { name: 'Choose a universe' }).click()
  await expect(
    page.getByRole('heading', { name: 'Choose your universe' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Join Andromeda' }),
  ).toBeEnabled()
  expect(landing.documents()).toBe(1)
  expect(landing.writes).toEqual(['00000000-0000-4000-8000-000000000003'])
})

test('disabled local registration resolves to the login form without offering signup', async ({
  page,
}) => {
  await page.goto('/?scenario=authentication&mode=signup&closed')
  await expect(page.locator('html')).toHaveAttribute(
    'data-component-ready',
    'authentication',
  )
  await expect(
    page.getByRole('button', { name: 'Sign in', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Create an account', exact: true }),
  ).toHaveCount(0)
  await expect(page.getByRole('status', { name: 'Current route' })).toHaveText(
    '/login',
  )
})
test('the hosted sign-in action carries the complete protected destination and takes native focus', async ({
  page,
}) => {
  await page.goto('/?scenario=authentication&config=hosted&protected')
  await expect(page.locator('html')).toHaveAttribute(
    'data-component-ready',
    'authentication',
  )
  const link = page.getByRole('link', {
    name: 'Continue with your Unbought Account',
    exact: true,
  })
  const url = new URL((await link.getAttribute('href'))!, page.url())
  expect(url.pathname).toBe('/api/auth/login')
  expect(url.searchParams.get('return_to')).toBe(
    '/u/andromeda/b/planet/messages#last',
  )
  await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0)
  await link.focus()
  await expect(link).toBeFocused()
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    const box = (await link.boundingBox())!
    expect(box.width).toBeGreaterThanOrEqual(44)
    expect(box.height).toBeGreaterThanOrEqual(44)
  }
})

test('unknown anonymous entry focuses the unavailable page and its native link opens the usable public home', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/?scenario=authentication&mode=unknown')
  await expect(page.locator('html')).toHaveAttribute(
    'data-component-ready',
    'authentication',
  )
  await expect(
    page.getByRole('heading', { name: 'Destination unavailable' }),
  ).toBeFocused()
  await page.getByRole('link', { name: 'Open your universe overview' }).click()
  await expect(page.getByRole('status', { name: 'Current route' })).toHaveText(
    '/',
  )
  await expect(
    page.getByRole('link', { name: 'Sign in', exact: true }),
  ).toBeVisible()
  expect(errors).toEqual([])
})
test('the anonymous index alias replaces its route and renders the home sign-in action', async ({
  page,
}) => {
  await page.goto('/?scenario=authentication&mode=alias')
  await expect(page.locator('html')).toHaveAttribute(
    'data-component-ready',
    'authentication',
  )
  await expect(page.getByRole('status', { name: 'Current route' })).toHaveText(
    '/',
  )
  await expect(
    page.getByRole('link', { name: 'Sign in', exact: true }),
  ).toBeVisible()
})

test('retrying hosted configuration redirects an existing member without attempting enrollment', async ({
  page,
}) => {
  const landing = await expectLanding(page, 'member-home')
  await page.goto('/?scenario=authentication&mode=join&member&config=retry')
  const retry = page.getByRole('button', { name: 'Try again', exact: true })
  await expect(page.getByRole('alert')).toHaveText(
    'Unable to load your universe. Please try again.',
  )
  await retry.click()
  await expect(page.getByRole('status', { name: 'Current route' })).toHaveText(
    '/u/andromeda/b/00000000-0000-4000-8000-000000000005/overview',
  )
  expect(landing.documents()).toBe(1)
  expect(landing.writes).toEqual([])
})
