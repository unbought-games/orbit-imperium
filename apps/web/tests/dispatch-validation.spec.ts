import { setDestination, coordinatePattern } from './fixtures/coordinates'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { test, expect, type Page, type Route } from './fixtures/test'
import { shellFixture, refreshGame, body, binding, id } from './fixtures/game'
import { selectBody } from './fixtures/body-selector'
import type { components } from '../src/contracts'
import reportObservation from '../../../contracts/fixtures/espionage-expanded.json' with { type: 'json' }
type S = components['schemas']

test('destination focus glow is desktop only', async ({ page }) => {
  await setup(page)
  const input = page.getByLabel('Destination coordinates', { exact: true })
  const preview = page.getByLabel('Destination preview')
  for (const width of [767, 768, 390]) {
    await page.setViewportSize({ width, height: 844 })
    await input.focus()
    await expect(input).toBeFocused()
    await expect(preview).toHaveCSS('border-color', width < 768 ? 'rgba(138, 157, 157, 0.4)' : 'rgb(154, 207, 230)')
    await expect(preview).toHaveCSS('box-shadow', width < 768 ? 'none' : 'rgba(154, 207, 230, 0.157) 0px 0px 0px 2px')
    await expect(input.locator('..')).toHaveCSS('outline-style', 'none')
  }
})

async function setup(page: Page) {
  const colony = {
    ...body,
    id: id(6),
    coordinates: { galaxy: 1, system: 1, position: 2 },
  }
  const bodies = [
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
    ]
  let revision = 1
  await shellFixture(page, {
    viewerRevision: () => String(revision),
    protocol: 4,
    bodies,
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
    bodies,
    ownedObservation: false,
    advanceRevision: () => { revision++ },
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
            i === 1 && state.ownedObservation
              ? { id: colony.id, kind: 'Planet', owner: binding.player, name: 'Haven Colony', activity: { type: 'None' }, inactivity: 'Active', vacation: false, espionage_eligible: false, attack_blocker: null }
              : i === 0 && state.observationAvailable
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

async function selectDestinationPlanet(page: Page, id: string) {
  const picker = page.getByRole('combobox', { name: 'Your other planets' })
  await picker.click()
  await page.getByRole('option').and(page.locator(`[data-value="${id}"]`)).click()
  await expect(picker).toHaveAttribute('data-value', id)
  await expect(page.getByRole('listbox')).toHaveCount(0)
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
    await page.getByRole('textbox', { name: 'Metal', exact: true }).fill('42')
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
  await page.getByRole('textbox', { name: 'Metal', exact: true }).fill('42')
  const response = page.waitForResponse('**/commands')
  release()
  await response
  await expect(
    page.getByRole('status').filter({ hasText: 'Launch Fleet:' }),
  ).toContainText('Action confirmed.')
  await expect(ship).toHaveValue('2')
  await expect(page.getByRole('textbox', { name: 'Metal', exact: true })).toHaveValue('42')
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
  await page.getByRole('button', { name: 'Add all', exact: true }).click()
  await expect(fields[0]).toHaveValue('1667')
  await expect(fields[1]).toHaveValue('1666')
  await expect(fields[2]).toHaveValue('1666')
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

for (const action of ['Add all', 'Max deuterium']) {
  test(`an edited cargo amount wins over a delayed ${action} response`, async ({
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
    await page.getByRole('button', { name: action, exact: true }).click()
    await expect.poll(() => held).toBe(true)
    await page.getByRole('textbox', { name: 'Metal', exact: true }).fill('42')
    const response = page.waitForResponse(
      (response) =>
        response.url().endsWith('/world') &&
        response.request().postDataJSON().type === 'FleetQuote',
    )
    release()
    await response
    await expect(page.getByRole('textbox', { name: 'Metal', exact: true })).toHaveValue('42')
    await expect(page.getByRole('textbox', { name: 'Crystal', exact: true })).toHaveValue('0')
    await expect(page.getByRole('textbox', { name: 'Deuterium', exact: true })).toHaveValue('0')
    await expect(page.getByRole('region', { name: 'Fleet quote' })).toHaveCount(
      0,
    )
  })
}

test('max deuterium keeps other cargo and Add all evenly fills the remaining space', async ({
  page,
}) => {
  const state = await setup(page)
  const metal = page.getByRole('textbox', { name: 'Metal', exact: true })
  const crystal = page.getByRole('textbox', { name: 'Crystal', exact: true })
  const deuterium = page.getByRole('textbox', { name: 'Deuterium', exact: true })
  await metal.fill('100')
  await page.getByRole('button', { name: 'Max deuterium', exact: true }).click()
  const fuelReserved = BigInt(body.amounts.deuterium) / 1000000n - 1n
  await expect(deuterium).toHaveValue(String(fuelReserved))
  await expect(metal).toHaveValue('100')
  await expect(crystal).toHaveValue('0')
  await page.getByRole('button', { name: 'Add all', exact: true }).click()
  const remaining = 4999n - fuelReserved - 100n
  await expect(metal).toHaveValue(String(100n + (remaining + 1n) / 2n))
  await expect(crystal).toHaveValue(String(remaining / 2n))
  await expect(deuterium).toHaveValue(String(fuelReserved))
  await expect(page.getByRole('region', { name: 'Fleet quote' })).toHaveCount(0)
  expect(state.launches).toBe(0)
  await diagnosticScreenshot(page, {
    path: 'test-results/dispatch-cargo-max.png',
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page
    .getByRole('group', { name: 'Cargo', exact: true })
    .scrollIntoViewIfNeeded()
  await diagnosticScreenshot(page, {
    path: 'test-results/dispatch-cargo-max-390.png',
  })
})

test('Add all leaves invalid cargo untouched and explains the problem', async ({
  page,
}) => {
  await setup(page)
  const metal = page.getByRole('textbox', { name: 'Metal', exact: true })
  await metal.fill('invalid')
  await page.getByRole('button', { name: 'Add all', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('whole nonnegative')
  await expect(metal).toHaveValue('invalid')
  await expect(page.getByRole('textbox', { name: 'Crystal', exact: true })).toHaveValue('0')
})

test('mission changes preserve the observed destination and coordinate edits never reuse another target', async ({ page }) => {
  await setup(page)
  const preview = page.getByLabel('Destination preview')
  await expect(preview).toContainText('Ember Watch')
  for (const next of ['Attack', 'Espionage', 'Transport']) {
    await mission(page).selectOption(next)
    await expect(preview).toContainText('Ember Watch')
  }
  await setDestination(page, { position: '3' })
  await expect(preview).toContainText('Empty position')
  await expect(preview).not.toContainText('Ember Watch')
  await setDestination(page, { position: '1' })
  await expect(preview).toContainText('Ember Watch')
  await setDestination(page, { system: '2' })
  await expect(preview).not.toContainText('Ember Watch')
  await expect(preview).toContainText('Other Planet')
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
  const now = new Date('2026-10-26T12:00:00Z')
  await page.clock.install({ time: now })
  await page.clock.pauseAt(now)
  const state = await setup(page)
  await setDestination(page, { position: '2' })
  await mission(page).selectOption('Attack')
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'You cannot attack your own planet' }),
  ).toContainText('use Transport')
  await expect(review(page)).toBeDisabled()
  // Advance beyond the timing debounce only after the invalid attack is selected.
  await page.clock.runFor(1000)
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
  await expect(page.getByLabel('Destination preview')).toContainText('Ember Watch')
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
  await page.getByRole('textbox', { name: 'Metal', exact: true }).fill('42')
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
  await expect(page.getByRole('textbox', { name: 'Metal', exact: true })).toHaveValue('42')
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
  await expect(page.getByLabel('Destination preview')).toContainText('Ember Watch')
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
  test(`dispatch keeps coordinate editing inside one compact field at ${width}px`, async ({
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
      page.getByLabel('Destination preview').getByText('Ember Watch', { exact: true }),
    ).toBeVisible()
    const coordinate = group.getByLabel('Destination coordinates', {
      exact: true,
    })
    await expect(coordinate).toHaveCount(1)
    const fieldBox = (await coordinate.boundingBox())!
    expect(fieldBox.height).toBe(36)
    expect(fieldBox.width).toBeGreaterThan(width < 400 ? 130 : 250)
    const selectors = await group
      .locator('select')
      .evaluateAll((elements) =>
        elements.map((element) => element.getBoundingClientRect().height),
      )
    expect(selectors).toEqual([44])
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
      .locator('input, button:not([aria-label])')
      .evaluateAll((elements) =>
        elements.map((element) => {
          const { x, y, width, height } = element.getBoundingClientRect()
          return { x, y, width, height }
        }),
      )
    expect(cargoBoxes).toHaveLength(4)
    const wideCargo = (await cargo.boundingBox())!.width >= 520
    for (const [i, box] of cargoBoxes.entries()) {
      expect(box.y).toBe(cargoBoxes[0].y + (wideCargo ? 0 : i * 52))
      expect(box.height).toBe(44)
    }
    expect((await cargo.boundingBox())!.height).toBeLessThanOrEqual(wideCargo ? 75 : 231)
    const maxButtons = cargo.getByRole('button', { name: /^Max / })
    await expect(maxButtons).toHaveCount(3)
    for (let i = 0; i < 3; i++) {
      const button = (await maxButtons.nth(i).boundingBox())!
      const input = cargoBoxes[i]
      expect(button.x + button.width).toBe(input.x + input.width - 4)
      expect(button.y).toBe(input.y + 4)
      expect(button.height).toBe(36)
      expect(input.width - button.width - 36).toBeGreaterThan(60)
    }
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
        page.getByLabel('Destination preview').getByText('Ember Watch', { exact: true }),
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

for (const width of [320, 390, 1280]) {
  test(`dispatch review keeps each ship and count on its own row at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await setup(page)
    await page.getByLabel('Recycler · 1 available').fill('1')
    await page.getByLabel('Colony Ship · 1 available').fill('1')
    await review(page).click()
    const quote = page.getByRole('region', { name: 'Fleet quote' })
    const ships = quote.getByRole('list', { name: 'Ship composition' })
    await expect(ships.getByRole('listitem')).toHaveText(['Recycler 1', 'Colony Ship 1', 'Small Cargo 1'])
    const rows = await ships.getByRole('listitem').evaluateAll(elements => elements.map(element => {
      const [name, count] = Array.from(element.children).map(child => child.getBoundingClientRect())
      return { nameTop: name.top, countTop: count.top, bottom: element.getBoundingClientRect().bottom, top: element.getBoundingClientRect().top }
    }))
    for (const [index, row] of rows.entries()) {
      expect(row.nameTop).toBe(row.countTop)
      if (index > 0) expect(row.top).toBeGreaterThanOrEqual(rows[index - 1].bottom)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.evaluate(() => window.scrollTo(0, 0))
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
    await diagnosticScreenshot(page, { path: `test-results/dispatch-composition-${width}.png` })
    await page.getByRole('link', { name: 'Back to fleets', exact: true }).click()
    await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/fleets`)
  })
}

for (const width of [320, 390, 1440]) {
  test(`destination picker and coordinates converge on one preview at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await setup(page)
    const picker = page.getByRole('combobox', { name: 'Your other planets' })
    const preview = page.getByLabel('Destination preview')
    const input = page.getByLabel('Destination coordinates', { exact: true })
    await picker.click()
    await expect(page.getByRole('listbox', { name: 'Your other planets' }).getByRole('option')).toHaveText(['Haven Colony[1:1:2]'])
    await diagnosticScreenshot(page, { path: `test-results/destination-options-${width}.png` })
    await picker.press('Escape')
    await selectDestinationPlanet(page, id(6))
    await expect(input).toHaveValue('1:1:2')
    await expect(preview).toContainText('Haven Colony')
    await expect(preview).toContainText('Planet · Your colony')
    await expect(preview.locator('img')).toHaveAttribute('src', /planet-02-/)
    await expect(preview).toHaveCount(1)
    expect((await preview.boundingBox())!.height).toBeLessThanOrEqual(120)
    await expect(preview.getByLabel('Destination coordinates', { exact: true })).toHaveCount(1)
    await expect(page.getByLabel('Destination type')).toHaveCount(0)
    await mission(page).scrollIntoViewIfNeeded()
    await diagnosticScreenshot(page, { path: `test-results/destination-picker-${width}.png` })
    await diagnosticScreenshot(preview, { path: `test-results/destination-control-${width}.png` })
    const picked = await preview.textContent()
    await input.fill('1:1:1')
    await expect(picker).not.toHaveAttribute('data-value')
    await expect(preview).toContainText('Ember Watch')
    await expect(preview).toContainText('Stargazer')
    await input.fill('1:1:2')
    await expect(picker).toHaveAttribute('data-value', id(6))
    expect(await preview.textContent()).toBe(picked)
    await diagnosticScreenshot(page, { path: `test-results/destination-coordinate-${width}.png` })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await mission(page).selectOption('Deploy')
    await expect(picker).toHaveAttribute('data-value', id(6))
    await review(page).click()
    await expect(page.getByRole('region', { name: 'Fleet quote' })).toContainText('Haven Colony')
    await page.getByRole('button', { name: 'Edit mission' }).click()
    // Mission chooses debris automatically; the planet picker explicitly returns to a planet.
    await mission(page).selectOption('Harvest')
    await expect(preview).toContainText('Debris field')
    await mission(page).selectOption('Transport')
    await selectDestinationPlanet(page, id(6))
    await expect(preview).toContainText('Haven Colony')
    await input.fill('1:')
    await expect(preview).toContainText('Complete your destination')
    await expect(preview.locator('img')).toHaveCount(0)
    await expect(picker).not.toHaveAttribute('data-value')
    await input.fill('')
    await expect(preview).toContainText('Where are we heading?')
    await input.fill('1:1:999')
    await expect(preview).toContainText('Complete your destination')
    await expect(preview.getByText('[1:1:999]')).toHaveCount(0)
  })
}

test('late destination lookup cannot replace a selected colony and failures are honest', async ({ page }) => {
  const state = await setup(page)
  const preview = page.getByLabel('Destination preview')
  await expect(preview).toContainText('Ember Watch')
  let release!: () => void
  let held = false
  const gate = new Promise<void>(resolve => { release = resolve })
  state.hold = async route => {
    const query = route.request().postDataJSON()
    if (query.type === 'Galaxy' && query.system === 2) { held = true; await gate }
  }
  await setDestination(page, { system: '2' })
  await expect(preview).toContainText('Looking up destination')
  await expect(preview).not.toContainText('Ember Watch')
  await expect.poll(() => held).toBe(true)
  await selectDestinationPlanet(page, id(6))
  await expect(preview).toContainText('Haven Colony')
  const response = page.waitForResponse(r => r.url().endsWith('/world') && r.request().postDataJSON().type === 'Galaxy' && r.request().postDataJSON().system === 2)
  release()
  await response
  await expect(preview).toContainText('Haven Colony')
  await page.route('**/world', async route => {
    if (route.request().postDataJSON().type === 'Galaxy') return route.fulfill({ status: 503, json: { code: 'Unavailable' } })
    await route.fallback()
  })
  await setDestination(page, { system: '3', position: '1' })
  await expect(preview).toContainText('Destination unavailable')
  await expect(preview.locator('img')).toHaveCount(0)
  await expect(page.getByRole('combobox', { name: 'Your other planets' })).not.toHaveAttribute('data-value')
})

test('destination picker excludes origin and moons and handles a one-planet empire', async ({ page }) => {
  await shellFixture(page, { protocol: 4, bodies: [{ ...body, name: 'Home' }, { ...body, id: id(90), kind: 'Moon', name: 'Home moon' }], extraCapabilities: ['Deploy'] })
  await page.goto(`/u/andromeda/b/${body.id}/dispatch`)
  await expect(page.getByRole('combobox', { name: 'Your other planets' })).toBeDisabled()
  await expect(page.getByRole('combobox', { name: 'Your other planets' })).toHaveAttribute('title', /No other planets yet/)
  await expect(page.getByLabel('Destination coordinates', { exact: true })).toBeEnabled()
})


test('planet renames, removal and origin changes update the picker and preview from live empire data', async ({ page }) => {
  const home = { ...body, name: 'Home' }
  const colony = { ...body, id: id(6), name: 'Colony', coordinates: { galaxy: 1, system: 1, position: 2 } }
  const bodies = [home, colony]
  let revision = 1
  await shellFixture(page, { protocol: 4, bodies, viewerRevision: () => String(revision), extraCapabilities: ['Deploy'] })
  await page.goto(`/u/andromeda/b/${body.id}/dispatch`)
  const picker = page.getByRole('combobox', { name: 'Your other planets' })
  const preview = page.getByLabel('Destination preview')
  await selectDestinationPlanet(page, colony.id)
  await expect(preview).toContainText('Colony')
  colony.name = 'Aurora Anchorage 🪐'
  revision++
  await refreshGame(page)
  await expect(preview).toContainText(colony.name)
  await expect(picker).toContainText(colony.name)
  await selectBody(page, colony.id)
  await picker.click()
  await expect(page.getByRole('listbox', { name: 'Your other planets' }).getByRole('option')).toHaveText(['Home[1:371:12]'])
  await picker.press('Escape')
  await selectDestinationPlanet(page, home.id)
  await expect(preview).toContainText('Home')
  await selectBody(page, home.id)
  await selectDestinationPlanet(page, colony.id)
  bodies.pop()
  revision++
  await refreshGame(page)
  await expect(picker).toBeDisabled()
  await expect(preview).not.toContainText(colony.name)
  await expect(page.getByLabel('Destination coordinates', { exact: true })).toHaveValue('1:1:2')
})


test('selecting a planet invalidates an in-flight review for manual coordinates', async ({ page }) => {
  const state = await setup(page)
  let release!: () => void
  let held = false
  const gate = new Promise<void>(resolve => { release = resolve })
  state.hold = async route => {
    if (route.request().postDataJSON().type === 'ResolveDestination') { held = true; await gate }
  }
  await review(page).click()
  await expect.poll(() => held).toBe(true)
  await selectDestinationPlanet(page, id(6))
  const response = page.waitForResponse(r => r.url().endsWith('/world') && r.request().postDataJSON().type === 'ResolveDestination')
  release()
  await response
  await expect(page.getByLabel('Destination preview')).toContainText('Haven Colony')
  await expect(page.getByRole('region', { name: 'Fleet quote' })).toHaveCount(0)
  expect(state.quotes).toBe(0)
  state.hold = null
  await review(page).click()
  await expect(page.getByRole('region', { name: 'Fleet quote' })).toContainText('Haven Colony')
})


test('destination retains its last observation while refreshing the same system', async ({ page }) => {
  const state = await setup(page)
  const preview = page.getByLabel('Destination preview')
  await mission(page).selectOption('Attack')
  await expect(preview).toContainText('Ember Watch')
  let release!: () => void
  let held = false
  const gate = new Promise<void>(resolve => { release = resolve })
  state.hold = async route => {
    if (route.request().postDataJSON().type === 'Galaxy') { held = true; await gate }
  }
  state.advanceRevision()
  await refreshGame(page)
  await expect.poll(() => held).toBe(true)
  await expect(preview).toContainText('Ember Watch')
  await expect(preview).toContainText('Last observation · Updating…')
  await expect(preview.locator('img')).toHaveCount(1)
  state.observationAvailable = false
  const response = page.waitForResponse(r => r.url().endsWith('/world') && r.request().postDataJSON().type === 'Galaxy')
  release()
  await response
  await expect(preview).toContainText('Empty position')
  await expect(preview).not.toContainText('Ember Watch')
  await expect(preview).not.toContainText('Updating')
})

test('a retained observation of a former colony is explicitly marked as updating', async ({ page }) => {
  const state = await setup(page)
  const preview = page.getByLabel('Destination preview')
  await expect(preview).toContainText('Ember Watch')
  state.ownedObservation = true
  state.advanceRevision()
  const observed = page.waitForResponse(r => r.url().endsWith('/world') && r.request().postDataJSON().type === 'Galaxy')
  await refreshGame(page)
  await observed
  await expect(preview).not.toContainText('Updating')
  await selectDestinationPlanet(page, id(6))
  await expect(preview).toContainText('Haven Colony')
  let release!: () => void
  let held = false
  const gate = new Promise<void>(resolve => { release = resolve })
  state.hold = async route => {
    if (route.request().postDataJSON().type === 'Galaxy') { held = true; await gate }
  }
  state.bodies.splice(1, 1)
  state.advanceRevision()
  await refreshGame(page)
  await expect.poll(() => held).toBe(true)
  await expect(page.getByRole('combobox', { name: 'Your other planets' })).toBeDisabled()
  await expect(preview).toContainText('Haven Colony')
  await expect(preview).toContainText('Last observation · Updating…')
  await expect(preview).toContainText('You (last observed)')
  await expect(preview).not.toContainText('Your colony')
  state.ownedObservation = false
  const response = page.waitForResponse(r => r.url().endsWith('/world') && r.request().postDataJSON().type === 'Galaxy')
  release()
  await response
  await expect(preview).toContainText('Empty position')
  await expect(preview).not.toContainText('Haven Colony')
})


test('unified destination supports keyboard planet selection, dismissal and coordinate advancement', async ({ page }) => {
  await setup(page)
  const picker = page.getByRole('combobox', { name: 'Your other planets' })
  const input = page.getByLabel('Destination coordinates', { exact: true })
  await picker.focus()
  await picker.press('ArrowDown')
  await expect(page.getByRole('listbox', { name: 'Your other planets' })).toBeVisible()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(input).toHaveValue('1:1:2')
  await expect(picker).toBeFocused()
  await picker.press('ArrowDown')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(input).toHaveValue('1:1:2')
  await input.fill('1')
  await page.getByRole('button', { name: 'Next coordinate segment' }).click()
  await input.pressSequentially('1')
  await page.getByRole('button', { name: 'Next coordinate segment' }).click()
  await input.pressSequentially('2')
  await expect(input).toHaveValue('1:1:2')
  await expect(picker).toHaveAttribute('data-value', id(6))
})


test('ordinary coordinate entry defaults to Planet and Harvest keeps debris intent', async ({ page }) => {
  await setup(page)
  const input = page.getByLabel('Destination coordinates', { exact: true })
  const preview = page.getByLabel('Destination preview')
  await input.fill('1:1:3')
  await expect(preview).toContainText('Empty position')
  await input.fill('1:1:1')
  await expect(preview).toContainText('Planet · Stargazer')
  await mission(page).selectOption('Harvest')
  await input.fill('1:1:3')
  await expect(preview).toContainText('Debris field')
  await mission(page).selectOption('Transport')
  await input.fill('1:1:1')
  await expect(preview).toContainText('Planet · Stargazer')
})

test('explicit moon links retain their body intent through coordinate edits and review', async ({ page }) => {
  const state = await setup(page)
  const input = page.getByLabel('Destination coordinates', { exact: true })
  const preview = page.getByLabel('Destination preview')
  await input.evaluate(element => {
    const data = new DataTransfer()
    data.setData('text/plain', `${location.origin}/u/andromeda/location/1:1:1?target=moon`)
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  })
  await expect(preview).toContainText('Moon not observed')
  await input.fill('1')
  await page.getByRole('button', { name: 'Next coordinate segment' }).click()
  await input.pressSequentially('1 3')
  await expect(input).toHaveValue('1:1:3')
  await expect(preview).toContainText('Moon not observed')
  state.destination = { type: 'Body', id: id(91), expected_owner: id(30), expected_kind: 'Moon' }
  const resolved = page.waitForRequest(r => r.url().endsWith('/world') && r.postDataJSON().type === 'ResolveDestination')
  await review(page).click()
  expect((await resolved).postDataJSON().selection).toEqual({ type: 'BodyAt', coordinates: { galaxy: 1, system: 1, position: 3 }, kind: 'Moon' })
  await expect(page.getByRole('region', { name: 'Fleet quote' })).toContainText('Unknown moon')
  await page.getByRole('button', { name: 'Edit mission' }).click()
  await selectDestinationPlanet(page, id(6))
  await expect(preview).toContainText('Planet · Your colony')
})


test('long planet names remain readable in the narrow destination list', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 })
  const state = await setup(page)
  const name = 'M'.repeat(40)
  state.bodies[1].name = name
  state.advanceRevision()
  await refreshGame(page)
  const picker = page.getByRole('combobox', { name: 'Your other planets' })
  await picker.click()
  const list = page.getByRole('listbox', { name: 'Your other planets' })
  await expect(list).toContainText(name)
  expect(await list.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.getByRole('option').and(page.locator(`[data-value="${id(6)}"]`)).click()
  await expect(picker).toContainText(name)
  await expect(picker.locator('strong')).toHaveAttribute('title', name)
  expect((await page.getByLabel('Destination preview').boundingBox())!.height).toBeLessThanOrEqual(120)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('choosing a planet clears a rejected paste notice without changing coordinate validation', async ({ page }) => {
  await setup(page)
  const input = page.getByLabel('Destination coordinates', { exact: true })
  const preview = page.getByLabel('Destination preview')
  await input.focus()
  await input.evaluate(element => {
    const data = new DataTransfer()
    data.setData('text/plain', 'https://other.test/u/andromeda/location/1:1:2')
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  })
  await expect(preview.getByRole('alert')).toContainText('Use coordinates or a location link')
  await selectDestinationPlanet(page, id(6))
  await expect(input).toHaveValue('1:1:2')
  await expect(preview).toContainText('Haven Colony')
  await expect(preview.getByRole('alert')).toHaveCount(0)
  await expect(input).toHaveAttribute('aria-invalid', 'false')
  await input.fill('999:1:2')
  await input.press('Tab')
  await expect(preview.getByRole('alert')).toContainText('Enter a galaxy number from 1 to 1.')
  await expect(input).toHaveAttribute('aria-invalid', 'true')
})

test('background flight estimates preserve an explicit moon destination', async ({ page }) => {
  const state = await setup(page)
  state.destination = { type: 'Body', id: id(91), expected_owner: id(30), expected_kind: 'Moon' }
  const resolved = page.waitForRequest(request => {
    if (!request.url().endsWith('/world')) return false
    const query = request.postDataJSON()
    return query.type === 'ResolveDestination' && query.selection.coordinates.position === 3
  })
  await page.getByLabel('Destination coordinates', { exact: true }).evaluate(element => {
    const data = new DataTransfer()
    data.setData('text/plain', `${location.origin}/u/andromeda/location/1:1:3?target=moon`)
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  })
  expect((await resolved).postDataJSON().selection).toEqual({ type: 'BodyAt', coordinates: { galaxy: 1, system: 1, position: 3 }, kind: 'Moon' })
  await expect(page.getByRole('region', { name: 'Fleet quote' })).toHaveCount(0)
  expect(state.launches).toBe(0)
})


for (const width of [390, 1440]) {
  test(`Empire retains cargo wealth while launching and restores rejected reservations at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await setup(page)
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    await page.route('**/commands', async (route) => {
      await gate
      await route.fallback()
    })
    try {
      await page.getByRole('textbox', { name: 'Metal', exact: true }).fill('42')
      await review(page).click()
      await page.getByRole('button', { name: /^(Attack with|Spy with|Harvest with|Colonize with|Transport to|Deploy to) / }).click()
      await expect(dispatchResult(page)).toContainText('Sending fleet order…')
      await page.getByRole('link', { name: 'Empire', exact: true }).click()
      const ledger = page.getByLabel('Empire resource totals')
      const metal = ledger.getByRole('group', { name: 'metal wealth', exact: true })
      const deuterium = ledger.getByRole('group', { name: 'deuterium wealth', exact: true })
      const launching = metal.locator('dl > div').filter({ hasText: 'Launching' })
      await expect(launching.locator('dd')).toHaveText('42')
      await expect(metal.locator('strong')).toHaveText('13,323')
      await expect(metal.locator('dl > div').filter({ hasText: 'On planets and moons' }).locator('dd')).toHaveText('13,281')
      await expect(deuterium.locator('strong')).toHaveText('6,243')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      for (const group of await ledger.getByRole('group').all()) {
        const centers = await group.locator('dt > svg').evaluateAll(icons => icons.map(icon => {
          const box = icon.getBoundingClientRect()
          return box.x + box.width / 2
        }))
        expect(Math.max(...centers) - Math.min(...centers)).toBeLessThan(1)
      }
      await diagnosticScreenshot(ledger, { path: `test-results/empire-wealth-launching-${width}x1000.png` })
      release()
      await expect(launching).toHaveCount(0)
      await expect(metal.locator('strong')).toHaveText('13,323')
      await expect(metal.locator('dl > div').filter({ hasText: 'On planets and moons' }).locator('dd')).toHaveText('13,323')
      await expect(deuterium.locator('strong')).toHaveText('6,244')
      await diagnosticScreenshot(ledger, { path: `test-results/empire-wealth-rejected-${width}x1000.png` })
    } finally {
      release()
    }
  })
}
