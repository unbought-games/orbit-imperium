import { test, expect } from '@playwright/test'

test('production HTML bootstraps an authenticated refresh without startup reads or screen flashes', async ({
  page,
}) => {
  const login = await page.request.post('/api/v1/session', {
    headers: { Origin: process.env.ORBIT_TEST_BASE_URL! },
    data: { name: 'alpha', password: process.env.ALPHA_PASSWORD! },
  })
  expect(login.ok()).toBe(true)
  const session = await login.json()
  await page.addInitScript(() => {
    Reflect.set(window, 'startupFlashes', [])
    new MutationObserver((records) => {
      for (const r of records)
        for (const node of r.addedNodes) {
          if (
            node instanceof Element &&
            (node.matches('form') ||
              node.querySelector('input[name="password"]') ||
              node.textContent?.includes('Connecting to your universe'))
          )
            (Reflect.get(window, 'startupFlashes') as string[]).push(
              node.textContent ?? '',
            )
        }
    }).observe(document, { childList: true, subtree: true })
  })
  const calls: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('/api/')) calls.push(new URL(r.url()).pathname)
  })
  // Polling is allowed after activation, but cannot provide initial data in this test.
  await page.route('**/api/**/overview', (route) =>
    route.fulfill({ status: 503, json: { code: 'Unavailable' } }),
  )
  const response = await page.goto('/')
  expect(response?.headers()['cache-control']).toBe('private, no-store')
  expect(response?.headers()['vary']).toBe('Cookie')
  await expect(page.getByRole('heading', { name: /^Overview —/ })).toBeVisible()
  expect(
    calls.filter(
      (p) =>
        p === '/api/v1/bootstrap' ||
        p === '/api/v1/session' ||
        p === '/api/v1/registration' ||
        p.endsWith('/binding') ||
        p.endsWith('/settings'),
    ),
  ).toEqual([])
  expect(
    await page.evaluate(() => Reflect.get(window, 'startupFlashes')),
  ).toEqual([])
  expect(await page.locator('#orbit-bootstrap').count()).toBe(0)
  const deep = page.url()
  await page.reload()
  await expect(page.getByRole('heading', { name: /^Overview —/ })).toBeVisible()
  expect(page.url()).toBe(deep)
  expect(
    await page.evaluate(() => Reflect.get(window, 'startupFlashes')),
  ).toEqual([])
  await page.request.delete('/api/v1/session', {
    headers: {
      Origin: process.env.ORBIT_TEST_BASE_URL!,
      'X-CSRF-Token': session.csrf,
    },
  })
  const revoked = await page.reload()
  await expect(page.getByLabel('Password')).toBeVisible()
  expect(await revoked!.text()).not.toContain(session.account)
})

test('successful login keeps its cookie when initial game loading is unavailable', async ({
  page,
}) => {
  await page.route('**/api/v1/session?bootstrap=true', async (route) => {
    const response = await route.fetch()
    const payload = await response.json()
    payload.result.game = { status: 'unavailable', code: 'Unavailable' }
    await route.fulfill({ response, json: payload })
  })
  await page.goto('/login')
  await page.getByLabel('Account', { exact: true }).fill('beta')
  await page.getByLabel('Password').fill(process.env.BETA_PASSWORD!)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Retry connection' }),
  ).toBeVisible()
  await expect(page.getByLabel('Password')).toHaveCount(0)
  expect((await page.request.get('/api/v1/session')).status()).toBe(200)
  await page.getByRole('button', { name: 'Retry connection' }).click()
  await expect(page.getByRole('heading', { name: /^Overview —/ })).toBeVisible()
})
