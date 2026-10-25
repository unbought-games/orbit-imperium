import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { test, expect, type Page, type Route } from './fixtures/test'
import { shellFixture, body, binding, id } from './fixtures/game'
import { selectBody } from './fixtures/body-selector'
import type { components } from '../src/contracts'
type S = components['schemas']

async function setup(page: Page) {
  const colony = {
    ...body,
    id: id(6),
    coordinates: { galaxy: 1, system: 1, position: 2 },
  }
  await shellFixture(page, {
    protocol: 4,
    bodies: [body, colony],
    extraCapabilities: ['Attack', 'Espionage', 'Harvest'],
    catalog: [
      {
        key: { kind: 'Ship', id: 'SmallCargo' },
        requirements: [],
        enabled: true,
        mobile: true,
        body_kinds: ['Planet'],
      },
      {
        key: { kind: 'Ship', id: 'LightFighter' },
        requirements: [],
        enabled: true,
        mobile: true,
        body_kinds: ['Planet'],
      },
    ],
  })
  const state = {
    blocker: null as S['GameError4'] | null,
    quoteError: null as S['GameError4'] | null,
    launchError: 'BeginnerProtected' as S['GameError4'] | null,
    resolves: 0,
    quotes: 0,
    launches: 0,
    hold: null as ((route: Route) => Promise<void>) | null,
  }
  await page.route('**/world', async (route) => {
    const query = route.request().postDataJSON()
    const observedBlocker = state.blocker
    if (state.hold) await state.hold(route)
    let data
    if (query.type === 'Galaxy') {
      data = {
        galaxy: query.galaxy,
        system: query.system,
        observed_at: 1000,
        positions: Array.from({ length: 15 }, (_, i) => ({
          coordinates: {
            galaxy: query.galaxy,
            system: query.system,
            position: i + 1,
          },
          body:
            i === 0
              ? {
                  id: id(20),
                  kind: 'Planet',
                  owner: id(30),
                  name: query.system === 1 ? 'Ember Watch' : 'Other Planet',
                  activity: { type: 'None' },
                  inactivity: 'Active',
                  vacation: false,
                  espionage_eligible: true,
                  attack_blocker: observedBlocker,
                }
              : null,
          debris: null,
        })),
      }
    } else if (query.type === 'ResolveDestination') {
      state.resolves++
      const own = query.selection.coordinates.position === 2
      data =
        query.selection.type === 'DebrisAt'
          ? {
              type: 'Debris',
              coordinates: query.selection.coordinates,
              field_identity: id(40),
            }
          : {
              type: 'Body',
              id: own ? colony.id : id(20),
              expected_kind: 'Planet',
              expected_owner: own ? binding.player : id(30),
            }
    } else {
      state.quotes++
      if (state.quoteError)
        return route.fulfill({
          status: 422,
          json: { code: 'GameRejected', game_code: state.quoteError },
        })
      data = {
        intent: query.intent,
        profile_hash: 'a'.repeat(64),
        distance: 1000,
        speeds: [],
        duration_ms: (100000 * 100) / query.intent.speed_percent,
        fuel: '1000000',
        capacity: '5000000000',
        maximum_payload: '4999000000',
        slot_limit: '1',
        terms_hash: 'b'.repeat(64),
      }
    }
    await route.fulfill({
      json: {
        protocol: 4,
        binding,
        request_id: query.context.request_id,
        viewer_revision: '1',
        sampled_at: Date.now(),
        as_of_ms: Date.now(),
        data,
      },
    })
  })
  await page.route('**/commands', async (route) => {
    const pair = route.request().postDataJSON()
    state.launches++
    await route.fulfill({
      json: {
        protocol: 4,
        binding,
        command_id: pair.gameplay.command_id,
        admitted_at: Date.now(),
        executed_at: Date.now(),
        ...(state.launchError
          ? { status: 'Rejected', code: state.launchError }
          : {
              status: 'Committed',
              result_ids: [id(80)],
              minimum_viewer_revision: '1',
            }),
      },
    })
  })
  await page.goto(`/u/andromeda/b/${body.id}/dispatch`)
  await expect(page.locator('main h1')).toHaveText('Dispatch')
  await expect(
    page.getByText('Latest departure order', { exact: true }),
  ).toHaveCount(0)
  await expect(page.getByText('Mission rules', { exact: true })).toHaveCount(0)
  await page.getByLabel('Small Cargo · 2 available').fill('1')
  return state
}

const review = (page: Page) =>
  page.getByRole('button', { name: 'Review fleet', exact: true })
const mission = (page: Page) =>
  page.getByRole('combobox', { name: 'Mission', exact: true })
const dispatchResult = (page: Page) =>
  page.getByRole('group', { name: 'Fleet dispatch result', exact: true })

test('successful dispatch resets ship and cargo quantities after preserving edits through review', async ({
  page,
}) => {
  const state = await setup(page)
  state.launchError = null
  const ship = page.getByLabel('Small Cargo · 2 available')
  const cargo = ['Metal', 'Crystal', 'Deuterium'].map((name) =>
    page.getByLabel(name, { exact: true }),
  )
  for (const field of cargo) await field.fill('42')
  await review(page).click()
  await page.getByRole('button', { name: 'Edit mission' }).click()
  await expect(ship).toHaveValue('1')
  for (const field of cargo) await expect(field).toHaveValue('42')
  await review(page).click()
  await page.getByRole('button', { name: /^Send / }).click()
  await expect(ship).toHaveValue('0')
  await expect(page.getByLabel('Light Fighter · 0 available')).toHaveValue('0')
  for (const field of cargo) await expect(field).toHaveValue('0')
  await expect(page.getByRole('region', { name: 'Flight timing' })).toHaveText(
    'Select ships to see flight times.',
  )
  expect(state.launches).toBe(1)
  await expect(dispatchResult(page)).toContainText('Transport to [1:1:1]')
  await expect(dispatchResult(page)).toContainText('Fleet sent.')
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await review(page).scrollIntoViewIfNeeded()
    await expect(dispatchResult(page)).toBeInViewport()
    const [resultBox, buttonBox] = await Promise.all([
      dispatchResult(page).boundingBox(),
      review(page).boundingBox(),
    ])
    expect(buttonBox!.y - (resultBox!.y + resultBox!.height)).toBeLessThan(32)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width)
    await diagnosticScreenshot(page, {
      path: `test-results/dispatch-success-${width}.png`,
    })
  }
  await selectBody(page, id(6))
  await expect(dispatchResult(page)).toHaveCount(0)
  await selectBody(page, body.id)
  await expect(dispatchResult(page)).toHaveCount(0)
})

test('editing a new draft clears the previous launch receipt', async ({
  page,
}) => {
  const state = await setup(page)
  state.launchError = null
  await review(page).click()
  await page.getByRole('button', { name: /^Send / }).click()
  await expect(dispatchResult(page)).toContainText('Fleet sent.')
  await page.getByLabel('Small Cargo · 2 available').fill('2')
  await expect(dispatchResult(page)).toHaveCount(0)
  await review(page).click()
  await expect(dispatchResult(page)).toHaveCount(0)
  await page.getByRole('button', { name: 'Edit mission' }).click()
  await expect(dispatchResult(page)).toHaveCount(0)
})

for (const outcome of ['Pending', 'Rejected', 'uncertain'] as const) {
  test(`dispatch shows submitting then ${outcome} without false success`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await setup(page)
    let commandId = ''
    let launches = 0
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const receipt = () => ({
      protocol: 4,
      binding,
      command_id: commandId,
      admitted_at: Date.now(),
      executed_at: outcome === 'Pending' ? null : Date.now(),
      status: outcome,
      ...(outcome === 'Rejected' ? { code: 'BeginnerProtected' } : {}),
    })
    await page.route('**/commands/*?epoch=*', (route) =>
      outcome === 'uncertain'
        ? route.fulfill({ status: 503, json: { code: 'Unavailable' } })
        : route.fulfill({ json: receipt() }),
    )
    await page.route('**/commands', async (route) => {
      launches++
      commandId = route.request().postDataJSON().gameplay.command_id
      await gate
      if (outcome === 'uncertain') return route.abort('failed')
      await route.fulfill({ json: receipt() })
    })
    await review(page).click()
    try {
      await page.getByRole('button', { name: /^Send / }).click()
      await expect(dispatchResult(page)).toContainText('Sending fleet order…')
      await expect(dispatchResult(page)).not.toContainText('Fleet sent.')
      await expect.poll(() => launches).toBe(1)
    } finally {
      release()
    }
    await expect(dispatchResult(page)).toContainText(
      outcome === 'Pending'
        ? 'Order accepted. Waiting for launch confirmation…'
        : outcome === 'Rejected'
          ? 'Fleet not sent: Beginner protection prevents'
          : 'Launch outcome unknown. Resolve the saved order before sending again.',
    )
    await expect(dispatchResult(page)).not.toContainText('Fleet sent.')
    await expect(page.getByLabel(/Small Cargo · \d+ available/)).toHaveValue(
      '1',
    )
    await review(page).scrollIntoViewIfNeeded()
    await diagnosticScreenshot(page, {
      path: `test-results/dispatch-${outcome}.png`,
    })
    if (outcome === 'uncertain') {
      await page.route('**/commands/*?epoch=*', (route) =>
        route.fulfill({
          json: {
            protocol: 4,
            binding,
            command_id: commandId,
            admitted_at: Date.now(),
            executed_at: Date.now(),
            status: 'Committed',
            result_ids: [id(80)],
            minimum_viewer_revision: '1',
          },
        }),
      )
      await dispatchResult(page)
        .getByRole('button', { name: 'Resolve fleet order' })
        .click()
      await expect(dispatchResult(page)).toContainText('Fleet sent.')
      await expect(page.getByLabel('Small Cargo · 2 available')).toHaveValue(
        '0',
      )
    }
    expect(launches).toBe(1)
  })
}

test('a delayed successful launch does not erase edits for the next fleet', async ({
  page,
}) => {
  const state = await setup(page)
  state.launchError = null
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/commands', async (route) => {
    await gate
    await route.fallback()
  })
  await review(page).click()
  await page.getByRole('button', { name: /^Send / }).click()
  await expect(dispatchResult(page)).toContainText('Sending fleet order…')
  const ship = page.getByLabel(/Small Cargo · \d+ available/)
  await ship.fill('2')
  await page.getByLabel('Metal', { exact: true }).fill('42')
  const response = page.waitForResponse('**/commands')
  release()
  await response
  await expect(
    page.getByRole('status').filter({ hasText: 'Launch Fleet:' }),
  ).toContainText('Action confirmed.')
  await expect(ship).toHaveValue('2')
  await expect(page.getByLabel('Metal', { exact: true })).toHaveValue('42')
  await expect(dispatchResult(page)).toHaveCount(0)
  expect(state.launches).toBe(1)
})

test('flight timing updates with speed and selected ships without opening review or sending fleets', async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date())
  await page.setViewportSize({ width: 390, height: 844 })
  const state = await setup(page)
  const timing = page.getByRole('region', { name: 'Flight timing' })
  const ship = page.getByLabel('Small Cargo · 2 available')
  await ship.fill('')
  await expect(timing).toHaveText('Select ships to see flight times.')
  await ship.fill('1')
  await expect(timing.locator('dd').nth(0)).toHaveText('1m 40s')
  await expect(timing.locator('dd').nth(2)).toHaveText('3m 20s')
  const firstReturn = Date.parse(
    (await timing.locator('time').getAttribute('datetime'))!,
  )
  const started = await page.evaluate(() => performance.now())
  await page.getByLabel('Speed', { exact: true }).selectOption('50')
  await expect(timing.locator('dd').nth(0)).toHaveText('3m 20s')
  await expect(timing.locator('dd').nth(2)).toHaveText('6m 40s')
  const slowerReturn = Date.parse(
    (await timing.locator('time').getAttribute('datetime'))!,
  )
  // The game's monotonic clock keeps advancing while the estimate is fetched.
  const elapsed = (await page.evaluate(() => performance.now())) - started
  expect(slowerReturn - firstReturn).toBeGreaterThanOrEqual(200000)
  expect(slowerReturn - firstReturn).toBeLessThanOrEqual(200000 + elapsed + 500)
  const request = page.waitForRequest(
    (request) =>
      request.url().endsWith('/world') &&
      request.postDataJSON().type === 'FleetQuote' &&
      request.postDataJSON().intent.ships[0]?.count === '2',
  )
  await ship.fill('2')
  expect((await request).postDataJSON().intent.speed_percent).toBe(50)
  await expect(timing.locator('dd').nth(0)).toHaveText('3m 20s')
  await expect(page.getByRole('region', { name: 'Fleet quote' })).toHaveCount(0)
  expect(state.launches).toBe(0)
  await diagnosticScreenshot(page, { path: 'test-results/dispatch-flight-timing-390.png' })
})

test('late timing replies cannot replace a newer speed and failed estimates clear obsolete times', async ({
  page,
}) => {
  const state = await setup(page)
  const timing = page.getByRole('region', { name: 'Flight timing' })
  await expect(timing.locator('dd').nth(0)).toHaveText('1m 40s')
  let release!: () => void
  let held = false
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  state.hold = async (route) => {
    const query = route.request().postDataJSON()
    if (query.type === 'FleetQuote' && query.intent.speed_percent === 50) {
      held = true
      await gate
    }
  }
  await page.getByLabel('Speed', { exact: true }).selectOption('50')
  await expect.poll(() => held).toBe(true)
  await page.getByLabel('Speed', { exact: true }).selectOption('20')
  await expect(timing.locator('dd').nth(0)).toHaveText('8m 20s')
  const response = page.waitForResponse(
    (response) =>
      response.url().endsWith('/world') &&
      response.request().postDataJSON().type === 'FleetQuote' &&
      response.request().postDataJSON().intent.speed_percent === 50,
  )
  release()
  await response
  await expect(timing.locator('dd').nth(0)).toHaveText('8m 20s')
  state.quoteError = 'TargetVacation'
  await page.getByLabel('Speed', { exact: true }).selectOption('10')
  await expect(timing).toContainText('vacation mode')
  await expect(timing.locator('time')).toHaveCount(0)
  expect(state.launches).toBe(0)
})

test('Add all fills the fleet capacity without opening review or consuming fuel reserves', async ({
  page,
}) => {
  const state = await setup(page)
  const fields = ['Metal', 'Crystal', 'Deuterium'].map((name) =>
    page.getByLabel(name, { exact: true }),
  )
  await fields[0].fill('invalid')
  await page.getByRole('button', { name: 'Add all', exact: true }).click()
  await expect(fields[0]).toHaveValue(/^\d+$/)
  const amounts = await Promise.all(
    fields.map(async (field) => BigInt(await field.inputValue())),
  )
  expect(amounts.reduce((sum, amount) => sum + amount, 0n)).toBe(4999n)
  expect(amounts[0]).toBeLessThanOrEqual(BigInt(body.amounts.metal) / 1000000n)
  expect(amounts[1]).toBeLessThanOrEqual(
    BigInt(body.amounts.crystal) / 1000000n,
  )
  expect(amounts[2] * 1000000n + 1000000n).toBeLessThanOrEqual(
    BigInt(body.amounts.deuterium),
  )
  await expect(page.getByRole('region', { name: 'Fleet quote' })).toHaveCount(0)
  expect(state.launches).toBe(0)
  await review(page).click()
  await expect(page.getByRole('region', { name: 'Fleet quote' })).toBeVisible()
})

test('an edited cargo amount wins over a delayed Add all response', async ({
  page,
}) => {
  const state = await setup(page)
  let release!: () => void
  let held = false
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  state.hold = async (route) => {
    if (route.request().postDataJSON().type === 'FleetQuote') {
      held = true
      await gate
    }
  }
  await page.getByRole('button', { name: 'Add all', exact: true }).click()
  await expect.poll(() => held).toBe(true)
  await page.getByLabel('Metal', { exact: true }).fill('42')
  const response = page.waitForResponse(
    (response) =>
      response.url().endsWith('/world') &&
      response.request().postDataJSON().type === 'FleetQuote',
  )
  release()
  await response
  await expect(page.getByLabel('Metal', { exact: true })).toHaveValue('42')
  await expect(page.getByLabel('Crystal', { exact: true })).toHaveValue('0')
  await expect(page.getByRole('region', { name: 'Fleet quote' })).toHaveCount(0)
})

test('mission changes keep the same destination visible during refresh but never reuse it for other coordinates', async ({
  page,
}) => {
  const state = await setup(page)
  const destination = page.getByText('Destination: Ember Watch', {
    exact: false,
  })
  await expect(destination).toBeVisible()
  for (const next of ['Attack', 'Espionage', 'Transport']) {
    let release!: () => void
    let held = false
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    state.hold = async (route) => {
      if (route.request().postDataJSON().type === 'Galaxy') {
        held = true
        await gate
      }
    }
    await mission(page).selectOption(next)
    await expect.poll(() => held).toBe(true)
    await expect(destination).toBeVisible()
    const refreshed = page.waitForResponse(
      (response) =>
        response.url().endsWith('/world') &&
        response.request().postDataJSON().type === 'Galaxy',
    )
    release()
    await refreshed
    await expect(destination).toBeVisible()
  }
  state.hold = null
  await page.getByLabel('Position', { exact: true }).fill('3')
  await expect(destination).toHaveCount(0)
  await page.getByLabel('Position', { exact: true }).fill('1')
  await expect(destination).toBeVisible()
  await page.getByLabel('System', { exact: true }).fill('2')
  await expect(destination).toHaveCount(0)
  await expect(
    page.getByText('Destination: Other Planet', { exact: false }),
  ).toBeVisible()
})

test('cleared ship and cargo amounts display zero and submit as zero even before blur', async ({
  page,
}) => {
  await setup(page)
  const cargoFields = ['Metal', 'Crystal', 'Deuterium'].map((name) =>
    page.getByLabel(name, { exact: true }),
  )
  const unusedShip = page.getByLabel('Light Fighter · 0 available')
  for (const field of [...cargoFields, unusedShip]) {
    await field.fill('')
    await field.blur()
    await expect(field).toHaveValue('0')
  }
  for (const field of [unusedShip, ...cargoFields]) {
    await field.fill('')
    const request = page.waitForRequest(
      (request) =>
        request.url().endsWith('/world') &&
        request.postDataJSON().type === 'FleetQuote',
    )
    // Submitting with the keyboard need not blur the current empty input.
    await field.press('Enter')
    const intent = (await request).postDataJSON().intent
    expect(intent.cargo).toEqual({ metal: '0', crystal: '0', deuterium: '0' })
    expect(intent.ships).toEqual([
      { owner: binding.player, ship_type: 'SmallCargo', count: '1' },
    ])
    await expect(
      page.getByRole('region', { name: 'Fleet quote' }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Edit mission' }).click()
  }
})

test('pasting coordinates into any destination field fills all three and preserves validation', async ({
  page,
}) => {
  await setup(page)
  const fields = ['Galaxy', 'System', 'Position']
  for (const [index, field] of fields.entries()) {
    const system = String(370 + index)
    const input = page.getByLabel(field, { exact: true })
    const paste = async (text: string) =>
      input.evaluate((element, value) => {
        const clipboardData = new DataTransfer()
        clipboardData.setData('text/plain', value)
        return element.dispatchEvent(
          new ClipboardEvent('paste', {
            clipboardData,
            bubbles: true,
            cancelable: true,
          }),
        )
      }, text)
    expect(await paste(` \n [ 1 : ${system} : 10 ] \t`)).toBe(false)
    await expect(page.getByLabel('Galaxy', { exact: true })).toHaveValue('1')
    await expect(page.getByLabel('System', { exact: true })).toHaveValue(system)
    await expect(page.getByLabel('Position', { exact: true })).toHaveValue('10')
    await expect(review(page)).toBeEnabled()
    // Unrecognized text retains the browser's ordinary paste behavior.
    expect(await paste('12')).toBe(true)
    expect(await paste('1:2:3:4')).toBe(true)
    expect(await paste('[1:500:16]')).toBe(false)
    await expect(page.getByLabel('System', { exact: true })).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    await expect(page.getByLabel('Position', { exact: true })).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    await expect(review(page)).toBeDisabled()
  }
})

test('coordinate errors appear beside entry before review, including pasted emoji and ranges', async ({
  page,
}) => {
  const state = await setup(page)
  const position = page.getByLabel('Position', { exact: true })
  for (const value of [
    '🏎️',
    '1🏎️',
    '1.5',
    '1e1',
    '0',
    '-1',
    '16',
    '9007199254740993',
    '',
  ]) {
    await position.fill(value)
    await expect(position).toHaveAttribute('aria-invalid', 'true')
    await expect(position).toHaveAccessibleDescription(
      /position number from 1 to 15/,
    )
    await expect(review(page)).toBeDisabled()
  }
  await position.fill('1')
  await page.getByLabel('System', { exact: true }).fill('500')
  await expect(
    page.getByLabel('System', { exact: true }),
  ).toHaveAccessibleDescription('Enter a system number from 1 to 499.')
  await page.getByLabel('Galaxy', { exact: true }).fill('2')
  await expect(
    page.getByLabel('Galaxy', { exact: true }),
  ).toHaveAccessibleDescription('Enter a galaxy number from 1 to 1.')
  await position.fill('🏎️')
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await diagnosticScreenshot(page, {
      path: `test-results/dispatch-validation-${width}.png`,
      fullPage: true,
    })
  }
  expect(state.resolves).toBe(0)
  expect(state.quotes).toBe(0)
  await page.getByLabel('Galaxy', { exact: true }).fill('1')
  await page.getByLabel('System', { exact: true }).fill('499')
  await position.fill('15')
  await expect(review(page)).toBeEnabled()
  await expect(position).toHaveAttribute('aria-invalid', 'false')
})

test('own-planet attack is actionable, while transport to another owned planet and own-position harvest stay available', async ({
  page,
}) => {
  const state = await setup(page)
  await page.getByLabel('Position', { exact: true }).fill('2')
  await mission(page).selectOption('Attack')
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'You cannot attack your own planet' }),
  ).toContainText('use Transport')
  await expect(review(page)).toBeDisabled()
  expect(state.quotes).toBe(0)
  await mission(page).selectOption('Transport')
  await review(page).click()
  await expect(page.getByRole('region', { name: 'Fleet quote' })).toBeVisible()
  await page.getByRole('button', { name: 'Edit mission' }).click()
  await mission(page).selectOption('Harvest')
  await page
    .getByLabel('System', { exact: true })
    .fill(String(body.coordinates.system))
  await page
    .getByLabel('Position', { exact: true })
    .fill(String(body.coordinates.position))
  await expect(review(page)).toBeEnabled()
  await review(page).click()
  await expect(page.getByRole('region', { name: 'Fleet quote' })).toBeVisible()
})

test('protection is explained before review, rechecked at review, and launch races have readable receipts', async ({
  page,
}) => {
  const state = await setup(page)
  state.blocker = 'BeginnerProtected'
  await mission(page).selectOption('Attack')
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Beginner protection prevents' }),
  ).toBeVisible()
  // Timing now requests read-only quotes before the explicit review step.
  expect(state.launches).toBe(0)
  await expect(page.getByRole('region', { name: 'Fleet quote' })).toHaveCount(0)
  await page.setViewportSize({ width: 390, height: 900 })
  await diagnosticScreenshot(page, {
    path: 'test-results/dispatch-protection-mobile.png',
    fullPage: true,
  })
  state.quoteError = 'BeginnerProtected'
  await review(page).click()
  await expect(
    page.getByRole('alert').filter({ hasText: 'Beginner protection prevents' }),
  ).toBeVisible()
  await expect(page.getByRole('region', { name: 'Fleet quote' })).toHaveCount(0)
  // The observation is advisory: a newer valid quote can supersede a stale blocker.
  state.quoteError = null
  await page.getByLabel('Metal', { exact: true }).fill('42')
  await review(page).click()
  await expect(page.getByRole('region', { name: 'Fleet quote' })).toBeVisible()
  await page.getByRole('button', { name: /^Send / }).click()
  await expect(
    page.getByRole('complementary', { name: 'Action needs attention' }),
  ).toContainText('Fleet not sent: Beginner protection prevents')
  expect(state.launches).toBe(1)
  await expect(page.getByLabel('Small Cargo · 2 available')).toHaveValue('1')
  await expect(page.getByLabel('Metal', { exact: true })).toHaveValue('42')
})

test('fresh destination ownership is checked even when it was not in the owned-planet view', async ({
  page,
}) => {
  await setup(page)
  await mission(page).selectOption('Attack')
  await page.route('**/world', async (route) => {
    const q = route.request().postDataJSON()
    if (q.type !== 'ResolveDestination') return route.fallback()
    await route.fulfill({
      json: {
        protocol: 4,
        binding,
        request_id: q.context.request_id,
        viewer_revision: '1',
        sampled_at: Date.now(),
        as_of_ms: Date.now(),
        data: {
          type: 'Body',
          id: id(20),
          expected_kind: 'Planet',
          expected_owner: binding.player,
        },
      },
    })
  })
  await review(page).click()
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'You cannot attack your own planet' }),
  ).toBeVisible()
  await expect(page.getByRole('region', { name: 'Fleet quote' })).toHaveCount(0)
})

test('late eligibility and quote failures cannot overwrite an edited destination', async ({
  page,
}) => {
  const state = await setup(page)
  let release!: () => void
  let held = false
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  state.blocker = 'BeginnerProtected'
  state.hold = async (route) => {
    const q = route.request().postDataJSON()
    if (q.type === 'Galaxy' && q.system === 1) {
      held = true
      await gate
    }
  }
  await mission(page).selectOption('Attack')
  await expect.poll(() => held).toBe(true)
  await page.getByLabel('System', { exact: true }).fill('2')
  const lateObservation = page.waitForResponse(
    (r) =>
      r.url().endsWith('/world') &&
      r.request().postDataJSON().type === 'Galaxy' &&
      r.request().postDataJSON().system === 1,
  )
  release()
  state.blocker = null
  await lateObservation
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Beginner protection prevents' }),
  ).toHaveCount(0)
  let releaseQuote!: () => void
  let quoteHeld = false
  const quoteGate = new Promise<void>((resolve) => {
    releaseQuote = resolve
  })
  state.quoteError = 'TargetVacation'
  state.hold = async (route) => {
    if (route.request().postDataJSON().type === 'FleetQuote') {
      quoteHeld = true
      await quoteGate
    }
  }
  await review(page).click()
  await expect.poll(() => quoteHeld).toBe(true)
  await page.getByLabel('Position', { exact: true }).fill('3')
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith('/world') &&
      r.request().postDataJSON().type === 'FleetQuote',
  )
  releaseQuote()
  await response
  await expect(review(page)).toBeEnabled()
  await expect(
    page.getByRole('alert').filter({ hasText: 'vacation mode' }),
  ).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Fleet quote' })).toHaveCount(0)
})

for (const width of [320, 390, 1280]) {
  test(`dispatch destination stays in four compact boxes at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await setup(page)
    const group = page.getByRole('group', {
      name: 'Mission and destination',
      exact: true,
    })
    await expect(
      page.getByRole('region', { name: 'Flight timing' }).locator('time'),
    ).toBeVisible()
    await expect(
      page.getByText('Destination: Ember Watch', { exact: false }),
    ).toBeVisible()
    // Take each row's geometry in one frame so asynchronous content above it
    // cannot move the page between measurements of its individual controls.
    const boxes = await group.locator('input, select').evaluateAll((elements) =>
      elements.slice(0, 4).map((element) => {
        const { y, width, height } = element.getBoundingClientRect()
        return { y, width, height }
      }),
    )
    expect(boxes).toHaveLength(4)
    const first = boxes[0]!
    for (const box of boxes) {
      expect(box!.y).toBe(first.y)
      expect(box!.height).toBe(44)
      expect(box!.width).toBeLessThanOrEqual(150)
    }
    // The compact inputs now include a live flight timing summary below Speed.
    expect((await group.boundingBox())!.height).toBeLessThan(230)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width)
    await diagnosticScreenshot(page, {
      path: `test-results/dispatch-compact-${width}.png`,
    })
    const cargo = page.getByRole('group', { name: 'Cargo', exact: true })
    const cargoBoxes = await cargo
      .locator('input, button')
      .evaluateAll((elements) =>
        elements.map((element) => {
          const { y, height } = element.getBoundingClientRect()
          return { y, height }
        }),
      )
    expect(cargoBoxes).toHaveLength(4)
    for (const box of cargoBoxes) {
      expect(box!.y).toBe(cargoBoxes[0]!.y)
      expect(box!.height).toBe(44)
    }
    expect((await cargo.boundingBox())!.height).toBeLessThanOrEqual(75)
    const colors = await cargo
      .locator('svg[data-resource]')
      .evaluateAll((icons) => icons.map((icon) => getComputedStyle(icon).color))
    expect(new Set(colors).size).toBe(3)
    await cargo.scrollIntoViewIfNeeded()
    await diagnosticScreenshot(page, { path: `test-results/dispatch-cargo-${width}.png` })
    await mission(page).selectOption('Attack')
    await expect(
      page.getByText('Beginner protection can prevent attacks', {
        exact: false,
      }),
    ).toBeVisible()
    const position = (await page
      .getByLabel('Position', { exact: true })
      .boundingBox())!
    expect(position.y).toBe((await mission(page).boundingBox())!.y)
  })
}
