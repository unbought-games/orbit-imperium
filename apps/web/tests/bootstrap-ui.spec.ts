import { test, expect } from '@playwright/test'
import { binding, body, shellFixture } from './fixtures/game'
import { bootstrapFixture } from '../src/test-support/bootstrap'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/analytics', (route) =>
    route.fulfill({ json: { enabled: false } }),
  )
  await page.route('**/api/auth/config', (route) =>
    route.fulfill({ json: { mode: 'local', universes: [] } }),
  )
})

test('OIDC configuration selects hosted sign-in and retains the source offer', async ({
  page,
}) => {
  await page.route('**/api/v1/bootstrap', (route) =>
    route.fulfill({
      json: {
        version: 1,
        signup_enabled: true,
        result: { status: 'anonymous' },
      },
    }),
  )
  await page.route('**/api/auth/config', (route) =>
    route.fulfill({
      json: {
        mode: 'oidc',
        universes: [],
        accounts_url: 'https://accounts.example',
        client_id: 'game',
      },
    }),
  )
  const destination = `/u/andromeda/b/${body.id}/resources`
  await page.goto(`/login?${new URLSearchParams({ redirect: destination })}`)
  await expect(
    page.getByRole('link', { name: 'Continue with Unbought' }),
  ).toHaveAttribute(
    'href',
    `/api/auth/login?${new URLSearchParams({ return_to: destination })}`,
  )
  await expect(page.getByRole('region', { name: 'Starting open beta' })).toContainText('reset the universe and its progress before full public launch')
  await expect(page.getByRole('navigation', { name: 'Policies and support' })).toBeVisible()
  await expect(page.getByLabel('Password')).toHaveCount(0)
  await expect(
    page.getByRole('link', { name: 'Source', exact: true }),
  ).toBeVisible()
})

test('login and signup preserve the requested game destination', async ({
  page,
}) => {
  await shellFixture(page)
  for (const path of ['/login', '/signup']) {
    await page.goto(path)
    await expect(
      page.getByRole('heading', { name: /^Empire —/ }),
    ).toBeVisible()
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
  const payload = bootstrapFixture(3)
  if (
    payload.result.status !== 'authenticated' ||
    payload.result.game.status !== 'ready'
  )
    throw Error('fixture')
  payload.result.game.snapshot.view.bodies = [body]
  await page.route('**/api/v1/session?bootstrap=true', (route) =>
    route.fulfill({ json: payload }),
  )
  const destination = `/u/andromeda/b/${body.id}/resources`
  await page.goto(destination)
  await expect(page).toHaveURL(/\/login\?/)
  await expect(
    page.getByRole('link', { name: 'Source', exact: true }),
  ).toHaveAttribute('href', '/source.tar.gz')
  expect(new URL(page.url()).searchParams.get('redirect')).toBe(destination)
  await page
    .getByRole('link', { name: 'Create an account', exact: true })
    .click()
  await expect(page).toHaveURL(/\/signup\?/)
  await expect(
    page.getByRole('link', { name: 'Source', exact: true }),
  ).toBeVisible()
  expect(new URL(page.url()).searchParams.get('redirect')).toBe(destination)
  await page.reload()
  await page.getByRole('link', { name: 'Back to sign in', exact: true }).click()
  await expect(page.getByLabel('Password')).toHaveAttribute(
    'autocomplete',
    'current-password',
  )
  await page.getByLabel('Account', { exact: true }).fill('player')
  await page.getByLabel('Password').fill('password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Resources', exact: true }),
  ).toBeVisible()
  expect(new URL(page.url()).pathname).toBe(destination)
})

test('anonymous entry aliases and unavailable paths render without session errors', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.route('**/api/v1/bootstrap', (route) =>
    route.fulfill({
      json: {
        version: 1,
        signup_enabled: true,
        result: { status: 'anonymous' },
      },
    }),
  )
  await page.goto('/index.html')
  await expect(page).toHaveURL(/\/$/)
  await expect(
    page.getByRole('link', { name: 'Sign in', exact: true }),
  ).toBeVisible()
  await page.goto('/unknown')
  await expect(
    page.getByRole('heading', { name: 'Destination unavailable' }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Open your universe overview' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(
    page.getByRole('link', { name: 'Sign in', exact: true }),
  ).toBeVisible()
  expect(errors).toEqual([])
})

test('public pages have distinct URLs that survive refresh and history navigation', async ({
  page,
}) => {
  await page.route('**/api/v1/bootstrap', (route) =>
    route.fulfill({
      json: {
        version: 1,
        signup_enabled: true,
        result: { status: 'anonymous' },
      },
    }),
  )
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByLabel('Password')).toHaveCount(0)
  await page.getByRole('link', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByLabel('Password')).toHaveAttribute(
    'autocomplete',
    'current-password',
  )
  await page
    .getByRole('link', { name: 'Create an account', exact: true })
    .click()
  await expect(page).toHaveURL(/\/signup$/)
  await page.reload()
  await expect(page.getByLabel('Password')).toHaveAttribute(
    'autocomplete',
    'new-password',
  )
  await page.goBack()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByLabel('Password')).toHaveAttribute(
    'autocomplete',
    'current-password',
  )
  await page.goForward()
  await expect(page).toHaveURL(/\/signup$/)
  await expect(
    page.getByRole('button', { name: 'Create account', exact: true }),
  ).toBeVisible()
  await page.getByRole('link', { name: /^Orbit Imperium$/i }).click()
  await expect(page).toHaveURL(/\/$/)
  await page
    .getByRole('link', { name: 'Create an account', exact: true })
    .click()
  await expect(page).toHaveURL(/\/signup$/)
  await page.getByRole('link', { name: 'Back to sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.reload()
  await expect(
    page.getByRole('button', { name: 'Sign in', exact: true }),
  ).toBeVisible()
})

test('disabled signup and protected game routes lead to login', async ({
  page,
}) => {
  await page.route('**/api/v1/bootstrap', (route) =>
    route.fulfill({
      json: {
        version: 1,
        signup_enabled: false,
        result: { status: 'anonymous' },
      },
    }),
  )
  await page.goto('/')
  await expect(
    page.getByRole('link', { name: 'Sign in', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Create an account' }),
  ).toHaveCount(0)
  for (const path of ['/signup', '/u/u/b/earth/overview']) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/login(?:\?|$)/)
    await expect(
      page.getByRole('button', { name: 'Sign in', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Create an account' }),
    ).toHaveCount(0)
  }
})

for (const width of [390, 1280]) {
  for (const signup of [false, true]) {
    test(`authentication error stays above its action at ${width}px (signup=${signup})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.route('**/api/v1/bootstrap', (route) =>
        route.fulfill({
          json: {
            version: 1,
            signup_enabled: true,
            result: { status: 'anonymous' },
          },
        }),
      )
      await page.route(
        signup
          ? '**/api/v1/registration?bootstrap=true'
          : '**/api/v1/session?bootstrap=true',
        (route) =>
          route.fulfill({
            status: 403,
            json: { code: 'Forbidden', status: 403, type: 'about:blank' },
          }),
      )
      await page.goto(signup ? '/signup' : '/login')
      await page.getByLabel('Account', { exact: true }).fill('player')
      await page.getByLabel('Password', { exact: true }).fill('password')
      const submit = page.getByRole('button', {
        name: signup ? 'Create account' : 'Sign in',
        exact: true,
      })
      await submit.click()
      const alert = page.locator('form').getByRole('alert')
      await expect(alert).toBeVisible()
      await expect(alert).toBeFocused()
      await expect(page.getByRole('alert')).toHaveCount(1)
      const calloutBox = await alert.boundingBox(),
        submitBox = await submit.boundingBox()
      expect(calloutBox!.y + calloutBox!.height).toBeLessThan(submitBox!.y)
      expect(
        submitBox!.y - calloutBox!.y - calloutBox!.height,
      ).toBeLessThanOrEqual(24)
      await page
        .getByRole('link', {
          name: signup ? 'Back to sign in' : 'Create an account',
          exact: true,
        })
        .click()
      await expect(page.getByRole('alert')).toHaveCount(0)
    })
  }
}
test('development bootstrap uses one request and never inserts login or connection screens', async ({
  page,
}) => {

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
            (node.matches('form') ||
              node.querySelector('input[name="password"]') ||
              node.textContent?.includes('Connecting to your universe'))
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
})
test('unavailable startup stays distinct from anonymous and still supports manual retry', async ({
  page,
}) => {

  let reads = 0
  await page.route('**/api/v1/bootstrap', (route) => {
    reads++
    return route.fulfill({
      json: {
        version: 1,
        signup_enabled: false,
        result:
          reads === 1
            ? { status: 'unavailable', code: 'Unavailable' }
            : { status: 'anonymous' },
      },
    })
  })
  await page.goto('/login')
  await expect(
    page.getByRole('button', { name: 'Retry connection' }),
  ).toBeVisible()
  await expect(page.getByLabel('Password')).toHaveCount(0)
  expect(reads).toBe(1)
  await page.getByRole('button', { name: 'Retry connection' }).click()
  await expect(page.getByLabel('Password')).toBeVisible()
  expect(reads).toBe(2)
})

for (const signup of [false, true]) {
  test(`explicit ${signup ? 'signup' : 'login'} records presence after retry; reload and cached-page restore do not`, async ({
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
    let signedIn = false,
      logins = 0,
      bootstrapReads = 0
    await page.route('**/api/**', async (route) => {
      const request = route.request(),
        path = new URL(request.url()).pathname
      if (path === '/api/auth/config') return route.fallback()
      if (path === '/api/v1/bootstrap') {
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
      if (path === '/api/v1/session' || path === '/api/v1/registration') {
        signedIn = true
        const failed = structuredClone(payload)
        if (failed.result.status === 'authenticated')
          failed.result.game = { status: 'unavailable', code: 'Unavailable' }
        return route.fulfill({ json: failed })
      }
      if (path.endsWith('/presence')) {
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
      if (path.endsWith('/overview'))
        return route.fulfill({
          json: {
            ...snapshot.view,
            request_id: request.postDataJSON().request_id,
          },
        })
      return route.fulfill({ status: 404, json: { code: 'NotFound' } })
    })
    await page.goto(signup ? '/signup' : '/login')
    await page.getByLabel('Account', { exact: true }).fill('test')
    await page.getByLabel('Password').fill('p')
    await page
      .getByRole('button', {
        name: signup ? 'Create account' : 'Sign in',
        exact: true,
      })
      .click()
    await expect(
      page.getByRole('button', { name: 'Retry connection' }),
    ).toBeVisible()
    expect(logins).toBe(0)
    await page.getByRole('button', { name: 'Retry connection' }).click()
    await expect(
      page.getByRole('heading', { name: /^Empire —/ }),
    ).toBeVisible()
    await expect.poll(() => logins).toBe(1)
    await page.reload()
    await expect(
      page.getByRole('heading', { name: /^Empire —/ }),
    ).toBeVisible()
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
}

test('a populated HTML payload renders without a bootstrap request', async ({
  page,
}) => {
  const { bootstrapFixture } = await import('../src/test-support/bootstrap')
  const { body } = await import('./fixtures/game')
  const payload = bootstrapFixture(3)
  if (
    payload.result.status !== 'authenticated' ||
    payload.result.game.status !== 'ready'
  )
    throw Error('fixture')
  payload.result.game.snapshot.view.bodies = [body]
  await page.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document') return route.fallback()
    const response = await route.fetch()
    const html = (await response.text()).replace(
      '<script id="orbit-bootstrap" type="application/json"></script>',
      `<script id="orbit-bootstrap" type="application/json">${JSON.stringify(payload)}</script>`,
    )
    return route.fulfill({ response, body: html })
  })
  const calls: string[] = []
  await page.route('**/api/**', (route) => {
    calls.push(new URL(route.request().url()).pathname)
    return route.fulfill({ status: 503, json: { code: 'Unavailable' } })
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /^Empire —/ })).toBeVisible()
  expect(
    calls.filter(
      (p) =>
        p === '/api/v1/bootstrap' ||
        p === '/api/v1/session' ||
        p.endsWith('/binding') ||
        p.endsWith('/settings'),
    ),
  ).toEqual([])
  expect(await page.locator('#orbit-bootstrap').count()).toBe(0)
})

for (const restoreDuringSubmit of [false, true]) {
  test(`slow Login presence waits before polling and cancels cleanly (restore=${restoreDuringSubmit})`, async ({
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
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    let presenceRequests = 0,
      receiptRequests = 0,
      discoveries = 0,
      views = 0
    await page.route('**/api/**', async (route) => {
      const request = route.request(),
        path = new URL(request.url()).pathname
      if (path === '/api/auth/config') return route.fallback()
      if (path === '/api/v1/bootstrap')
        return route.fulfill({
          json: {
            version: 1,
            signup_enabled: false,
            result: { status: 'anonymous' },
          },
        })
      if (path === '/api/v1/session') return route.fulfill({ json: payload })
      if (path.endsWith('/presence')) {
        presenceRequests++
        const envelope = request.postDataJSON()
        await pending
        return route.fulfill({
          json: {
            protocol: 4,
            binding: snapshot.candidate.binding,
            command_id: envelope.command_id,
            admitted_at: 1000,
            executed_at: 1000,
            status: 'Committed',
            result_ids: [],
            minimum_viewer_revision: '0',
          },
        })
      }
      if (path.includes('/commands/')) receiptRequests++
      if (path.endsWith('/binding')) discoveries++
      if (path.endsWith('/overview')) {
        views++
        return route.fulfill({
          json: {
            ...snapshot.view,
            request_id: request.postDataJSON().request_id,
          },
        })
      }
      return route.fulfill({ status: 404, json: { code: 'NotFound' } })
    })
    await page.goto('/login')
    await page.getByLabel('Account', { exact: true }).fill('player')
    await page.getByLabel('Password').fill('password')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(
      page.getByRole('heading', { name: /^Empire —/ }),
    ).toBeVisible()
    await expect.poll(() => presenceRequests).toBe(1)
    // Exercise more than the initial 500 ms polling delay while submit is held.
    try {
      await page.waitForTimeout(1000)
      expect({ receiptRequests, discoveries, views }).toEqual({
        receiptRequests: 0,
        discoveries: 0,
        views: 0,
      })
      if (restoreDuringSubmit) {
        await page.evaluate(() =>
          window.dispatchEvent(
            new PageTransitionEvent('pageshow', { persisted: true }),
          ),
        )
        await expect(page.getByLabel('Password')).toBeVisible()
      }
    } finally {
      release()
    }
    if (restoreDuringSubmit) {
      await page.waitForTimeout(700)
      expect({ receiptRequests, discoveries, views }).toEqual({
        receiptRequests: 0,
        discoveries: 0,
        views: 0,
      })
      return
    }
    // The committed receipt refreshes once; an in-flight submit must not
    // schedule a redundant recovery read.
    await expect.poll(() => views).toBe(1)
    expect(presenceRequests).toBe(1)
    await expect(
      page.getByRole('heading', { name: /^Empire —/ }),
    ).toBeVisible()
  })
}

for (const signup of [false, true]) {
  test(`public ${signup ? 'signup' : 'login'} keeps native entry, edits and busy feedback`, async ({
    page,
  }) => {
    await page.route('**/api/v1/bootstrap', (route) =>
      route.fulfill({
        json: {
          version: 1,
          signup_enabled: true,
          result: { status: 'anonymous' },
        },
      }),
    )
    let requests = 0
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route(
      signup
        ? '**/api/v1/registration?bootstrap=true'
        : '**/api/v1/session?bootstrap=true',
      async (route) => {
        requests++
        expect(route.request().postDataJSON()).toMatchObject({
          name: 'native-player',
          password: 'pasted-password',
        })
        await pending
        await route.fulfill({
          status: 403,
          json: { code: 'Forbidden', status: 403, type: 'about:blank' },
        })
      },
    )
    await page.goto(signup ? '/signup' : '/login')
    const account = page.getByLabel('Account', { exact: true })
    const password = page.getByLabel('Password', { exact: true })
    await expect(account).toHaveAttribute('autocomplete', 'username')
    await expect(account).toHaveAttribute('required', '')
    await expect(password).toHaveAttribute('required', '')
    await page
      .getByRole('button', {
        name: signup ? 'Create account' : 'Sign in',
        exact: true,
      })
      .click()
    expect(requests).toBe(0)
    await account.fill('native-player')
    // insertText exercises browser text insertion without replacing native controls.
    await password.focus()
    await page.keyboard.insertText('pasted-password')
    await password.press('Enter')
    const pendingAction = page.getByRole('button', {
      name: signup ? 'Creating account…' : 'Signing in…',
      exact: true,
    })
    await expect(pendingAction).toBeDisabled()
    await expect(page.locator('form')).toHaveAttribute('aria-busy', 'true')
    await password.press('Enter')
    expect(requests).toBe(1)
    release()
    await expect(page.getByRole('alert')).toBeFocused()
    await expect(account).toHaveValue('native-player')
    await expect(password).toHaveValue('pasted-password')
    await expect(page.locator('form')).toHaveAttribute('aria-busy', 'false')
  })
}

test('public forms reflow with short phone viewports and unavailable artwork', async ({
  page,
}) => {
  await page.route('**/api/v1/bootstrap', (route) =>
    route.fulfill({
      json: {
        version: 1,
        signup_enabled: true,
        result: { status: 'anonymous' },
      },
    }),
  )
  await page.route('**/art/**', (route) => route.abort())
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const width of [320, 360, 390, 430, 768]) {
    await page.setViewportSize({ width, height: 480 })
    await page.goto('/signup')
    await expect(page.locator('img[src^="/art/atlas/"]:visible')).toHaveCount(0)
    await page.getByLabel('Account', { exact: true }).fill('still-usable')
    await page.getByLabel('Password', { exact: true }).fill('password')
    const action = page.getByRole('button', {
      name: 'Create account',
      exact: true,
    })
    await action.scrollIntoViewIfNeeded()
    await expect(action).toBeInViewport()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  }
  await page.setViewportSize({ width: 390, height: 700 })
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '32px'
  })
  await page
    .getByRole('button', { name: 'Create account', exact: true })
    .scrollIntoViewIfNeeded()
  await expect(page.getByLabel('Account', { exact: true })).toHaveValue(
    'still-usable',
  )
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
})

test('public auth mode changes discard external and escaped return destinations', async ({
  page,
}) => {
  await page.route('**/api/v1/bootstrap', (route) =>
    route.fulfill({
      json: {
        version: 1,
        signup_enabled: true,
        result: { status: 'anonymous' },
      },
    }),
  )
  for (const redirect of [
    'https://example.com',
    '//example.com',
    '/u/../../login',
  ]) {
    await page.goto(`/login?redirect=${encodeURIComponent(redirect)}`)
    await page
      .getByRole('link', { name: 'Create an account', exact: true })
      .click()
    expect(new URL(page.url()).pathname).toBe('/signup')
    expect(new URL(page.url()).searchParams.has('redirect')).toBe(false)
  }
})

for (const mode of ['local', 'oidc']) {
  test(`sign-in configuration errors can be retried in ${mode} mode`, async ({
    page,
  }) => {
    await page.route('**/api/v1/bootstrap', (route) =>
      route.fulfill({
        json: {
          version: 1,
          signup_enabled: true,
          result: { status: 'anonymous' },
        },
      }),
    )
    let available = false
    await page.route('**/api/auth/config', (route) =>
      available
        ? route.fulfill({ json: { mode, universes: [] } })
        : route.fulfill({ status: 503 }),
    )
    await page.goto('/login')
    await expect(page.getByRole('alert')).toContainText(
      'Unable to load sign-in options',
    )
    available = true
    await page.getByRole('button', { name: 'Try again', exact: true }).click()
    if (mode === 'local')
      await expect(page.getByLabel('Password', { exact: true })).toBeVisible()
    else
      await expect(
        page.getByRole('link', { name: 'Continue with Unbought' }),
      ).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
  })
}

test('starting beta and reset notice appear before public enrollment with approved policy links', async ({ page }) => {
  await page.route('**/api/v1/bootstrap', route => route.fulfill({ json: {
    version: 1, signup_enabled: true, result: { status: 'anonymous' },
  } }))
  await page.setViewportSize({ width: 390, height: 844 })
  for (const path of ['/', '/login', '/signup']) {
    await page.goto(path)
    const notice = page.getByRole('region', { name: 'Starting open beta' })
    await expect(notice).toContainText('The game is incomplete, with more content to come.')
    await expect(notice).toContainText('We reserve the right to reset the universe and its progress before full public launch.')
    const policies = page.getByRole('navigation', { name: 'Policies and support' })
    for (const [name, destination] of [['Terms', 'terms'], ['Privacy', 'privacy'], ['Conduct', 'conduct']])
      await expect(policies.getByRole('link', { name, exact: true })).toHaveAttribute('href', `https://unbought.games/${destination}/`)
    await expect(policies.getByRole('link', { name: 'Support', exact: true })).toHaveAttribute('href', 'mailto:ethan@unbought.games')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    if (path === '/signup') {
      const action = page.getByRole('button', { name: 'Create account', exact: true })
      expect((await notice.boundingBox())!.y).toBeLessThan((await action.boundingBox())!.y)
      await page.screenshot({ path: 'test-results/open-beta-signup-mobile.png', fullPage: true })
    }
  }
})

test('signed-in settings retain the beta notice and best-effort support target', async ({ page }) => {
  await shellFixture(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/u/andromeda/settings?body=${body.id}`)
  await expect(page.getByRole('region', { name: 'Starting open beta' })).toContainText('reset the universe and its progress before full public launch')
  const help = page.getByRole('region', { name: 'Help and conduct reports' })
  await expect(help).toContainText('Support is best effort: we aim to respond within 24 hours, but response times are not guaranteed.')
  await expect(help.getByRole('link', { name: 'ethan@unbought.games' })).toHaveAttribute('href', 'mailto:ethan@unbought.games')
  await expect(page.getByRole('navigation', { name: 'Policies and support' })).toHaveCount(0)
  await expect(page.getByRole('contentinfo')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/open-beta-settings-mobile.png', fullPage: true })
})

test('universe names appear on desktop while mobile stays compact and every game link uses the current name', async ({ page }) => {
  const options = { universeName: 'Andromeda' }
  await shellFixture(page, options)
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(page.getByLabel('Current universe', { exact: true })).toHaveText('Andromeda')
    if (width >= 768) await expect(page.getByLabel('Current universe', { exact: true })).toBeVisible()
    else await expect(page.getByLabel('Current universe', { exact: true })).toBeHidden()
    await expect(page).toHaveTitle(/ · Andromeda · Orbit Imperium$/)
    expect(await page.evaluate(() => [...document.querySelectorAll<HTMLAnchorElement>('a[href]')]
      .map(a => new URL(a.href).pathname).filter(path => path.startsWith('/u/'))
      .every(path => path.startsWith('/u/andromeda/')))).toBe(true)
  }
  await page.goto(`/u/andromeda/settings?body=${body.id}`)
  await expect(page.locator('dt').filter({ hasText: /^Universe$/ }).locator('..')).toContainText('Andromeda')

  // Rename at the authority, then refresh the old link: no alias or redirect.
  options.universeName = 'My / Universe? #1'
  const oldPath = new URL(page.url()).pathname
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Destination unavailable', exact: true })).toBeVisible()
  expect(new URL(page.url()).pathname).toBe(oldPath)
  await expect(page.getByLabel('Current universe', { exact: true })).toHaveText(options.universeName)
  await page.getByRole('link', { name: 'Open your universe overview' }).click()
  await expect(page).toHaveURL(new RegExp(`/u/my-~2f~-universe~3f~-~23~1/b/${body.id}/overview$`))
  await expect(page).toHaveTitle(/My \/ Universe\? #1/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/universe-name-mobile.png', fullPage: true })

  const uuidPath = `/u/${binding.universe}/b/${body.id}/overview`
  await page.goto(uuidPath)
  await expect(page.getByRole('heading', { name: 'Destination unavailable', exact: true })).toBeVisible()
  expect(new URL(page.url()).pathname).toBe(uuidPath)
})

test('enrollment displays a universe name and submits its stable UUID', async ({ page }) => {
  const payload = bootstrapFixture(3)
  if (payload.result.status !== 'authenticated') throw Error('fixture')
  payload.result.session.memberships = []
  payload.result.game = { status: 'no_membership' }
  await page.route('**/api/v1/bootstrap', route => route.fulfill({ json: payload }))
  await page.route('**/api/v1/session', route => route.fulfill({ json: { csrf: 'fixture' } }))
  await page.route('**/api/auth/config', route => route.fulfill({ json: {
    mode: 'oidc', universes: [{ universe: binding.universe, name: 'Whirlpool' }],
  } }))
  let enrolled: unknown
  await page.route('**/api/auth/enroll', async route => {
    enrolled = route.request().postDataJSON()
    await route.fulfill({ status: 204 })
  })
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Join Whirlpool', exact: true })).toBeVisible()
  await expect(page.locator('body')).not.toContainText(binding.universe)
  await page.getByRole('button', { name: 'Join Whirlpool', exact: true }).click()
  await expect.poll(() => enrolled).toEqual({ universe: binding.universe })
})

test('local signup identifies the named universe', async ({ page }) => {
  await page.route('**/api/v1/bootstrap', route => route.fulfill({ json: {
    version: 1, signup_enabled: true, result: { status: 'anonymous' },
  } }))
  await page.route('**/api/auth/config', route => route.fulfill({ json: {
    mode: 'local', universes: [{ universe: binding.universe, name: 'Triangulum' }],
  } }))
  await page.goto('/signup')
  await expect(page.getByText('Join Triangulum', { exact: true })).toBeVisible()
})


test('mobile startup automatically recovers from a transient restart without signing in again', async ({ page }) => {
  // Allow cold route compilation while other validation runs share the host.
  const ready = expect.configure({ timeout: 30000 })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.clock.install()
  await page.clock.pauseAt(new Date())
  const payload = bootstrapFixture(4)
  if (payload.result.status !== 'authenticated' || payload.result.game.status !== 'ready') throw Error('fixture')
  const snapshot = payload.result.game.snapshot
  snapshot.view.bodies = [body]
  const preparing = structuredClone(payload)
  if (preparing.result.status !== 'authenticated') throw Error('fixture')
  preparing.result.game = { status: 'unavailable', code: 'Unavailable' }
  let reads = 0
  let releasePreparation!: () => void
  const preparation = new Promise<void>(resolve => { releasePreparation = resolve })
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    if (path === '/api/auth/config') return route.fallback()
    if (path === '/api/v1/bootstrap') {
      reads++
      if (reads === 2) {
        await preparation
        return route.fulfill({ json: preparing })
      }
      return route.fulfill({ json: reads > 2 ? payload : {
        version: 1, signup_enabled: true,
        result: { status: 'unavailable', code: 'Unavailable' },
      } })
    }
    if (path.endsWith('/overview')) return route.fulfill({ json: {
      ...snapshot.view, request_id: request.postDataJSON().request_id,
    } })
    return route.fulfill({ status: 404, json: { code: 'NotFound' } })
  })
  await page.goto(`/u/andromeda/b/${body.id}/overview`)
  await ready(page.getByText('Connection temporarily unavailable. Reconnecting automatically…')).toBeVisible()
  await ready(page.getByLabel('Password')).toHaveCount(0)
  await page.screenshot({ path: 'test-results/transient-recovery-mobile.png', fullPage: true })
  await page.clock.runFor(1000)
  await ready.poll(() => reads).toBe(2)
  // A request reaching the fixture does not mean the client applied its response.
  // Keep it in flight across a backoff interval, then wait for the authenticated
  // preparation state before advancing the next retry's clock.
  await page.clock.runFor(2000)
  expect(reads).toBe(2)
  releasePreparation()
  await ready(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible()
  await page.clock.runFor(1999)
  expect(reads).toBe(2)
  await page.clock.runFor(1)
  await ready.poll(() => reads).toBe(3)
  await ready(page.getByRole('heading', { name: /^Empire —/ })).toBeVisible()
  expect(reads).toBe(3)
  await ready(page.getByLabel('Password')).toHaveCount(0)
  await page.screenshot({ path: 'test-results/transient-recovered-mobile.png', fullPage: true })
})


test('automatic outage retries preserve Retry and Sign out focus without manual-error alerts', async ({ page }) => {
  const ready = expect.configure({ timeout: 30000 })
  await page.clock.install()
  await page.clock.pauseAt(new Date())
  const payload = bootstrapFixture(4)
  if (payload.result.status !== 'authenticated') throw Error('fixture')
  payload.result.game = { status: 'unavailable', code: 'Unavailable' }
  let reads = 0
  const release = new Map<number, () => void>()
  const completed = new Set<number>()
  await page.route('**/api/v1/bootstrap', async route => {
    const read = ++reads
    if (read === 1) return route.fulfill({ json: payload })
    await new Promise<void>(resolve => release.set(read, resolve))
    if (read === 2) await route.fulfill({ status: 503, json: { code: 'Unavailable' } })
    else await route.abort('failed')
    completed.add(read)
  })
  await page.goto('/login')
  const retry = page.getByRole('button', { name: 'Retry connection' })
  const signout = page.getByRole('button', { name: 'Sign out', exact: true })
  await ready(retry).toBeVisible()
  for (const [read, control, delay] of [[2, retry, 1000], [3, signout, 2000]] as const) {
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
    await ready(page.getByRole('alert')).toHaveText('Connection temporarily unavailable. Reconnecting automatically…')
    await ready(page.getByText('Unable to connect. Please retry.')).toHaveCount(0)
  }
})
