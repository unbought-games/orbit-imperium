import { routeWorld } from './fixtures/game'
import { withFixtureResponse, withReportResponse } from './fixtures/responses'
import { setDestination } from './fixtures/coordinates'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { test, expect, type Page, type Route } from './fixtures/test'
import { installGameFixture, playerProfilesFixture, refreshGame, body, binding, id } from './fixtures/game'
import { selectBody } from './fixtures/body-selector'
import type { components } from '../src/contracts'
import reportObservation from '../../../contracts/fixtures/espionage-expanded.json' with { type: 'json' }
type S = components['schemas']

async function setup(page: Page, options: { beforeNavigation?: () => Promise<void>; omitPlayerNames?: boolean; colonyKind?: 'Planet' | 'Moon' } = {}) {
  const colony = {
    ...structuredClone(body),
    id: id(6),
    kind: options.colonyKind ?? 'Planet',
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
  const capabilities: NonNullable<Parameters<typeof installGameFixture>[1]>['extraCapabilities'] = [
    'Attack', 'Espionage', 'Harvest', 'Deploy', 'Reports', 'Colonize',
  ]
  let revision = 1
  // Install the fixture without loading an unrelated overview first. The direct
  // Dispatch navigation below gates complete bootstrap delivery.
  await installGameFixture(page, {
    viewerRevision: () => String(revision),
    protocol: 4,
    homeworldId: body.id,
    bodies,
    missions: { fleets: [], incoming: [], score_value_micro: '0', fleet_slots: '5' },
    playerNames: options.omitPlayerNames ? undefined : { [binding.player]: 'Commander' },
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
    capacity: '5000000000',
    maximumPayload: '4999000000',
    resolves: 0,
    quotes: 0,
    estimates: 0,
    launches: 0,
    hold: null as ((route: Route) => Promise<void>) | null,
  }
  await routeWorld(page, async (route) => {
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
                expected_kind: query.selection.kind,
                expected_owner: own ? binding.player : id(30),
              })
    } else {
      if (query.type === 'FleetEstimate') state.estimates++
      else state.quotes++
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
        capacity: state.capacity,
        maximum_payload: state.maximumPayload,
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
  await playerProfilesFixture(page, () => [{ player: binding.player, username: 'Commander' }])
  await options.beforeNavigation?.()
  await withFixtureResponse(page, response => new URL(response.url()).pathname === '/api/v1/bootstrap', () =>
    page.goto(`/u/andromeda/b/${body.id}/dispatch`),
  )
  // Cold route compilation can share the host with other fixture workers.
  await expect(page.locator('main h1')).toHaveText('Dispatch', { timeout: 30000 })
  await expect(
    page.getByText('Latest departure order', { exact: true }),
  ).toHaveCount(0)
  await expect(page.getByText('Mission rules', { exact: true })).toHaveCount(0)
  await page.getByLabel('Small Cargo · 2 available').fill('1')
  return state
}

async function selectDestinationPlanet(page: Page, id: string) {
  const picker = page.getByRole('combobox', { name: 'Your planets and moons' })
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
  await withReportResponse(page, reportId, () => page.goto(`/u/andromeda/b/${body.id}/reports/${reportId}`))
  await page.getByRole('button', { name: 'Attack', exact: true }).click()
  await expect(mission(page)).toHaveValue('Attack')
  await expect(
    page.getByText('Prepared from an observation at', { exact: false }),
  ).toBeVisible()
  await page.getByLabel('Small Cargo · 2 available').fill('1')
}

// Historical report routing and a real launch exercise the application boundary.
// Manual intent construction is covered by dispatch-requests.test.ts and the reset journey below.
for (const historical of [true]) {
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
        await page.getByRole('button', { name: 'Back to edit mission' }).click()
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
  await page.getByRole('button', { name: 'Back to edit mission' }).click()
  await expect(ship).toHaveValue('1')
  for (const field of cargo) await expect(field).toHaveValue('42')
  await review(page).click()
  await page
    .getByRole('button', {
      name: /^(Attack with|Spy with|Harvest with|Colonize with|Transport to|Deploy to) /,
    })
    .click()
  await expect(ship).toHaveValue('0')
  await expect(page.getByLabel('Light Fighter · 0 available')).toHaveCount(0)
  await page.getByRole('button', { name: /^Show all ships/ }).click()
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
  await page.getByRole('button', { name: 'Back to edit mission' }).click()
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
    const feedback = outcome === 'Pending' ? dispatchResult(page) : page.getByTestId('game-error-banner').getByRole('group', { name: 'Order status' })
    if (outcome !== 'Pending') await expect(dispatchResult(page)).toHaveCount(0)
    await expect(feedback).toContainText(
      outcome === 'Pending'
        ? 'Order accepted. Waiting for launch confirmation…'
        : outcome === 'Rejected'
          ? 'Fleet not sent: Beginner protection prevents'
          : 'We’re checking whether this order went through.',
    )
    await expect(feedback).not.toContainText('Fleet sent.')
    await expect(page.getByLabel(/Small Cargo · \d+ available/)).toHaveValue(
      '1',
    )
    await review(page).scrollIntoViewIfNeeded()
    await diagnosticScreenshot(page, {
      path: `test-results/dispatch-${outcome}.png`,
    })
    if (outcome === 'uncertain') {
      for (const width of [1280, 390]) {
        await page.setViewportSize({ width, height: 900 })
        await page.evaluate(() => window.scrollTo(0, 0))
        await diagnosticScreenshot(page, { path: `test-results/unified-fleet-error-${width}x900.png`, fullPage: true })
      }
      // Background receipt polling may arrive before Playwright clicks Retry.
      // Hold recovery until the click so polling cannot remove its own target.
      let releaseRecovery!: () => void
      const recovery = new Promise<void>((resolve) => { releaseRecovery = resolve })
      const polling = page.waitForRequest('**/commands/*?epoch=*')
      await page.route('**/commands/*?epoch=*', async (route) => {
        await recovery
        await route.fulfill({
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
        })
      })
      try {
        await polling
        await feedback
          .getByRole('button', { name: 'Retry order' })
          .click()
      } finally {
        releaseRecovery()
      }
      await expect(dispatchResult(page)).toContainText('Fleet sent.')
      await expect(page.getByLabel('Small Cargo · 2 available')).toHaveValue(
        '0',
      )
    }
    expect(launches).toBe(1)
  })
}


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
  // Timing requests read-only estimates before the explicit review step.
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

for (const width of [320]) {
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
    await page.getByRole('button', { name: 'Back to edit mission', exact: true }).click()
    await expect(review(page)).toBeFocused()
    await page.getByRole('link', { name: 'Back to fleets', exact: true }).click()
    await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/fleets`)
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
