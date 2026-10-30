import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import {navigate,signOut} from './fixtures/navigation'
import { test, expect } from './fixtures/test'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
test('galaxy, dispatch, original-pair recovery, recall and authorized reports across G11 widths', async ({
  page,
}) => {


  const accounts = JSON.parse(
    readFileSync(process.env.ORBIT_MVP_ACCOUNTS_FILE!, 'utf8'),
  ) as { name: string; password: string }[]
  const signIn = async (i: number) => {
    await page.goto('/login')
    await page.getByLabel('Account', { exact: true }).fill(accounts[i].name)
    await page.getByLabel('Password').fill(accounts[i].password)
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(
      page.getByRole('heading', { name: /^Empire —/, exact: true }),
    ).toBeVisible()
  }
  const go = (name: string) => navigate(page, name)
  const auth = async () => {
    const session = await (await page.request.get('/api/v1/session')).json()
    const u = session.memberships[0].universe
    const binding = (
      await (
        await page.request.get(
          `/api/v4/universes/${u}/binding?request_id=${randomUUID()}`,
        )
      ).json()
    ).binding
    return {
      u,
      binding,
      headers: {
        Origin: process.env.ORBIT_TEST_BASE_URL!,
        'X-CSRF-Token': session.csrf,
      },
    }
  }
  const snapshot = async () => {
    const a = await auth()
    const res = await page.request.post(`/api/v4/universes/${a.u}/overview`, {
      headers: a.headers,
      data: { binding: a.binding, request_id: randomUUID() },
    })
    return res.status() === 503 ? null : res.json()
  }
  const freshSnapshot = async () => {
    let result
    await expect
      .poll(async () => {
        result = await snapshot()
        return !!result
      })
      .toBe(true)
    return result as Awaited<ReturnType<typeof snapshot>>
  }
  const advance = (at: number) =>
    execFileSync(
      'docker',
      [
        'compose',
        'exec',
        '-T',
        'db',
        'psql',
        '-U',
        'orbit',
        '-d',
        process.env.TEST_DB_NAME!,
        '-c',
        `UPDATE orbit_test_clock SET at_ms=${at}`,
      ],
      { stdio: 'pipe' },
    )
  await page.setViewportSize({ width: 390, height: 844 })
  await signIn(0)
  const a = await auth()
  const initial = await snapshot()
  if (initial?.missions.fleets.length) {
    advance(
      Math.max(
        ...initial.missions.fleets.map(
          (f: { due_at: number; duration_ms: number }) =>
            f.due_at + f.duration_ms,
        ),
      ),
    )
    await expect
      .poll(async () => (await snapshot())?.missions.fleets.length ?? -1)
      .toBe(0)
  }
  for (const width of [320, 360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await go('Galaxy')
    await expect(
      page
        .getByRole('region', { name: 'Galaxy positions' })
        .getByRole('listitem'),
    ).toHaveCount(15)
    await page.getByLabel('Solar system').fill('5')
    await page.getByLabel('Solar system').press('Enter')
    await expect(
      page
        .getByRole('region', { name: 'Galaxy positions' })
        .getByRole('listitem')
        .first(),
    ).toContainText('[1:5:1]')
    await expect(
      page.getByRole('button', { name: 'Next system' }),
    ).toBeDisabled()
    await page.getByLabel('Solar system').fill('1')
    await page.getByLabel('Solar system').press('Enter')
    await expect(
      page
        .getByRole('region', { name: 'Galaxy positions' })
        .getByRole('listitem')
        .first(),
    ).toContainText('[1:1:1]')
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await diagnosticScreenshot(page, {
      path: `test-results/missions-galaxy-${width}.png`,
      fullPage: true,
    })
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await go('Galaxy')
  await page
    .getByRole('region', { name: 'Galaxy positions' })
    .locator('summary')
    .first()
    .click()
  await page.getByRole('button', { name: 'Transport', exact: true }).click()
  await expect(page.locator('main h1')).toHaveText('Dispatch')
  await page
    .locator('fieldset label')
    .filter({ hasText: 'Small Cargo ·' })
    .locator('input')
    .fill('1')
  await page.getByLabel('Metal', { exact: true }).fill('10')
  let mismatched = false
  await page.route('**/api/v4/universes/*/world', async (route) => {
    if (route.request().postDataJSON().type === 'FleetQuote' && !mismatched) {
      const response = await route.fetch()
      if (response.status() === 200) {
        const data = await response.json()
        data.request_id = randomUUID()
        await route.fulfill({ response, json: data })
        mismatched = true
      } else await route.fulfill({ response })
    } else await route.continue()
  })
  await page.getByRole('button', { name: 'Review fleet' }).click()
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'Unable to confirm this fleet quote' }),
  ).toBeVisible()
  expect(mismatched).toBe(true)
  await expect(page.getByRole('region', { name: 'Fleet quote' })).toHaveCount(0)
  await expect(
    page
      .locator('fieldset label')
      .filter({ hasText: 'Small Cargo ·' })
      .locator('input'),
  ).toHaveValue('1')
  await page.unroute('**/api/v4/universes/*/world')
  await page.getByRole('button', { name: 'Review fleet' }).click()
  await expect(page.getByRole('region', { name: 'Fleet quote' })).toBeVisible()
  await diagnosticScreenshot(page, {
    path: 'test-results/missions-dispatch-mobile.png',
    fullPage: true,
  })
  let original: unknown
  await page.route('**/api/v4/universes/*/commands', async (route) => {
    const body = route.request().postDataJSON()
    if (body.gameplay?.command.action?.type === 'LaunchFleet') {
      await route.fetch()
      await route.abort('failed')
      original = body
    } else await route.continue()
  })
  await page.getByRole('button', { name: /^Transport to /, exact: false }).focus()
  await page.keyboard.press('Enter')
  await expect.poll(() => !!original).toBe(true)
  await page.unroute('**/api/v4/universes/*/commands')
  const bootstrapReload = await page.reload()
  const html = await bootstrapReload!.text()
  const boot = JSON.parse(
    html.match(
      /<script id="orbit-bootstrap" type="application\/json">([\s\S]*?)<\/script>/,
    )![1],
  )
  expect(boot.result.status).toBe('authenticated')
  expect(boot.result.game.status, boot.result.game.code).toBe('ready')
  await expect
    .poll(async () => (await snapshot())?.missions.fleets.length ?? -1)
    .toBe(1)
  const pair = original as {
    gameplay: { command_id: string }
    presence: { command_id: string }
  }
  const stored = await page.evaluate(
    (id) =>
      Object.entries(sessionStorage)
        .filter(([k]) => k.startsWith('orbit:attempts:v4:'))
        .map(([, v]) => JSON.parse(v))
        .find((x) => x.envelope.command_id === id)?.envelope,
    pair.gameplay.command_id,
  )
  expect(stored.presence).toEqual(pair.presence)
  expect(stored.command_id).toBe(pair.gameplay.command_id)
  expect(stored.presence.command_id).not.toBe(stored.command_id)
  await go('Fleets')
  await expect(page.getByRole('button', { name: 'Review recall' })).toBeVisible()
  let v = await freshSnapshot()
  advance(v.as_of_ms + 1000)
  await page.getByRole('button', { name: 'Review recall' }).click()
  await page.getByRole('button', { name: 'Recall fleet' }).click()
  await expect
    .poll(async () => ((await snapshot())?.missions.fleets ?? [])[0]?.leg)
    .toBe('Returning')
  v = await freshSnapshot()
  const returnAt = v.missions.fleets[0].due_at
  await go('Reports')
  await expect(
    page.getByRole('heading', { name: 'Mission history' }),
  ).toBeVisible()
  await expect(page.locator('main article a').first()).toHaveText('Recalled')
  advance(returnAt)
  await expect
    .poll(async () => (await snapshot())?.missions.fleets.length ?? -1)
    .toBe(0)
  await expect(page.locator('main article a').first()).toHaveText('Returned', {
    timeout: 15000,
  })
  await page
    .getByRole('link', { name: 'Espionage', exact: true })
    .first()
    .click()
  await expect(
    page.getByRole('region', { name: 'Report observation' }),
  ).toContainText('Counterespionage')
  const reportId = new URL(page.url()).pathname.split('/').at(-1)!
  const reportState = async () => {
    const current = await auth()
    const response = await page.request.post(
      `/api/v4/universes/${current.u}/reports/${reportId}`,
      {
        headers: current.headers,
        data: { binding: current.binding, request_id: randomUUID() },
      },
    )
    return response.status() === 503 ? null : response.json()
  }
  await expect
    .poll(async () => (await reportState())?.data.header.read)
    .toBe(true)
  await page.getByRole('button', { name: 'Archive report', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Move to inbox', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Move to inbox', exact: true }).click()
  await expect
    .poll(async () => (await reportState())?.data.header.hidden)
    .toBe(false)
  await expect(
    page.getByRole('button', { name: 'Archive report', exact: true }),
  ).toBeVisible()
  await diagnosticScreenshot(page, {
    path: 'test-results/missions-report-mobile.png',
    fullPage: true,
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await diagnosticScreenshot(page, {
    path: 'test-results/missions-report-desktop.png',
    fullPage: true,
  })
  const foreignReport = page.url()
  await signOut(page)
  await expect(page.getByLabel('Account', { exact: true })).toBeVisible()
  await signIn(1)
  const foreignView = await freshSnapshot()
  await page.goto(foreignReport)
  await expect(
    page.getByRole('heading', { name: 'Destination unavailable', exact: true }),
  ).toBeVisible()
  const lookup = new URL(foreignReport)
  lookup.searchParams.set('body', foreignView.bodies[0].id)
  await page.goto(lookup.toString())
  await expect(
    page.getByRole('alert').filter({ hasText: 'This report was not found or is not available to your account.' }),
  ).toBeVisible()
  for (let i = 2; i < 5; i++) {
    await signOut(page)
    await expect(page.getByLabel('Account', { exact: true })).toBeVisible()
    await signIn(i)
    const v = await snapshot()
    expect(v.bodies).toHaveLength(1)
    expect(v.bodies[0].inventories).toEqual([])
  }
  expect(a.binding.player).toBeTruthy()
})

test('paginated inbox remains usable after leaving a pending report detail', async ({
  page,
}) => {
  const accounts = JSON.parse(
    readFileSync(process.env.ORBIT_MVP_ACCOUNTS_FILE!, 'utf8'),
  ) as { name: string; password: string }[]
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/login')
  await page.getByLabel('Account', { exact: true }).fill(accounts[0].name)
  await page.getByLabel('Password').fill(accounts[0].password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.locator('main h1')).toHaveText(/^Empire —/)
  const cursor = randomUUID()
  let pageLoads = 0
  await page.route(/\/api\/v4\/universes\/[^/]+\/reports$/, async (route) => {
    const body = route.request().postDataJSON()
    const response = await route.fetch({ postData: { ...body, cursor: null } })
    if (response.status() !== 200) {
      await route.fulfill({ response })
      return
    }
    const data = await response.json()
    pageLoads++
    data.data.has_more = true
    data.data.next_cursor = cursor
    data.data.items = body.cursor ? [] : data.data.items.slice(0, 1)
    await route.fulfill({ response, json: data })
  })
  await navigate(page, 'Reports')
  await page.getByRole('button', { name: 'Load more reports' }).click()
  await expect.poll(() => pageLoads).toBeGreaterThan(1)
  await expect(
    page.getByRole('button', { name: 'Load more reports' }),
  ).toBeEnabled()
  let pending = false
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/v4/universes/*/reports/*', async (route) => {
    pending = true
    await held
    await route.continue()
  })
  await page.locator('main article a').first().click()
  await expect.poll(() => pending).toBe(true)
  await page.goBack()
  await expect(
    page.getByRole('button', { name: 'Load more reports' }),
  ).toBeEnabled()
  release()
  await page.unrouteAll({ behavior: 'wait' })
})
