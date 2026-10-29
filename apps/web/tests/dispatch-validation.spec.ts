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
    ...structuredClone(body),
    id: id(6),
    colony: { diameter_km: 12000, min_temperature: 0, max_temperature: 40, created_at: 1000, profile: 'oi-redesign-reconstructed-v1' },
    coordinates: { galaxy: 1, system: 1, position: 2 },
  }
  const bodies = [
      {
        ...structuredClone(body),
        name: 'Aster Haven',
        inventories: [
          ...structuredClone(body.inventories),
          ...(['EspionageProbe', 'Recycler', 'ColonyShip'] as const).map(
            (id) => ({ item: { kind: 'Ship' as const, id }, count: '1' }),
          ),
        ],
      },
      { ...colony, name: 'Haven Colony' },
    ]
  const capabilities: NonNullable<Parameters<typeof shellFixture>[1]>['extraCapabilities'] = [
    'Attack', 'Espionage', 'Harvest', 'Deploy', 'Reports', 'Colonize',
  ]
  let revision = 1
  await shellFixture(page, {
    viewerRevision: () => String(revision),
    protocol: 4,
    homeworldId: body.id,
    bodies,
    missions: { fleets: [], incoming: [], score_value_micro: '0', fleet_slots: '5' },
    playerNames: { [binding.player]: 'Commander' },
    research: [{ research: 'Astrophysics', level: 8 }],
    extraCapabilities: capabilities,
    catalog: [
      ...(['EspionageProbe', 'Recycler', 'ColonyShip'] as const).map((id) => ({
        key: { kind: 'Ship' as const, id },
        ship_statistics: { propulsion: null, combat: null, cost: { EspionageProbe: ['0', '1000', '0'], Recycler: ['10000', '6000', '2000'], ColonyShip: ['10000', '20000', '10000'] }[id] },
        requirements: [],
        enabled: true,
        mobile: true,
        body_kinds: ['Planet' as const],
      })),
      {
        key: { kind: 'Ship', id: 'SmallCargo' },
        ship_statistics: { propulsion: null, combat: null, cost: ['2000', '2000', '0'] },
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
    capabilities,
    ownedObservation: false,
    advanceRevision: () => { revision++ },
    blocker: null as S['GameError4'] | null,
    estimateError: null as S['GameError4'] | null,
    debris: true,
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
                  espionage_eligible: !observedBlocker,
                  attack_blocker: observedBlocker,
                }
              : null,
          debris: state.debris ? { field_identity: id(40), metal: '1000000', crystal: '1000000' } : null,
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
      if (query.type === 'FleetEstimate' ? state.estimateError : state.quoteError)
        return route.fulfill({
          status: 422,
          json: { code: 'GameRejected', game_code: query.type === 'FleetEstimate' ? state.estimateError : state.quoteError },
        })
      data = {
        intent: query.intent,
        profile_hash: 'a'.repeat(64),
        ...(query.type === 'FleetEstimate' ? { estimate: true } : { distance: 1000, speeds: [], slot_limit: '1', terms_hash: 'b'.repeat(64) }),
        duration_ms: Math.floor((state.duration * 100) / query.intent.speed_percent),
        fuel: state.fuel,
        capacity: '5000000000',
        maximum_payload: '4999000000',
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
  page.getByRole('radio', { checked: true })
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
    await page.getByRole('radio', { name: 'Deploy', exact: true }).check()
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
    await page.getByRole('radio', { name: 'Transport', exact: true }).check()
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
  await page.getByRole('radio', { name: 'Harvest', exact: true }).check()
  await review(page).click()
  await expect(page.getByRole('region', { name: 'Fleet quote' })).toBeVisible()
})

test('an edited historical deploy still reports authoritative quote rejection', async ({
  page,
}) => {
  const state = await setup(page)
  await prepareHistoricalDraft(page)
  await page.getByRole('radio', { name: 'Deploy', exact: true }).check()
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
  await ship.blur()
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
  await setSpeed(page, 50)
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
      request.postDataJSON().type === 'FleetEstimate' &&
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
    const speed = settings.getByRole('slider', { name: 'Speed', exact: true })
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
    await setSpeed(page, 50)
    await expect(fuel.locator('dd')).toHaveText('250')
    await expect(timing.locator('dd').nth(0)).toHaveText('3m 20s')
    await page.getByRole('radio', { name: 'Deploy', exact: true }).check()
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
    if (query.type === 'FleetEstimate' && query.intent.speed_percent === 50) {
      held = true
      await gate
    }
  }
  await setSpeed(page, 50)
  await expect.poll(() => held).toBe(true)
  await setSpeed(page, 20)
  await expect(timing.locator('dd').nth(0)).toHaveText('8m 20s')
  const response = page.waitForResponse(
    (response) =>
      response.url().endsWith('/world') &&
      response.request().postDataJSON().type === 'FleetEstimate' &&
      response.request().postDataJSON().intent.speed_percent === 50,
  )
  release()
  await response
  await expect(timing.locator('dd').nth(0)).toHaveText('8m 20s')
  state.estimateError = 'NotFound'
  await setSpeed(page, 10)
  await expect(timing).toContainText('no longer available')
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
    await page.getByRole('radio', { name: next, exact: true }).check()
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
  await page.getByRole('radio', { name: 'Attack', exact: true }).check()
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'You cannot attack your own planet' }),
  ).toContainText('use Transport')
  await expect(review(page)).toBeDisabled()
  // Advance beyond the timing debounce only after the invalid attack is selected.
  await page.clock.runFor(1000)
  expect(state.quotes).toBe(0)
  await page.getByRole('radio', { name: 'Transport', exact: true }).check()
  await review(page).click()
  await expect(page.getByRole('region', { name: 'Fleet quote' })).toBeVisible()
  await page.getByRole('button', { name: 'Edit mission' }).click()
  await page.getByRole('radio', { name: 'Harvest', exact: true }).check()
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
  await page.getByRole('radio', { name: 'Attack', exact: true }).check()
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
  await page.getByRole('radio', { name: 'Attack', exact: true }).check()
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
  await page.getByRole('radio', { name: 'Attack', exact: true }).check()
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
      .getByRole('group', { name: 'Mission', exact: true }).locator('label')
      .evaluateAll((elements) =>
        elements.map((element) => element.getBoundingClientRect().height),
      )
    expect(selectors).toHaveLength(6)
    for (const height of selectors) {
      expect(height).toBeGreaterThanOrEqual(44)
      expect(height).toBeLessThanOrEqual(56)
    }
    const speed = page.getByRole('group', { name: 'Speed and flight estimates' })
      .getByRole('slider', { name: 'Speed', exact: true })
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
    await page.getByRole('radio', { name: 'Attack', exact: true }).check()
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
    await page.getByRole('radio', { name: kind, exact: true }).check()
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
    await expect(quote.getByRole('button', { name: /^Fleet slots:/ })).toHaveCount(0)
    await expect(page.locator('main').getByRole('button', { name: /^Fleet slots:/ })).toHaveCount(1)
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
  await page.getByRole('radio', { name: 'Attack', exact: true }).check()
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
    await page.getByRole('radio', { name: 'Deploy', exact: true }).check()
    await expect(picker).toHaveAttribute('data-value', id(6))
    await review(page).click()
    await expect(page.getByRole('region', { name: 'Fleet quote' })).toContainText('Haven Colony')
    await page.getByRole('button', { name: 'Edit mission' }).click()
    // Mission chooses debris automatically; the planet picker explicitly returns to a planet.
    await page.getByRole('radio', { name: 'Harvest', exact: true }).check()
    await expect(preview).toContainText('Debris field')
    await page.getByRole('radio', { name: 'Transport', exact: true }).check()
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
  await page.getByRole('radio', { name: 'Attack', exact: true }).check()
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
  await input.press('Space')
  await input.pressSequentially('1')
  await input.press('Space')
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
  await page.getByRole('radio', { name: 'Harvest', exact: true }).check()
  await input.fill('1:1:3')
  await expect(preview).toContainText('Debris field')
  await page.getByRole('radio', { name: 'Transport', exact: true }).check()
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
  await input.press('Space')
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
  test(`dispatch feedback and ship selection at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    const state = await setup(page)
    const table = page.getByRole('table', { name: 'Ships to dispatch' })
    await expect(table.getByRole('row').filter({ has: page.locator('input') }).locator('th')).toHaveText(['Light Fighter', 'Espionage Probe', 'Small Cargo', 'Recycler', 'Colony Ship'])
    await expect(page.getByRole('group', { name: 'Mission', exact: true }).locator('label')).toHaveText(['Transport', 'Deploy', 'Attack', 'Harvest', 'Espionage', 'Colonize'])
    await page.getByRole('button', { name: 'All Small Cargo', exact: true }).click()
    await expect(page.getByLabel('Small Cargo · 2 available')).toHaveValue('2')
    await expect(page.getByRole('button', { name: 'Next coordinate segment' })).toBeVisible({ visible: width < 768 })
    await expect(page.getByRole('complementary', { name: 'Departure context' })).toHaveCount(0)
    await page.getByLabel('Small Cargo · 2 available').fill('0')
    await page.getByRole('radio', { name: 'Colonize', exact: true }).check()
    await expect(page.getByRole('status').filter({ hasText: 'This position is occupied' })).toBeVisible()
    await expect(review(page)).toBeDisabled()
    await page.evaluate(() => window.scrollTo(0, 0))
    await diagnosticScreenshot(page, { path: `test-results/dispatch-occupied-${width}x1000.png`, fullPage: width >= 768 })
    state.debris = false
    await page.getByRole('radio', { name: 'Harvest', exact: true }).check()
    await expect(page.getByRole('status').filter({ hasText: 'no available debris field' })).toBeVisible()
    await page.evaluate(() => window.scrollTo(0, 0))
    await diagnosticScreenshot(page, { path: `test-results/dispatch-debris-${width}x1000.png`, fullPage: width >= 768 })
    await page.getByRole('radio', { name: 'Deploy', exact: true }).check()
    await expect(page.getByRole('status').filter({ hasText: 'you own' })).toBeVisible()
    await page.getByRole('radio', { name: 'Transport', exact: true }).check()
    await page.getByLabel('Small Cargo · 2 available').fill('1')
    state.fuel = '4000000000'
    state.quoteError = 'InsufficientResources'
    await setSpeed(page, 90)
    const timing = page.getByRole('region', { name: 'Flight timing' })
    await expect(timing).toContainText('4,000 · Insufficient fuel')
    await expect(timing.locator('dd').first()).not.toHaveText('—')
    await review(page).click()
    await expect(page.getByRole('alert')).toContainText('Not enough deuterium for fuel')
    await expect(timing).toContainText('4,000 · Insufficient fuel')
    if (width < 768) await page.getByRole('alert').scrollIntoViewIfNeeded()
    else await page.evaluate(() => window.scrollTo(0, 0))
    await diagnosticScreenshot(page, { path: `test-results/dispatch-fuel-${width}x1000.png`, fullPage: width >= 768 })
    state.fuel = '1000000'
    state.quoteError = null
    await selectDestinationPlanet(page, id(6))
    await setSpeed(page, 100)
    await expect(timing.locator('dd').first()).toHaveText('1m 40s')
    await page.evaluate(() => window.scrollTo(0, 0))
    await diagnosticScreenshot(page, { path: `test-results/dispatch-ready-${width}x1000.png`, fullPage: width >= 768 })
    await review(page).click()
    await expect(page.getByRole('region', { name: 'Fleet quote' })).toBeVisible()
    await page.evaluate(() => window.scrollTo(0, 0))
    await diagnosticScreenshot(page, { path: `test-results/dispatch-review-${width}x1000.png`, fullPage: width >= 768 })
    expect(state.launches).toBe(0)
  })
}

test('origin changes preserve destination and mission but discard origin-specific input and stale review', async ({ page }) => {
  const state = await setup(page)
  await page.getByRole('radio', { name: 'Espionage', exact: true }).check()
  await page.getByLabel('Espionage Probe · 1 available').fill('1')
  await page.getByLabel('Metal', { exact: true }).fill('12')
  let release!: () => void
  let held = false
  const gate = new Promise<void>(resolve => { release = resolve })
  state.hold = async route => {
    if (route.request().postDataJSON().type === 'FleetQuote') { held = true; await gate }
  }
  await review(page).click()
  await expect.poll(() => held).toBe(true)
  await selectBody(page, id(6))
  await expect(page.getByRole('group', { name: 'Origin', exact: true })).toContainText('Haven Colony')
  await expect(mission(page)).toHaveValue('Espionage')
  await expect(page.getByLabel('Destination coordinates', { exact: true })).toHaveValue('1:1:1')
  await expect(page.getByLabel('Small Cargo · 2 available')).toHaveValue('0')
  await expect(page.getByLabel('Metal', { exact: true })).toHaveValue('0')
  const response = page.waitForResponse(r => r.url().endsWith('/world') && r.request().postDataJSON().type === 'FleetQuote')
  release()
  await response
  await expect(page.getByRole('region', { name: 'Fleet quote' })).toHaveCount(0)
  await page.getByRole('radio', { name: 'Transport', exact: true }).check()
  await selectDestinationPlanet(page, body.id)
  await expect(page.getByLabel('Destination preview')).toContainText('Your Homeworld')
  expect(state.launches).toBe(0)
})

for (const width of [390, 1440]) {
  test(`homeworld identity survives origin changes at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await setup(page)
    await selectBody(page, id(6))
    await selectDestinationPlanet(page, body.id)
    await expect(page.getByLabel('Destination preview')).toContainText('Planet · Your Homeworld')
    await page.evaluate(() => window.scrollTo(0, 0))
    await diagnosticScreenshot(page, { path: `test-results/dispatch-homeworld-${width}x1000.png`, fullPage: width >= 768 })
  })
}

test('espionage protection is observed before ships and remains advisory until review', async ({ page }) => {
  const state = await setup(page)
  await page.getByLabel('Small Cargo · 2 available').fill('0')
  state.blocker = 'BeginnerProtected'
  await page.getByRole('radio', { name: 'Espionage', exact: true }).check()
  await expect(page.getByRole('status').filter({ hasText: 'Beginner protection prevents' })).toBeVisible()
  expect(state.launches).toBe(0)
})

test('Dispatch shares a centered responsive content column with its review', async ({ page }) => {
  await setup(page)
  await selectDestinationPlanet(page, id(6))
  const content = page.locator('main')
  for (const width of [390, 767, 768, 1199, 1200, 1440, 1599, 1600, 1920]) {
    await page.setViewportSize({ width, height: 1000 })
    const cap = width >= 1600 ? 896 : width >= 1200 ? 768 : width >= 768 ? 640 : Infinity
    const geometry = await content.evaluate(element => {
      const current = element.getBoundingClientRect()
      const parent = element.parentElement!.getBoundingClientRect()
      return { width: current.width, center: current.x + current.width / 2, available: parent.width, parentCenter: parent.x + parent.width / 2 }
    })
    expect(geometry.width).toBeCloseTo(Math.min(cap, geometry.available), 0)
    expect(geometry.center).toBeCloseTo(geometry.parentCenter, 0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(page.getByLabel('Small Cargo · 2 available')).toHaveValue('1')
    if ([390, 768, 1440, 1920].includes(width)) {
      await page.evaluate(() => window.scrollTo(0, 0))
      await diagnosticScreenshot(page, { path: `test-results/dispatch-centered-${width}x1000.png`, fullPage: width >= 768 })
    }
  }
  await review(page).click()
  await expect(page.getByRole('region', { name: 'Fleet quote' })).toBeVisible()
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    const geometry = await content.evaluate(element => {
      const rect = element.getBoundingClientRect(), parent = element.parentElement!.getBoundingClientRect()
      return { width: rect.width, available: parent.width, center: rect.x + rect.width / 2, parentCenter: parent.x + parent.width / 2 }
    })
    expect(geometry.width).toBeCloseTo(Math.min(width === 1440 ? 768 : Infinity, geometry.available), 0)
    expect(geometry.center).toBeCloseTo(geometry.parentCenter, 0)
    await page.evaluate(() => window.scrollTo(0, 0))
    await diagnosticScreenshot(page, { path: `test-results/dispatch-centered-review-${width}x1000.png`, fullPage: true })
  }
})

async function setSpeed(page: Page, percent: number) {
  const slider = page.getByRole('slider', { name: 'Speed', exact: true })
  await slider.press('Home')
  for (let value = 10; value < percent; value += 10) await slider.press('ArrowRight')
  await expect(slider).toHaveValue(String(percent))
}

for (const width of [320, 390, 1440]) {
  test(`compact Dispatch identities, fleet slots and speed at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    const state = await setup(page)
    const slots = page.locator('main').getByRole('button', { name: 'Fleet slots: 0 used / 5 total', exact: true })
    const title = page.locator('main h1')
    const bounds = await slots.evaluate(element => {
      const badge = element.getBoundingClientRect(), heading = element.parentElement!.getBoundingClientRect()
      return { right: badge.right, headerRight: heading.right, top: badge.top, bottom: badge.bottom }
    })
    expect(bounds.right).toBeCloseTo((await page.locator('main').boundingBox())!.x + (await page.locator('main').boundingBox())!.width, 0)
    const titleBox = (await title.boundingBox())!
    expect(titleBox.y + titleBox.height / 2).toBeGreaterThanOrEqual(bounds.top)
    expect(titleBox.y + titleBox.height / 2).toBeLessThanOrEqual(bounds.bottom)
    const origin = page.getByRole('group', { name: 'Origin', exact: true })
    await expect(origin).toContainText('Aster Haven')
    await expect(origin).toContainText('Commander')
    await expect(origin.getByRole('link', { name: /origin/ })).toBeVisible()
    await expect(page.getByRole('table', { name: 'Ships to dispatch' }).locator('tr').filter({ has: page.locator('th[scope="rowgroup"]') })).toHaveText(['War', 'Peace'])
    await expect(page.getByLabel('Small Cargo · 2 available')).toHaveValue('1')
    await expect(page.getByLabel('Destination preview')).toContainText('Ember Watch')
    await expect(page.getByRole('region', { name: 'Flight timing' }).locator('dd').first()).toHaveText('1m 40s')
    await page.evaluate(() => window.scrollTo(0, 0))
    await diagnosticScreenshot(page, { path: `test-results/dispatch-polished-${width}x1000.png`, fullPage: width >= 768 })
    await slots.click()
    await expect(page.getByRole('tooltip')).toContainText('Outbound and returning fleets, including pending departures')
    await diagnosticScreenshot(page, { path: `test-results/dispatch-slots-help-${width}x1000.png` })
    await page.keyboard.press('Escape')
    const slider = page.getByRole('slider', { name: 'Speed', exact: true })
    await slider.press('Home')
    await expect(slider).toHaveValue('10')
    await slider.press('ArrowLeft')
    await expect(slider).toHaveValue('10')
    await slider.press('End')
    await expect(slider).toHaveValue('100')
    await slider.press('ArrowRight')
    await expect(slider).toHaveValue('100')
    await slider.press('ArrowLeft')
    await expect(slider).toHaveAttribute('aria-valuetext', '90%')
    await expect(page.getByRole('region', { name: 'Flight timing' }).locator('dd').first()).toHaveText('1m 52s')
    await slider.scrollIntoViewIfNeeded()
    await diagnosticScreenshot(page, { path: `test-results/dispatch-speed-slider-${width}x1000.png` })
    await review(page).click()
    await expect(page.getByRole('region', { name: 'Fleet quote' })).toContainText('90% speed')
    await expect(page.locator('main').getByRole('button', { name: /^Fleet slots:/ })).toHaveCount(1)
    await page.evaluate(() => window.scrollTo(0, 0))
    await diagnosticScreenshot(page, { path: `test-results/dispatch-polished-review-${width}x1000.png`, fullPage: width >= 768 })
    expect(state.launches).toBe(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}

for (const width of [390, 1440]) {
  test(`Origin shares the planet selector presentation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await setup(page)
    await selectDestinationPlanet(page, id(6))
    const origin = page.getByRole('group', { name: 'Origin', exact: true })
    const destination = page.getByLabel('Destination preview')
    await expect(origin).toContainText('Aster Haven')
    await expect(origin).toContainText('Planet · Commander')
    await expect(origin.locator('img')).toHaveJSProperty('complete', true)
    const originArt = (await origin.locator('img').boundingBox())!
    const destinationArt = (await destination.locator('img').boundingBox())!
    expect(originArt.width).toBe(width < 480 ? 56 : 80)
    expect(originArt.width).toBe(destinationArt.width)
    expect((await origin.boundingBox())!.width).toBe((await destination.boundingBox())!.width)
    await expect(origin.getByText('Aster Haven', { exact: true })).toHaveCSS('font-family', 'Georgia, serif')
    await expect(origin.getByRole('link', { name: /origin/ })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Flight timing' }).locator('dd').first()).toHaveText('1m 40s')
    await page.evaluate(() => window.scrollTo(0, 0))
    await diagnosticScreenshot(page, { path: `test-results/dispatch-origin-card-${width}x1000.png`, fullPage: width >= 768 })
    await diagnosticScreenshot(origin, { path: `test-results/origin-card-detail-${width}x1000.png` })
    await page.getByRole('combobox', { name: 'Your other planets' }).click()
    await expect(page.getByRole('listbox', { name: 'Your other planets' })).toBeVisible()
    await diagnosticScreenshot(page, { path: `test-results/dispatch-origin-picker-${width}x1000.png` })
    await page.keyboard.press('Escape')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}

for (const width of [320, 390, 640, 768, 1440]) {
  test(`mission choices are compact and keyboard accessible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await setup(page)
    const selector = page.getByRole('group', { name: 'Mission', exact: true })
    const radios = selector.getByRole('radio')
    await expect(radios).toHaveCount(6)
    await expect(page.getByRole('combobox', { name: 'Mission', exact: true })).toHaveCount(0)
    expect(await selector.locator('label > span').evaluateAll(elements => elements.every(element => element.scrollWidth <= element.clientWidth))).toBe(true)
    const transport = selector.getByRole('radio', { name: 'Transport', exact: true })
    await expect(transport).toBeChecked()
    const tiles = await selector.locator('label').evaluateAll(elements => elements.map(element => {
      const { x, y, width, height } = element.getBoundingClientRect()
      return { x, y, width, height }
    }))
    expect(new Set(tiles.map(tile => tile.y)).size).toBe(width < 768 ? 2 : 1)
    for (const tile of tiles) {
      expect(tile.height).toBeGreaterThanOrEqual(44)
      expect(tile.x + tile.width).toBeLessThanOrEqual(width)
    }
    await transport.focus()
    await transport.press('ArrowRight')
    await expect(selector.getByRole('radio', { name: 'Deploy', exact: true })).toBeChecked()
    await expect(selector).toContainText('Move ships and cargo to an owned planet or moon.')
    await expect(page.getByLabel('Destination preview')).toContainText('Ember Watch')
    await page.evaluate(() => window.scrollTo(0, 0))
    await diagnosticScreenshot(page, { path: `test-results/dispatch-mission-deploy-${width}x1000.png`, fullPage: width >= 768 })
    await page.keyboard.press('ArrowRight')
    const attack = selector.getByRole('radio', { name: 'Attack', exact: true })
    await expect(attack).toBeChecked()
    await expect(attack).toBeFocused()
    await expect(attack.locator('+ span')).toHaveCSS('outline-style', 'solid')
    await expect(page.getByLabel('Destination preview')).toContainText('Ember Watch')
    await diagnosticScreenshot(selector, { path: `test-results/mission-keyboard-detail-${width}x1000.png` })
    await page.evaluate(() => window.scrollTo(0, 0))
    await diagnosticScreenshot(page, { path: `test-results/dispatch-mission-keyboard-${width}x1000.png`, fullPage: width >= 768 })
    await selector.getByRole('radio', { name: 'Harvest', exact: true }).check()
    await expect(page.getByLabel('Destination preview')).toContainText('Debris field')
    await transport.check()
    await expect(page.getByLabel('Destination preview')).toContainText('Ember Watch')
    await expect(selector.getByRole('radio', { checked: true })).toHaveCount(1)
    await expect(page.getByLabel('Small Cargo · 2 available')).toHaveValue('1')
    await expect(page.getByRole('region', { name: 'Flight timing' }).locator('dd').first()).toHaveText('1m 40s')
    await page.evaluate(() => window.scrollTo(0, 0))
    await diagnosticScreenshot(page, { path: `test-results/dispatch-mission-choices-${width}x1000.png`, fullPage: width >= 768 })
    await diagnosticScreenshot(selector, { path: `test-results/mission-choices-detail-${width}x1000.png` })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}

test('mission choices honor capabilities and retain a selected unavailable mission', async ({ page }) => {
  const state = await setup(page)
  const selector = page.getByRole('group', { name: 'Mission', exact: true })
  await selector.getByRole('radio', { name: 'Attack', exact: true }).check()
  state.capabilities.splice(0)
  state.advanceRevision()
  await refreshGame(page)
  await expect(selector.locator('label')).toHaveText(['Transport', 'Attack'])
  await expect(selector.getByRole('radio', { name: 'Attack', exact: true })).toBeChecked()
  await selector.getByRole('radio', { name: 'Transport', exact: true }).check()
  await expect(selector.locator('label')).toHaveText(['Transport'])
  await expect(selector.getByRole('radio', { name: 'Transport', exact: true })).toBeChecked()
})

for (const width of [320, 390, 1440]) {
  test(`ship fill actions share the cargo control and fill the fleet at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    const state = await setup(page)
    const reviewRequests: string[] = []
    page.on('request', request => {
      if (request.url().endsWith('/world') && request.postDataJSON().type === 'FleetQuote') reviewRequests.push('FleetQuote')
    })
    const fleet = page.getByRole('group', { name: 'Ships', exact: true })
    const addAll = fleet.getByRole('button', { name: 'Add all ships', exact: true })
    const smallCargo = page.getByLabel('Small Cargo · 2 available')
    await expect(addAll).toHaveText('Add All')
    await expect(addAll).toHaveAttribute('data-button-variant', 'secondary')
    await expect(fleet.getByRole('button', { name: 'Max Light Fighter', exact: true })).toBeDisabled()
    await smallCargo.fill('')
    const fillCargo = fleet.getByRole('button', { name: 'Max Small Cargo', exact: true })
    await fillCargo.focus()
    await fillCargo.press('Enter')
    await expect(smallCargo).toHaveValue('2')
    expect(reviewRequests).toHaveLength(0)
    await expect(page.getByRole('region', { name: 'Fleet quote' })).toHaveCount(0)
    expect(state.launches).toBe(0)
    const inputBox = (await smallCargo.boundingBox())!
    const actionBox = (await fillCargo.boundingBox())!
    expect(actionBox.x + actionBox.width).toBe(inputBox.x + inputBox.width - 4)
    expect(actionBox.y).toBe(inputBox.y + 4)
    expect(actionBox.height).toBe(36)
    await expect(page.getByLabel('Destination preview')).toContainText('Ember Watch')
    if (width >= 768) await page.evaluate(() => window.scrollTo(0, 0))
    else await fleet.scrollIntoViewIfNeeded()
    await diagnosticScreenshot(page, { path: `test-results/dispatch-ship-fill-${width}x1000.png`, fullPage: width >= 768 })
    await diagnosticScreenshot(fleet, { path: `test-results/ship-fill-detail-${width}x1000.png` })
    state.bodies[0].inventories.push({ item: { kind: 'Ship', id: 'LightFighter' }, count: '7' })
    state.advanceRevision()
    await refreshGame(page)
    await expect(fleet.getByRole('button', { name: 'Max Light Fighter', exact: true })).toBeEnabled()
    await page.getByLabel('Metal', { exact: true }).fill('42')
    await smallCargo.fill('99')
    await page.getByLabel('Recycler · 1 available').fill('')
    await addAll.click()
    for (const [ship, count] of [['Light Fighter', '7'], ['Espionage Probe', '1'], ['Small Cargo', '2'], ['Recycler', '1'], ['Colony Ship', '1']]) {
      await expect(page.getByLabel(`${ship} · ${count} available`)).toHaveValue(count)
    }
    await addAll.click()
    await expect(smallCargo).toHaveValue('2')
    await expect(page.getByLabel('Metal', { exact: true })).toHaveValue('42')
    expect(reviewRequests).toHaveLength(0)
    await expect(page.getByRole('region', { name: 'Fleet quote' })).toHaveCount(0)
    expect(state.launches).toBe(0)
    await expect(page.getByRole('region', { name: 'Flight timing' }).locator('dd').first()).toHaveText('1m 40s')
    await page.mouse.move(0, 0)
    if (width >= 768) await page.evaluate(() => window.scrollTo(0, 0))
    else await fleet.scrollIntoViewIfNeeded()
    await diagnosticScreenshot(page, { path: `test-results/dispatch-fleet-filled-${width}x1000.png`, fullPage: width >= 768 })
    await diagnosticScreenshot(fleet, { path: `test-results/fleet-filled-detail-${width}x1000.png` })
    await diagnosticScreenshot(page.getByRole('group', { name: 'Cargo', exact: true }), { path: `test-results/cargo-fill-detail-${width}x1000.png` })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const quoted = page.waitForRequest(request => request.url().endsWith('/world') && request.postDataJSON().type === 'FleetQuote')
    await review(page).click()
    const request = (await quoted).postDataJSON()
    expect(reviewRequests).toHaveLength(1)
    expect(Object.fromEntries(request.intent.ships.map((ship: { ship_type: string; count: string }) => [ship.ship_type, ship.count]))).toEqual({ LightFighter: '7', EspionageProbe: '1', SmallCargo: '2', Recycler: '1', ColonyShip: '1' })
    expect(state.launches).toBe(0)
  })
}

test('Add All reads current inventory and disables on an empty origin', async ({ page }) => {
  const state = await setup(page)
  const originalCargo = body.inventories.find(stack => stack.item.id === 'SmallCargo')!.count
  const addAll = page.getByRole('button', { name: 'Add all ships', exact: true })
  const cargo = state.bodies[0].inventories.find(stack => stack.item.id === 'SmallCargo')!
  cargo.count = '9007199254740993'
  state.advanceRevision()
  await refreshGame(page)
  await addAll.click()
  await expect(page.getByLabel('Small Cargo · 9007199254740993 available')).toHaveValue('9007199254740993')
  cargo.count = '1'
  state.advanceRevision()
  await refreshGame(page)
  await addAll.click()
  await expect(page.getByLabel('Small Cargo · 1 available')).toHaveValue('1')
  state.bodies[1].inventories = []
  state.advanceRevision()
  await refreshGame(page)
  await selectBody(page, id(6))
  await expect(addAll).toBeDisabled()
  const fleet = page.getByRole('group', { name: 'Ships', exact: true })
  for (const fill of await fleet.getByRole('button', { name: /^Max / }).all()) await expect(fill).toBeDisabled()
  await expect(page.getByLabel('Small Cargo · 0 available')).toHaveValue('0')
  expect(body.inventories.find(stack => stack.item.id === 'SmallCargo')!.count).toBe(originalCargo)
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
