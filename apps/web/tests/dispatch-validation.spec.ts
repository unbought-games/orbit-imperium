import { routeWorld } from './fixtures/game'
import { withFixtureResponse } from './fixtures/responses'

import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { test, expect, type Page, type Route } from './fixtures/test'
import { installGameFixture, playerProfilesFixture, body, binding, id } from './fixtures/game'
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
    liveQuote: null as { cargo: S['Resources']; hash: string } | null,
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
      const live = query.type === 'FleetQuote' && query.intent.cargo_fill ? state.liveQuote : null
      data = {
        intent: live ? { ...query.intent, cargo: live.cargo } : query.intent,
        profile_hash: 'a'.repeat(64),
        ...(query.type === 'FleetEstimate' ? { estimate: true } : { distance: 1000, speeds: [], slot_limit: '1', terms_hash: live?.hash ?? 'b'.repeat(64) }),
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

// Historical report routing and a real launch exercise the application boundary.
// Manual intent construction is covered by dispatch-requests.test.ts and the reset journey below.


test(
  'successful dispatch resets ship and cargo quantities after preserving edits through review',
  async ({ page }) => {
    const state = await setup(page)
    state.launchError = null
    const ship = page.getByLabel('Small Cargo · 2 available')
    const cargo = ['Metal', 'Crystal', 'Deuterium'].map((name) =>
      page.getByRole('textbox', { name, exact: true }),
    )
    for (const field of cargo) await field.fill('42')
    const content = page.locator('main')
    for (const width of [390, 767, 768, 1199, 1200, 1440, 1599, 1600, 1920]) {
      await page.setViewportSize({ width, height: 1000 })
      const cap =
        width >= 1600
          ? 896
          : width >= 1200
            ? 768
            : width >= 768
              ? 640
              : Infinity
      const geometry = await content.evaluate((element) => {
        const current = element.getBoundingClientRect()
        const parent = element.parentElement!.getBoundingClientRect()
        return {
          width: current.width,
          center: current.x + current.width / 2,
          available: parent.width,
          parentCenter: parent.x + parent.width / 2,
        }
      })
      expect(geometry.width).toBeCloseTo(Math.min(cap, geometry.available), 0)
      expect(geometry.center).toBeCloseTo(geometry.parentCenter, 0)
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
      await expect(page.getByLabel('Small Cargo · 2 available')).toHaveValue(
        '1',
      )
      if ([390, 768, 1440, 1920].includes(width)) {
        await page.evaluate(() => window.scrollTo(0, 0))
        await diagnosticScreenshot(page, {
          path: `test-results/dispatch-centered-${width}x1000.png`,
          fullPage: width >= 768,
        })
      }
    }
    await review(page).click()
    await expect(
      page.getByRole('region', { name: 'Fleet quote' }),
    ).toBeVisible()
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      const geometry = await content.evaluate((element) => {
        const rect = element.getBoundingClientRect(),
          parent = element.parentElement!.getBoundingClientRect()
        return {
          width: rect.width,
          available: parent.width,
          center: rect.x + rect.width / 2,
          parentCenter: parent.x + parent.width / 2,
        }
      })
      expect(geometry.width).toBeCloseTo(
        Math.min(width === 1440 ? 768 : Infinity, geometry.available),
        0,
      )
      expect(geometry.center).toBeCloseTo(geometry.parentCenter, 0)
      await page.evaluate(() => window.scrollTo(0, 0))
      await diagnosticScreenshot(page, {
        path: `test-results/dispatch-centered-review-${width}x1000.png`,
        fullPage: true,
      })
    }
    await page.getByRole('button', { name: 'Back to edit mission' }).click()
    await expect(review(page)).toBeFocused()
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
    await expect(page.getByLabel('Light Fighter · 0 available')).toHaveValue(
      '0',
    )
    for (const field of cargo) await expect(field).toHaveValue('0')
    await expect(
      page.getByRole('region', { name: 'Flight timing' }).locator('p'),
    ).toHaveText('Select ships to see flight times.')
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
    await page
      .getByRole('link', { name: 'Back to fleets', exact: true })
      .click()
    await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/fleets`)
  },
)

for (const width of [390]) {
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
      const onWorlds = metal.getByTitle('On planets and moons').locator('dd')
      const launching = metal.locator('dl > div').filter({ hasText: 'Launching' })
      await expect(launching.locator('dd')).toHaveText('42')
      await expect(metal.locator('strong')).toHaveText('13,323')
      await expect(onWorlds).toHaveText('13,281')
      await expect(deuterium.locator('strong')).toHaveText('6,243')
      for (const layoutWidth of [1440,width]) {
        await page.setViewportSize({width:layoutWidth,height:1000})
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        for (const group of await ledger.getByRole('group').all()) {
          const centers = await group.locator('dt > svg').evaluateAll(icons => icons.map(icon => {
            const box = icon.getBoundingClientRect()
            return box.x + box.width / 2
          }))
          expect(Math.max(...centers) - Math.min(...centers)).toBeLessThan(1)
        }
      }
      await diagnosticScreenshot(ledger, { path: `test-results/empire-wealth-launching-${width}x1000.png` })
      release()
      await expect(launching).toHaveCount(0)
      await expect(metal.locator('strong')).toHaveText('13,323')
      await expect(onWorlds).toHaveText('13,323')
      await expect(deuterium.locator('strong')).toHaveText('6,244')
      await diagnosticScreenshot(ledger, { path: `test-results/empire-wealth-rejected-${width}x1000.png` })
    } finally {
      release()
    }
  })
}

test(
  'browser Back restores only the active review and waits for fresh fleet terms',
  async ({ page }) => {
    const state = await setup(page)
    const metal = page.getByRole('textbox', { name: 'Metal', exact: true })
    await metal.fill('42')
    const fleetQuote = (response: import('@playwright/test').Response) =>
      response.url().endsWith('/world') &&
      response.request().postDataJSON().type === 'FleetQuote'
    await withFixtureResponse(page, fleetQuote, () => review(page).click())
    const reviewPath = `/u/andromeda/b/${body.id}/dispatch/review`
    await expect(page).toHaveURL(reviewPath)
    const quote = page.getByRole('region', { name: 'Fleet quote' })
    const send = quote.getByRole('button', { name: /Transport to/ })
    await expect(send).toBeEnabled()

    const leave = () =>
      page.getByRole('link', { name: 'Fleets', exact: true }).click()
    await leave()
    const newDispatch = page.getByRole('link', { name: 'Dispatch Fleet' })
    await expect(newDispatch).toBeVisible()

    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    state.hold = async (route) => {
      if (route.request().postDataJSON().type === 'FleetQuote') await held
    }
    try {
      const request = page.waitForRequest(
        (r) =>
          r.url().endsWith('/world') && r.postDataJSON().type === 'FleetQuote',
      )
      await page.goBack()
      expect((await request).postDataJSON().intent).toMatchObject({
        mission: 'Transport',
        ships: [{ ship_type: 'SmallCargo', count: '1' }],
        cargo: { metal: '42000000' },
      })
      await expect(send).toBeDisabled()
      await expect(
        quote.getByRole('list', { name: 'Ship composition' }),
      ).toContainText('Small Cargo 1')
      await expect(
        quote.getByRole('region', { name: 'Fleet and cargo' }),
      ).toContainText('42')
      await withFixtureResponse(page, fleetQuote, async () => release())
      await expect(send).toBeEnabled()
      expect(state.launches).toBe(0)
    } finally {
      release()
      state.hold = null
    }

    await leave()
    await newDispatch.click()
    await expect(metal).toHaveValue('0')
    await page.goBack()
    await expect(newDispatch).toBeVisible()
    await page.goBack()
    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: 'This fleet review has ended' }),
    ).toBeVisible()
    await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/dispatch`)
    await expect(page.getByLabel('Small Cargo · 2 available')).toHaveValue('0')
    await expect(quote).toHaveCount(0)
  },
)


test('a launch-time cargo change preserves the routed review and Edit cargo reopens its dispatch', async ({ page }) => {
  const state = await setup(page)
  const dispatchPath = `/u/andromeda/b/${body.id}/dispatch`
  const terms = (units: number, hash: string) => ({
    cargo: { metal: '0', crystal: '0', deuterium: String(units * 1000000) },
    hash: hash.repeat(64),
  })
  const fleetQuote = (response: import('@playwright/test').Response) => {
    if (!response.url().endsWith('/world')) return false
    const request = response.request().postDataJSON()
    return request.type === 'FleetQuote' && request.intent.origin === body.id && request.intent.mission === 'Deploy'
  }
  await page.getByRole('radio', {name:'Deploy',exact:true}).check()
  await selectDestinationPlanet(page, id(6))
  await page.getByRole('button', {name:'Max deuterium', exact:true}).click()
  const field = page.getByRole('textbox', {name:'Deuterium', exact:true})
  await expect(field).toHaveValue('3121')
  const original = terms(3000, 'a')
  state.liveQuote = original
  await withFixtureResponse(page, fleetQuote, () => review(page).click())
  const panel = page.getByRole('region', {name:'Fleet quote'})
  const cargo = panel.getByRole('region', {name:'Fleet and cargo'})
  await expect(page).toHaveURL(dispatchPath + '/review')
  await expect(cargo).toContainText('3,000')

  state.liveQuote = terms(3200, 'c')
  await withFixtureResponse(page, fleetQuote, () => page.evaluate(() => window.dispatchEvent(new Event('focus'))))
  await expect(cargo).toContainText('3,200')
  // A minor background refresh must not replace the player's consent baseline.
  state.liveQuote = terms(1500, 'e')
  state.launchError = 'QuoteChanged'
  const command = page.waitForRequest(r => r.url().endsWith('/commands') && r.postDataJSON()?.gameplay?.command?.action?.type === 'LaunchFleet')
  await withFixtureResponse(page, fleetQuote, () => panel.getByRole('button', {name:/^Deploy to/}).click())
  expect((await command).postDataJSON().gameplay.command.action).toMatchObject({
    intent: {
      cargo: original.cargo,
      cargo_fill: { minimum: {metal:'0', crystal:'0', deuterium:'0'}, groups:[['Deuterium']] },
    },
    expected_terms_hash: original.hash,
  })
  await expect(panel.getByRole('status')).toContainText(/3,000.*1,500/)
  await expect(panel.getByRole('button',{name:'Confirm changes and launch'})).toBeEnabled()
  await expect(page).toHaveURL(dispatchPath + '/review')
  expect(state.launches).toBe(1)

  // Returning to this replacement entry retains the reviewed baseline.
  await page.getByRole('link', {name:'Fleets',exact:true}).click()
  await expect(page.getByRole('link', {name:'Dispatch Fleet'})).toBeVisible()
  await withFixtureResponse(page, fleetQuote, () => page.goBack())
  await expect(panel.getByRole('status')).toContainText(/3,000.*1,500/)
  await expect(panel.getByRole('button',{name:'Confirm changes and launch'})).toBeEnabled()

  await panel.getByRole('button', {name:'Edit cargo'}).click()
  await expect(page).toHaveURL(dispatchPath)
  await field.fill('1000')
  await withFixtureResponse(page, fleetQuote, () => review(page).click())
  await expect(page).toHaveURL(dispatchPath + '/review')
  await expect(cargo).toContainText('1,000')
  state.launchError = null
  const exact = page.waitForRequest(r => r.url().endsWith('/commands') && r.postDataJSON()?.gameplay?.command?.action?.type === 'LaunchFleet')
  await panel.getByRole('button', {name:/^Deploy to/}).click()
  const intent = (await exact).postDataJSON().gameplay.command.action.intent
  expect(intent.cargo.deuterium).toBe('1000000000')
  expect(intent.cargo_fill).toBeUndefined()
  await expect(dispatchResult(page)).toContainText('Fleet sent.')
  await expect(page).toHaveURL(dispatchPath)
})
