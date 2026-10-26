import { setDestination, coordinatePattern } from './fixtures/coordinates'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { test, expect, type Page, type Route } from './fixtures/test'
import { shellFixture, body, binding, id } from './fixtures/game'
import { selectBody } from './fixtures/body-selector'
import type { components } from '../src/contracts'
import reportObservation from '../../../contracts/fixtures/espionage-expanded.json' with { type: 'json' }
type S = components['schemas']

async function setup(page: Page) {
  const colony = {
    ...body,
    id: id(6),
    coordinates: { galaxy: 1, system: 1, position: 2 },
  }
  await shellFixture(page, {
    protocol: 4,
    bodies: [
      {
        ...body,
        name: 'Aster Haven',
        inventories: [
          ...body.inventories,
          ...(['EspionageProbe', 'Recycler', 'ColonyShip'] as const).map(
            (id) => ({ item: { kind: 'Ship' as const, id }, count: '1' }),
          ),
        ],
      },
      { ...colony, name: 'Haven Colony' },
    ],
    playerNames: { [binding.player]: 'Commander' },
    research: [{ research: 'Astrophysics', level: 8 }],
    extraCapabilities: [
      'Attack',
      'Espionage',
      'Harvest',
      'Deploy',
      'Reports',
      'Colonize',
    ],
    catalog: [
      ...(['EspionageProbe', 'Recycler', 'ColonyShip'] as const).map((id) => ({
        key: { kind: 'Ship' as const, id },
        requirements: [],
        enabled: true,
        mobile: true,
        body_kinds: ['Planet' as const],
      })),
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
    destination: null as S['MissionDestination4'] | null,
    observationAvailable: true,
    duration: 100000,
    fuel: '1000000',
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
        player_names: { [id(30)]: 'Stargazer' },
        positions: Array.from({ length: 15 }, (_, i) => ({
          coordinates: {
            galaxy: query.galaxy,
            system: query.system,
            position: i + 1,
          },
          body:
            i === 0 && state.observationAvailable
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
        state.destination ??
        (query.selection.type === 'DebrisAt'
          ? {
              type: 'Debris',
              coordinates: query.selection.coordinates,
              field_identity: id(40),
            }
          : query.selection.type === 'EmptyPositionAt'
            ? {
                type: 'EmptyPosition',
                coordinates: query.selection.coordinates,
                slot_revision: '1',
              }
            : {
                type: 'Body',
                id: own ? colony.id : id(20),
                expected_kind: 'Planet',
                expected_owner: own ? binding.player : id(30),
              })
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
        duration_ms: (state.duration * 100) / query.intent.speed_percent,
        fuel: state.fuel,
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

async function prepareHistoricalDraft(page: Page) {
  const reportId = id(63)
  await page.route(`**/api/**/reports/${reportId}`, async (route) => {
    const request = route.request().postDataJSON()
    await route.fulfill({
      json: {
        protocol: 4,
        binding,
        request_id: request.request_id,
        viewer_revision: '1',
        sampled_at: Date.now(),
        as_of_ms: Date.now(),
        data: {
          header: {
            id: reportId,
            kind: 'Espionage',
            observed_at: 1000,
            read: true,
            hidden: false,
          },
          payload: {
            ...reportObservation,
            target: {
              ...reportObservation.target,
              body: id(20),
              owner: id(30),
              coordinates: { galaxy: 1, system: 1, position: 1 },
            },
          },
        },
      },
    })
  })
  await page.goto(`/u/andromeda/b/${body.id}/reports/${reportId}`)
  await page.getByRole('button', { name: 'Attack', exact: true }).click()
  await expect(mission(page)).toHaveValue('Attack')
  await expect(
    page.getByText('Prepared from an observation at', { exact: false }),
  ).toBeVisible()
  await page.getByLabel('Small Cargo · 2 available').fill('1')
}

for (const historical of [true, false]) {
  test(`owned-colony deploy launches with ${historical ? 'an edited historical draft' : 'manual coordinates'}`, async ({
    page,
  }) => {
    const state = await setup(page)
    state.launchError = null
    if (historical) await prepareHistoricalDraft(page)
    await mission(page).selectOption('Deploy')
    await setDestination(page, { position: '2' })
    await page.getByLabel('Metal', { exact: true }).fill('42')
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await review(page).click()
      const quote = page.getByRole('region', { name: 'Fleet quote' })
      await expect(quote).toBeVisible()
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
      await diagnosticScreenshot(page, {
        path: `test-results/deploy-${historical ? 'historical' : 'manual'}-${width}.png`,
        fullPage: true,
      })
      if (width === 390)
        await page.getByRole('button', { name: 'Edit mission' }).click()
    }
    const launch = page.waitForRequest('**/commands')
    await page
      .getByRole('button', {
        name: /^(Attack with|Spy with|Harvest with|Colonize with|Transport to|Deploy to) /,
      })
      .click()
    expect((await launch).postDataJSON().gameplay.command).toMatchObject({
      type: 'World',
      action: {
        type: 'LaunchFleet',
        intent: {
          mission: 'Deploy',
          origin: body.id,
          destination: {
            type: 'Body',
            id: id(6),
            expected_owner: binding.player,
            expected_kind: 'Planet',
          },
          cargo: { metal: '42000000', crystal: '0', deuterium: '0' },
        },
        expected_terms_hash: 'b'.repeat(64),
      },
    })
    await expect(page.getByLabel('Small Cargo · 2 available')).toHaveValue('0')
    expect(state.launches).toBe(1)
  })
}

for (const change of ['identity', 'owner'] as const) {
  test(`historical target ${change} changes still block review after editing away and back`, async ({
    page,
  }) => {
    const state = await setup(page)
    await prepareHistoricalDraft(page)
    await mission(page).selectOption('Transport')
    await setDestination(page, { position: '2' })
    await review(page).click()
    await expect(
      page.getByRole('region', { name: 'Fleet quote' }),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Edit mission' }).click()
    state.destination = {
      type: 'Body',
      id: change === 'identity' ? id(21) : id(20),
      expected_owner: change === 'owner' ? binding.player : id(30),
      expected_kind: 'Planet',
    }
    await setDestination(page, { position: '1' })
    await review(page).click()
    await expect(page.getByRole('alert')).toContainText(
      'The observed target has changed',
    )
    await expect(page.getByRole('region', { name: 'Fleet quote' })).toHaveCount(
      0,
    )
    expect(state.launches).toBe(0)
  })
}

test('a historical body draft can switch to harvesting at the same coordinates', async ({
  page,
}) => {
  await setup(page)
  await prepareHistoricalDraft(page)
  await mission(page).selectOption('Harvest')
  await review(page).click()
  await expect(page.getByRole('region', { name: 'Fleet quote' })).toBeVisible()
})

test('an edited historical deploy still reports authoritative quote rejection', async ({
  page,
}) => {
  const state = await setup(page)
  await prepareHistoricalDraft(page)
  await mission(page).selectOption('Deploy')
  await setDestination(page, { position: '2' })
  state.quoteError = 'InvalidInput'
  await review(page).click()
  await expect(page.getByRole('alert')).toContainText(
    'This mission is not valid.',
  )
  await expect(page.getByRole('region', { name: 'Fleet quote' })).toHaveCount(0)
  expect(state.launches).toBe(0)
})

test('successful dispatch resets ship and cargo quantities after preserving edits through review', async ({
  page,
}) => {
  const state = await setup(page)
  state.launchError = null
  const ship = page.getByLabel('Small Cargo · 2 available')
  const cargo = ['Metal', 'Crystal', 'Deuterium'].map((name) =>
    page.getByRole('textbox', { name, exact: true }),
  )
  for (const field of cargo) await field.fill('42')
  await review(page).click()
  await page.getByRole('button', { name: 'Edit mission' }).click()
  await expect(ship).toHaveValue('1')
  for (const field of cargo) await expect(field).toHaveValue('42')
  await review(page).click()
  await page
    .getByRole('button', {
      name: /^(Attack with|Spy with|Harvest with|Colonize with|Transport to|Deploy to) /,
    })
    .click()
  await expect(ship).toHaveValue('0')
  await expect(page.getByLabel('Light Fighter · 0 available')).toHaveValue('0')
  for (const field of cargo) await expect(field).toHaveValue('0')
  await expect(page.getByRole('region', { name: 'Flight timing' }).locator('p')).toHaveText(
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
  await page
    .getByRole('button', {
      name: /^(Attack with|Spy with|Harvest with|Colonize with|Transport to|Deploy to) /,
    })
    .click()
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
      await page
        .getByRole('button', {
          name: /^(Attack with|Spy with|Harvest with|Colonize with|Transport to|Deploy to) /,
        })
        .click()
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
  await page
    .getByRole('button', {
      name: /^(Attack with|Spy with|Harvest with|Colonize with|Transport to|Deploy to) /,
    })
    .click()
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
  await expect(timing.locator('dd').nth(0)).toHaveText('1m 40s')
  await ship.click()
  const initialShipPosition = (await ship.boundingBox())!.y
  await ship.press('Backspace')
  await expect(ship).toHaveValue('')
  await expect(timing.locator('dd')).toHaveText(['—', '—', '—', '—'])
  expect((await ship.boundingBox())!.y).toBe(initialShipPosition)
  await expect(timing.locator('p')).toHaveText('Select ships to see flight times.')
  await ship.fill('1')
  await expect(timing.locator('dd').nth(0)).toHaveText('1m 40s')
  await expect(timing.locator('dd').nth(2)).toHaveText('3m 20s')
  expect((await ship.boundingBox())!.y).toBe(initialShipPosition)
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
  await diagnosticScreenshot(page, {
    path: 'test-results/dispatch-flight-timing-390.png',
  })
})

for (const width of [320, 390, 1280]) {
  test(`dispatch groups speed, timing and fuel below cargo at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 950 })
    const state = await setup(page)
    const settings = page.getByRole('group', { name: 'Speed and flight estimates' })
    const speed = settings.getByRole('combobox', { name: 'Speed', exact: true })
    const timing = settings.getByRole('region', { name: 'Flight timing' })
    const fuel = timing.locator('div').filter({ has: page.locator('dt').getByText('Deuterium consumed', { exact: true }) })
    await expect(timing.locator('dt')).toHaveText(['To destination', 'Back at', 'Total flight', 'Deuterium consumed'])
    await expect(fuel.locator('dd')).toHaveText('1')
    await expect(fuel.getByRole('img', { name: 'Deuterium', exact: true })).toBeVisible()
    const cargoBox = (await page.getByRole('group', { name: 'Cargo', exact: true }).boundingBox())!
    const speedBox = (await speed.boundingBox())!
    const timingBox = (await timing.boundingBox())!
    expect(speedBox.y).toBeGreaterThanOrEqual(cargoBox.y + cargoBox.height)
    expect(timingBox.y).toBeGreaterThanOrEqual(speedBox.y + speedBox.height)
    expect((await review(page).boundingBox())!.y).toBeGreaterThanOrEqual(timingBox.y + timingBox.height)
    state.fuel = '250000000'
    await speed.selectOption('50')
    await expect(fuel.locator('dd')).toHaveText('250')
    await expect(timing.locator('dd').nth(0)).toHaveText('3m 20s')
    await mission(page).selectOption('Deploy')
    await setDestination(page, { position: '2' })
    await expect(timing.locator('dt')).toHaveText(['To destination', 'Total flight', 'Deuterium consumed'])
    await expect(timing.locator('time')).toHaveCount(0)
    await expect(timing.getByText('One-way', { exact: true })).toHaveCount(0)
    await expect(timing.locator('dd').nth(1)).toHaveText('3m 20s')
    await expect(fuel.locator('dd')).toHaveText('250')
    await diagnosticScreenshot(settings, { path: `test-results/dispatch-speed-fuel-${width}.png` })
    await page.getByLabel('Small Cargo · 2 available').fill('')
    await expect(timing.locator('dd')).toHaveText(['—', '—', '—'])
    await expect(timing.getByText('Back at', { exact: true })).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(state.launches).toBe(0)
  })
}

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
    page.getByRole('textbox', { name, exact: true }),
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
  await setDestination(page, { position: '3' })
  await expect(destination).toHaveCount(0)
  await setDestination(page, { position: '1' })
  await expect(destination).toBeVisible()
  await setDestination(page, { system: '2' })
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
    page.getByRole('textbox', { name, exact: true }),
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

test('pasting coordinates fills the unified field and preserves validation', async ({
  page,
}) => {
  await setup(page)
  const fields = ['Destination coordinates']
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
    await expect(
      page.getByLabel('Destination coordinates', { exact: true }),
    ).toHaveValue(coordinatePattern('galaxy', '1'))
    await expect(
      page.getByLabel('Destination coordinates', { exact: true }),
    ).toHaveValue(coordinatePattern('system', system))
    await expect(
      page.getByLabel('Destination coordinates', { exact: true }),
    ).toHaveValue(coordinatePattern('position', '10'))
    await expect(review(page)).toBeEnabled()
    // Unrecognized text retains the browser's ordinary paste behavior.
    expect(await paste('12')).toBe(true)
    expect(await paste('1:2:3:4')).toBe(true)
    expect(await paste('[1:500:16]')).toBe(false)
    await expect(
      page.getByLabel('Destination coordinates', { exact: true }),
    ).toHaveAttribute('aria-invalid', 'true')
    await expect(
      page.getByLabel('Destination coordinates', { exact: true }),
    ).toHaveAttribute('aria-invalid', 'true')
    await expect(review(page)).toBeDisabled()
  }
})

test('coordinate errors appear beside entry before review, including pasted emoji and ranges', async ({
  page,
}) => {
  const now = new Date('2026-10-25T12:00:00Z')
  await page.clock.install({ time: now })
  await page.clock.pauseAt(now)
  const state = await setup(page)
  const position = page.getByLabel('Destination coordinates', { exact: true })
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
    await setDestination(page, { position: value })
    await expect(position).toHaveAttribute('aria-invalid', 'true')
    await expect(position).toHaveAccessibleDescription(
      /position number from 1 to 15/,
    )
    await expect(review(page)).toBeDisabled()
    // Invalid coordinates must not request timing even after its debounce fires.
    await page.clock.runFor(1000)
    expect(state.resolves).toBe(0)
    expect(state.quotes).toBe(0)
  }
  // Keep this edit invalid throughout; a temporary valid position can resolve.
  await setDestination(page, { position: '1', system: '500' })
  await expect(
    page.getByLabel('Destination coordinates', { exact: true }),
  ).toHaveAccessibleDescription(/Enter a system number from 1 to 499./)
  await setDestination(page, { galaxy: '2' })
  await expect(
    page.getByLabel('Destination coordinates', { exact: true }),
  ).toHaveAccessibleDescription(/Enter a galaxy number from 1 to 1./)
  await setDestination(page, { position: '🏎️' })
  await page.clock.runFor(1000)
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
  await setDestination(page, { galaxy: '1' })
  await setDestination(page, { system: '499' })
  await setDestination(page, { position: '15' })
  await expect(review(page)).toBeEnabled()
  await expect(position).toHaveAttribute('aria-invalid', 'false')
  await page.clock.runFor(1000)
  await expect.poll(() => state.resolves).toBe(1)
  await expect.poll(() => state.quotes).toBe(1)
})

test('own-planet attack is actionable, while transport to another owned planet and own-position harvest stay available', async ({
  page,
}) => {
  const state = await setup(page)
  await setDestination(page, { position: '2' })
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
  await setDestination(page, { system: String(body.coordinates.system) })
  await setDestination(page, { position: String(body.coordinates.position) })
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
  await page
    .getByRole('button', {
      name: /^(Attack with|Spy with|Harvest with|Colonize with|Transport to|Deploy to) /,
    })
    .click()
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
  await setDestination(page, { system: '2' })
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
  await setDestination(page, { position: '3' })
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
  test(`dispatch uses one full-width coordinate field at ${width}px`, async ({
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
    const coordinate = group.getByLabel('Destination coordinates', {
      exact: true,
    })
    await expect(coordinate).toHaveCount(1)
    const fieldBox = (await coordinate.boundingBox())!
    expect(fieldBox.height).toBe(44)
    expect(fieldBox.width).toBeGreaterThan(width < 400 ? 180 : 250)
    const selectors = await group
      .locator('select')
      .evaluateAll((elements) =>
        elements.map((element) => element.getBoundingClientRect().height),
      )
    expect(selectors).toEqual([44, 44])
    const speed = page.getByRole('group', { name: 'Speed and flight estimates' })
      .getByRole('combobox', { name: 'Speed', exact: true })
    expect((await speed.boundingBox())!.height).toBe(44)
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
    await diagnosticScreenshot(page, {
      path: `test-results/dispatch-cargo-${width}.png`,
    })
    await mission(page).selectOption('Attack')
    await expect(
      page.getByText('Beginner protection can prevent attacks', {
        exact: false,
      }),
    ).toBeVisible()
    await expect(coordinate).toBeVisible()
  })
}

for (const kind of [
  'Attack',
  'Transport',
  'Deploy',
  'Espionage',
  'Harvest',
  'Colonize',
] as const) {
  test(`review clearly identifies ${kind}, its route and conditional return`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 1000 })
    const state = await setup(page)
    state.duration = 1172000
    const requiredShip = {
      Espionage: 'Espionage Probe',
      Harvest: 'Recycler',
      Colonize: 'Colony Ship',
    }[kind as 'Espionage' | 'Harvest' | 'Colonize']
    if (requiredShip) {
      await page.getByLabel('Small Cargo · 2 available').fill('0')
      await page.getByLabel(`${requiredShip} · 1 available`).fill('1')
    }
    await mission(page).selectOption(kind)
    if (kind === 'Deploy') await setDestination(page, { position: '2' })
    if (kind === 'Colonize') await setDestination(page, { position: '6' })
    if (['Attack', 'Transport', 'Espionage'].includes(kind))
      await expect(
        page.getByText('Destination: Ember Watch', { exact: false }),
      ).toBeVisible()
    await review(page).click()
    const quote = page.getByRole('region', { name: 'Fleet quote' })
    await expect(quote).toBeFocused()
    const heading = quote.getByRole('heading', { level: 2 })
    expect(
      await heading.evaluate((element) => {
        const box = element.getBoundingClientRect()
        const hit = document.elementFromPoint(
          box.x + box.width / 2,
          box.y + box.height / 2,
        )
        return element === hit || element.contains(hit)
      }),
    ).toBe(true)
    await expect(quote.getByRole('heading', { level: 2 })).toHaveText(
      `Review dispatch: ${kind}`,
    )
    await expect(quote).toContainText('Commander')
    await expect(quote).toContainText('19m 32s')
    await expect(quote).toContainText('Payload capacity 4,999 after fuel')
    await expect(quote.getByText('Fleet slots:', { exact: false })).toHaveCount(
      1,
    )
    await expect(page.getByText(/^Origin .*Fleet slots:/)).toHaveCount(0)
    const action = quote.getByRole('button', {
      name: /^(Attack with|Spy with|Harvest with|Colonize with|Transport to|Deploy to) /,
    })
    await expect(action).toBeEnabled()
    if (kind === 'Deploy') {
      await expect(quote).toContainText('No scheduled return')
      await expect(quote.locator('time')).toHaveCount(1)
    } else {
      await expect(quote.locator('time')).toHaveCount(2)
      const times = await quote
        .locator('time')
        .evaluateAll((elements) =>
          elements.map((e) => Date.parse(e.getAttribute('datetime')!)),
        )
      expect(times[1] - times[0]).toBe(1172000)
    }
    if (kind === 'Colonize') {
      await expect(quote).toContainText('Empty position')
      await expect(quote).toContainText('Return if needed')
      await expect(quote).toContainText('no return leg')
    }
    if (kind === 'Harvest') {
      await expect(quote).toContainText('Debris field')
      await expect(
        quote.getByRole('link', { name: /View destination/ }),
      ).toHaveAttribute('href', /target=debris/)
    }
    if (kind === 'Attack' || kind === 'Espionage')
      await expect(quote).toContainText('Return if surviving')
    if (['Attack', 'Transport', 'Espionage'].includes(kind)) {
      await expect(quote).toContainText('Ember Watch')
      await expect(quote).toContainText('Stargazer')
    }
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 1000 })
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width)
      await page.evaluate(() => window.scrollTo(0, 0))
      await diagnosticScreenshot(page, {
        path: `test-results/dispatch-review-${kind}-${width}.png`,
        fullPage: true,
      })
    }
    // Keyboard editing preserves the draft and returns focus to review.
    await quote.getByRole('button', { name: 'Edit mission' }).focus()
    await page.keyboard.press('Enter')
    await expect(review(page)).toBeFocused()
    await expect(page.getByLabel('Small Cargo · 2 available')).toHaveValue(
      requiredShip ? '0' : '1',
    )
    expect(state.launches).toBe(0)
  })
}

test('review retains honest unknown identities and keyboard coordinate actions', async ({
  page,
}) => {
  const state = await setup(page)
  state.observationAvailable = false
  await mission(page).selectOption('Attack')
  await setDestination(page, { system: '2' })
  await review(page).click()
  const quote = page.getByRole('region', { name: 'Fleet quote' })
  await expect(quote).toContainText('Unknown planet')
  await expect(quote).not.toContainText('Ember Watch')
  const actions = quote.getByRole('button', {
    name: 'Location actions for [1:2:1]',
  })
  await actions.focus()
  await page.keyboard.press('Enter')
  await expect(
    page.getByRole('menuitem', { name: 'Copy coordinates', exact: true }),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(actions).toBeFocused()
})

test('historical review tucks observation context into accessible flight details', async ({
  page,
}) => {
  await setup(page)
  await prepareHistoricalDraft(page)
  await review(page).click()
  const quote = page.getByRole('region', { name: 'Fleet quote' })
  const context = quote.getByText('Prepared from an observation at', {
    exact: false,
  })
  await expect(context).toBeHidden()
  await quote.locator('summary').focus()
  await page.keyboard.press('Enter')
  await expect(context).toBeVisible()
  await expect(context).toContainText('historical information')
})
