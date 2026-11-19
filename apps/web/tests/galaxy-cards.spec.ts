
import { routeWorld } from './fixtures/game'
import { focusPlayerDetails } from './fixtures/profile-navigation'

import { coordinatePattern } from './fixtures/coordinates'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { withGalaxyResponse } from './fixtures/galaxy'
import { test, expect, type Page } from './fixtures/test'
import {
  installGameFixture,
  shellFixture,
  refreshGame,
  playerProfilesFixture,
  body,
  binding,
  id,
} from './fixtures/game'
import type { components } from '../src/contracts'
import { trackFixtureResponses, withFixtureResponse, withBootstrapResponse } from './fixtures/responses'

async function setup(
  page: Page,
  blocker: components['schemas']['GameError4'] | null = 'BeginnerProtected',
  options: Parameters<typeof shellFixture>[1] = {},
  overrides: Record<
    number,
    Partial<components['schemas']['GalaxyPosition4']>
  > = {},
) {
  let revision = 1
  await installGameFixture(page, {
    protocol: 4,
    viewerRevision: () => String(revision),
    extraCapabilities: ['Attack', 'Espionage', 'Harvest'],
    bodies: [
      {
        ...body,
        inventories: [
          ...body.inventories,
          { item: { kind: 'Ship', id: 'EspionageProbe' }, count: '2' },
        ],
      },
    ],
    ...options,
  })
  let fail = false
  await routeWorld(page, async (route) => {
    const { context, galaxy, system } = route.request().postDataJSON()
    const sampledAt =
      typeof options.sampledAt === 'function'
        ? options.sampledAt()
        : (options.sampledAt ?? Date.now())
    if (fail)
      return route.fulfill({ status: 503, json: { code: 'Unavailable' } })
    await route.fulfill({
      json: {
        protocol: 4,
        binding,
        request_id: context.request_id,
        viewer_revision: options.viewerRevision?.() ?? String(revision),
        sampled_at: sampledAt,
        as_of_ms: sampledAt,
        data: {
          galaxy,
          system,
          observed_at: sampledAt,
          player_names: {
            [id(31)]: 'CommanderAndromedaTheUnreasonablyLongName',
          },
          positions: Array.from({ length: 15 }, (_, i) => ({
            coordinates: { galaxy, system, position: i + 1 },
            body:
              i < 3
                ? {
                    id: i === 0 ? body.id : id(i + 20),
                    kind: 'Planet',
                    owner: i === 0 ? binding.player : id(i === 1 ? 31 : 32),
                    activity: { type: 'Recent' },
                    inactivity: 'Active',
                    vacation: false,
                    attack_blocker: i === 2 ? blocker : null,
                    espionage_eligible:
                      i === 1 || (i === 2 && blocker === null),
                  }
                : null,
            debris:
              i === 1 || i === 3
                ? {
                    field_identity: id(40),
                    // Galaxy returns whole units, unlike report Resources.
                    metal: '900',
                    crystal: '1500',
                  }
                : null,
            ...overrides[i + 1],
          })),
        },
      },
    })
  })
  await withGalaxyResponse(page, () =>
    page.goto(`/u/andromeda/b/${body.id}/galaxy`),
  )
  return {
    setFailure: (value: boolean) => {
      fail = value
    },
    clearProtection: () => {
      blocker = null
      revision++
    },
  }
}

const rows = (page: Page) =>
  page.getByRole('region', { name: 'Galaxy positions' }).getByRole('article')
const actions = (page: Page, position: number) =>
  rows(page)
    .nth(position - 1)
    .getByRole('button', { name: /^Actions for \[/ })
const spy = (page: Page, position = 2) =>
  rows(page)
    .nth(position - 1)
    .getByRole('button', { name: /^(Spy on|Probe requested for) / })
const targetBody = (
  patch: Partial<
    NonNullable<components['schemas']['GalaxyPosition4']['body']>
  > = {},
): NonNullable<components['schemas']['GalaxyPosition4']['body']> => ({
  id: id(21),
  kind: 'Planet',
  owner: id(31),
  activity: { type: 'Recent' },
  inactivity: 'Active',
  vacation: false,
  attack_blocker: null,
  espionage_eligible: true,
  ...patch,
})
const debris = { field_identity: id(40), metal: '900', crystal: '1500' }

test('shared columns align all debris and controls; mobile rows reach both edges without horizontal overflow', async ({
  page,
}) => {
  await setup(
    page,
    null,
    {},
    { 3: { debris: { ...debris, metal: '999999999', crystal: '123456789' } } },
  )
  const controls = page.getByRole('group', { name: 'Galaxy controls' })
  const nav = page.locator('[data-sticky-navigation]')
  for (const width of [320, 390, 599, 600, 767, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 640 })
    await page.evaluate(() => window.scrollTo(0, 0))
    await expect(rows(page)).toHaveCount(15)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width)
    const measurements = await rows(page).evaluateAll((elements) =>
      elements.map((el) => {
        const rect = el.getBoundingClientRect()
        const art = el
          .querySelector('img[src*="/art/debris/"]')
          ?.getBoundingClientRect()
        const amounts = el
          .querySelector('[title="Metal"]')
          ?.getBoundingClientRect()
        const action = el
          .querySelector('button[aria-label^="Actions for"]')!
          .getBoundingClientRect()
        return {
          left: rect.left,
          right: rect.right,
          border: getComputedStyle(el).borderLeftWidth,
          art: art?.left,
          amounts: amounts?.left,
          action: action.left,
        }
      }),
    )
    expect(new Set(measurements.map((m) => m.action)).size).toBe(1)
    expect(
      new Set(measurements.filter((m) => m.art !== undefined).map((m) => m.art))
        .size,
    ).toBe(1)
    expect(
      new Set(
        measurements
          .filter((m) => m.amounts !== undefined)
          .map((m) => m.amounts),
      ).size,
    ).toBe(1)
    for (const measurement of measurements) {
      expect(measurement.border).toBe('0px')
      if (width <= 767) {
        expect(measurement.left).toBe(0)
        expect(measurement.right).toBe(width)
      }
    }
    const planet = await rows(page)
      .nth(1)
      .getByText('Planet', { exact: true })
      .boundingBox()
    const identity = await rows(page)
      .nth(1)
      .getByText('CommanderAndromedaTheUnreasonablyLongName', { exact: true })
      .boundingBox()
    expect(identity!.y).toBeGreaterThan(planet!.y)
    expect(measurements[1].art!).toBeGreaterThan(planet!.x + planet!.width)
    await expect(
      rows(page)
        .nth(1)
        .getByRole('button', { name: /^Spy on/ })
        .getByText('Spy', { exact: true }),
    ).toBeVisible({ visible: width >= 600 })
    await expect(actions(page, 2)).toHaveAttribute('aria-haspopup', 'menu')
    await page.evaluate(() => window.scrollTo(0, 400))
    await expect
      .poll(async () => {
        const tabs = (await (width < 768 ? nav : page.getByRole('group', { name: 'Planet and resources' }).locator('../..')).boundingBox())!,
          bar = (await controls.boundingBox())!
        return Math.abs(bar.y - tabs.y - tabs.height - (width >= 768 ? 1 : 0))
      })
      .toBeLessThanOrEqual(1)
    await expect(controls).toBeInViewport({ ratio: 1 })
    await expect(
      page.getByRole('region', { name: 'Galaxy positions' }),
    ).toHaveCSS('overflow', 'visible')
    await diagnosticScreenshot(page, {
      path: `test-results/galaxy-layout-${width}.png`,
    })
  }
})

test('Galaxy uses the signed-in supporter identity for the owned planet', async ({
  page,
}) => {
  await setup(page)
  await page.route('**/api/auth/config', (route) =>
    route.fulfill({ json: { mode: 'oidc', universes: [] } }),
  )
  await playerProfilesFixture(page, () => [
    { player: binding.player, username: 'StellarNomad', supporter_tier: 2 },
    { player: id(32), username: 'ProtectedCommander', supporter_tier: 1 },
  ])
  await withGalaxyResponse(page, () => page.reload())
  const cards = page
    .getByRole('region', { name: 'Galaxy positions' })
    .getByRole('listitem')
  await expect(
    cards.first().getByText('StellarNomad', { exact: true }),
  ).toBeVisible()
  await expect(
    cards.first().getByRole('img', { name: 'Supporter · $25 / month USD' }),
  ).toBeVisible()
  await expect(
    cards
      .nth(1)
      .getByText('CommanderAndromedaTheUnreasonablyLongName', { exact: true }),
  ).toBeVisible()
  await expect(
    cards.nth(1).getByRole('img', { name: /Supporter/ }),
  ).toHaveCount(0)
  await expect(
    cards.first().getByText('StellarNomad', { exact: true }),
  ).toHaveCSS('color', 'rgb(244, 244, 242)')
  const supporter = cards
    .first()
    .getByRole('img', { name: 'Supporter · $25 / month USD' })
  await expect(supporter).toHaveCSS('color', 'rgb(240, 172, 212)')
  await focusPlayerDetails(page, cards.first().getByRole('link', { name: 'StellarNomad profile details' }))
  await expect(page.getByRole('tooltip', { name: 'StellarNomad profile' })).toContainText(
    'does not affect gameplay strength or protection',
  )
  await page.keyboard.press('Escape')
  await expect(
    cards.nth(2).getByText('ProtectedCommander', { exact: true }),
  ).toHaveCSS('color', 'rgb(164, 232, 200)')
  await expect(
    cards.nth(2).getByRole('img', { name: 'Supporter · $10 / month USD' }),
  ).toHaveCSS('color', 'rgb(133, 214, 239)')
  await expect(
    cards
      .nth(2)
      .getByRole('button', { name: 'Beginner protection', exact: true }),
  ).toBeVisible()
  await diagnosticScreenshot(page, {
    path: 'test-results/supporter-live-galaxy.png',
    fullPage: true,
  })
})

test('one-click espionage stays in Galaxy, reserves one departure and tracks the outbound and return legs', { tag: '@journey' }, async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  let revision = 1
  const missions: components['schemas']['MissionView4'] = {
    fleets: [],
    incoming: [],
    score_value_micro: '0',
    fleet_slots: '3',
  }
  await setup(page, null, { missions, viewerRevision: () => String(revision) })
  const slots = page.getByRole('button', { name: /^Fleet slots: \d+ used \/ 3 total$/ })
  await expect(slots).toHaveText('Fleet slots0 / 3')
  let quotes = 0,
    launches = 0
  let releaseQuote!: () => void, releaseLaunch!: () => void
  const quoteGate = new Promise<void>((resolve) => {
    releaseQuote = resolve
  })
  const launchGate = new Promise<void>((resolve) => {
    releaseLaunch = resolve
  })
  const intents: components['schemas']['FleetIntent4'][] = []
  await routeWorld(page, async (route) => {
    const request = route.request().postDataJSON()
    if (request.type !== 'FleetQuote') return route.fallback()
    quotes++
    intents.push(request.intent)
    await quoteGate
    await route.fulfill({
      json: {
        protocol: 4,
        binding,
        request_id: request.context.request_id,
        viewer_revision: String(revision),
        sampled_at: Date.now(),
        as_of_ms: Date.now(),
        data: {
          intent: request.intent,
          profile_hash: 'a'.repeat(64),
          terms_hash: 'b'.repeat(64),
          distance: 1000,
          speeds: [['EspionageProbe', '100000000']],
          duration_ms: 120000,
          fuel: '1000000',
          capacity: '5000000',
          maximum_payload: '4000000',
          slot_limit: '3',
        },
      },
    })
  })
  await page.route('**/commands', async (route) => {
    launches++
    const { gameplay, presence } = route.request().postDataJSON()
    expect(presence.command.action.paired_command_id).toBe(gameplay.command_id)
    expect(gameplay.command.action.intent).toEqual(intents[0])
    await launchGate
    missions.fleets.push({
      id: id(80),
      intent: intents[0],
      origin: body.coordinates,
      destination: { galaxy: 1, system: 371, position: 2 },
      leg: 'Outbound',
      ships: [{ ship_type: 'EspionageProbe', count: '1' }],
      cargo: { metal: '0', crystal: '0', deuterium: '0' },
      due_at: Date.now() + 120000,
      launched_at: Date.now(),
      duration_ms: 120000,
      paid_fuel: '1000000',
      can_recall: true,
    })
    revision++
    await route.fulfill({
      json: {
        protocol: 4,
        binding,
        command_id: gameplay.command_id,
        admitted_at: Date.now(),
        executed_at: Date.now(),
        status: 'Committed',
        result_ids: [id(80)],
        minimum_viewer_revision: String(revision),
      },
    })
  })
  const rows = page
    .getByRole('region', { name: 'Galaxy positions' })
    .getByRole('listitem')
  const target = rows.nth(1)
  const originalRows = await rows.elementHandles()
  const pendingRefreshes: (() => void)[] = []
  await routeWorld(page, async (route) => {
    if (route.request().postDataJSON().type !== 'Galaxy')
      return route.fallback()
    await new Promise<void>((resolve) => {
      pendingRefreshes.push(resolve)
    })
    await route.fallback()
  })
  const finishRefresh = async (count: number) => {
    await expect.poll(() => pendingRefreshes.length).toBe(count)
    await expect(rows).toHaveCount(15)
    await expect(
      page.getByText('Loading system…', { exact: true }),
    ).toHaveCount(0)
    await expect(
      target.getByRole('button', { name: /^Actions for \[/ }),
    ).toBeVisible()
    for (const row of originalRows)
      expect(await row.evaluate((node) => node.isConnected)).toBe(true)
    const response = page.waitForResponse(
      (response) =>
        response.url().endsWith('/world') &&
        response.request().postDataJSON().type === 'Galaxy',
    )
    pendingRefreshes[count - 1]()
    await response
    await expect(
      target.getByRole('button', { name: /^Actions for \[/ }),
    ).toBeVisible()
  }
  const spy = target.getByRole('button', {
    name: /^(Spy on|Probe requested for) /,
  })
  await spy.evaluate((button) => {
    ;(button as HTMLButtonElement).click()
    ;(button as HTMLButtonElement).click()
  })
  await expect.poll(() => quotes).toBe(1)
  await expect(spy).toHaveAttribute('data-feedback', 'true')
  await expect(spy).toBeDisabled()
  releaseQuote()
  await expect.poll(() => launches).toBe(1)
  await expect(
    target.getByRole('button', { name: /^Your fleets to / }),
  ).toHaveText('1–…')
  await target.getByRole('button', { name: /^Your fleets to / }).click()
  await expect(page.getByRole('dialog', { name: 'Your fleets to [1:371:2]', exact: true })).toContainText('Espionage departure pending')
  await page.keyboard.press('Escape')
  await expect(slots).toHaveText('Fleet slots1 / 3')
  expect(intents[0]).toEqual({
    origin: body.id,
    destination: {
      type: 'Body',
      id: id(21),
      expected_owner: id(31),
      expected_kind: 'Planet',
    },
    mission: 'Espionage',
    ships: [{ owner: binding.player, ship_type: 'EspionageProbe', count: '1' }],
    cargo: { metal: '0', crystal: '0', deuterium: '0' },
    speed_percent: 100,
  })
  releaseLaunch()
  await finishRefresh(1)
  const probeToast = page.getByLabel('Recent game events').getByRole('button', { name: /Probe away/ })
  await expect(probeToast.locator('time')).toHaveAttribute('datetime', new Date(missions.fleets[0].due_at).toISOString())
  await expect(probeToast).toContainText('2 fleet slots available')
  await diagnosticScreenshot(page, { path: 'test-results/live-hud/probe-390x844.png' })
  await expect(slots).toHaveText('Fleet slots1 / 3')
  await expect(
    target.getByRole('button', { name: /^Your fleets to / }),
  ).toHaveText(/^1–\d+[ms]$/)
  await target.getByRole('button', { name: /^Your fleets to / }).click()
  await expect(page.getByRole('dialog', { name: 'Your fleets to [1:371:2]', exact: true })).toContainText('Espionage en route')
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/galaxy`)
  await expect(page.getByRole('region', { name: 'Fleet quote' })).toHaveCount(0)
  await diagnosticScreenshot(page, {
    path: 'test-results/galaxy-espionage-outbound.png',
  })
  await target.getByRole('button', { name: /^Actions for \[/ }).focus()
  const scrollY = await page.evaluate(() => window.scrollY)
  missions.fleets[0].leg = 'Returning'
  revision++
  await refreshGame(page)
  await finishRefresh(2)
  await expect(slots).toHaveText('Fleet slots1 / 3')
  await expect(
    target.getByRole('button', { name: /^Actions for \[/ }),
  ).toBeFocused()
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY)
  await expect(
    target.getByRole('button', { name: /^Your fleets to / }),
  ).toHaveCount(0)
  await expect(
    rows.first().getByRole('button', { name: /^Your fleets to / }),
  ).toHaveText(/^–1\d+[ms]$/)
  await rows.first().getByRole('button', { name: /^Your fleets to / }).click()
  await expect(page.getByRole('dialog', { name: 'Your fleets to [1:371:1]', exact: true })).toContainText('Espionage returning')
  await page.keyboard.press('Escape')
  await target.getByRole('button', { name: /^Actions for \[/ }).focus()
  missions.fleets = []
  revision++
  await refreshGame(page)
  await finishRefresh(3)
  await expect(slots).toHaveText('Fleet slots0 / 3')
  await expect(
    target.getByRole('button', { name: /^Actions for \[/ }),
  ).toBeFocused()
  await expect(
    rows.first().getByRole('button', { name: /^Your fleets to / }),
  ).toHaveCount(0)
  expect(quotes).toBe(1)
  expect(launches).toBe(1)
})

const recyclerCatalog: components['schemas']['CatalogEntry3'][] = [{
  key: { kind: 'Ship', id: 'Recycler' }, enabled: true, mobile: true,
  body_kinds: ['Planet'], requirements: [],
  ship_statistics: { combat: null, propulsion: { cargo_capacity: '20000', base_speed: '2000', fuel_consumption: '300', drive: 'CombustionDrive', impulse_upgrade: null } },
}]
async function setupHarvest(page: Page, count = '5', slots = '3') {
  await page.setViewportSize({ width: 390, height: 844 })
  await setup(page, null, {
    catalog: recyclerCatalog,
    bodies: [{ ...body, inventories: [{ item: { kind: 'Ship', id: 'Recycler' }, count }] }],
    missions: { fleets: [], incoming: [], fleet_slots: slots, score_value_micro: '0' },
  }, { 2: { debris: { field_identity: id(42), metal: '40000', crystal: '1' } } })
}
async function openHarvest(page: Page) {
  await actions(page, 2).press('Enter')
  await page.getByRole('menuitem', { name: 'Harvest', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'Harvest mission', exact: true })
  await expect(sheet).toBeVisible()
  return sheet
}
function harvestTerms(intent: components['schemas']['FleetIntent4']) {
  return { intent, profile_hash: 'a'.repeat(64), terms_hash: 'b'.repeat(64), distance: 1000, speeds: [['Recycler', '2000']], duration_ms: 120000, fuel: '1000000', capacity: '60000000000', maximum_payload: '60000000000', slot_limit: '3' }
}

test('mobile harvest quotes and sends one departure, stays in Galaxy and reserves ships and slots', { tag: '@journey' }, async ({ page }) => {
  await setupHarvest(page)
  let quotes = 0, launches = 0
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await routeWorld(page, async route => {
    const request = route.request().postDataJSON()
    if (request.type !== 'FleetQuote') return route.fallback()
    quotes++
    expect(request.intent).toEqual({ origin: body.id, mission: 'Harvest', destination: { type: 'Debris', coordinates: { galaxy: 1, system: 371, position: 2 }, field_identity: id(42) }, ships: [{ owner: binding.player, ship_type: 'Recycler', count: '3' }], cargo: { metal: '0', crystal: '0', deuterium: '0' }, speed_percent: 100 })
    await gate
    await route.fulfill({ json: { protocol: 4, binding, request_id: request.context.request_id, viewer_revision: '1', sampled_at: Date.now(), as_of_ms: Date.now(), data: harvestTerms(request.intent) } })
  })
  await page.route('**/commands', async route => {
    const { gameplay } = route.request().postDataJSON()
    if (gameplay.command.type !== 'World' || gameplay.command.action.type !== 'LaunchFleet') return route.fallback()
    launches++
    await route.fulfill({ json: { protocol: 4, binding, command_id: gameplay.command_id, admitted_at: Date.now(), executed_at: Date.now(), status: 'Committed', result_ids: [id(90)], minimum_viewer_revision: '2' } })
  })
  const sheet = await openHarvest(page)
  await sheet.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(sheet.getByRole('button', { name: 'Sending…', exact: true })).toBeDisabled()
  await expect.poll(() => quotes).toBe(1)
  release()
  await expect(sheet).not.toBeVisible()
  await expect(page).toHaveURL(/\/galaxy$/)
  expect(launches).toBe(1)
  await expect(page.getByLabel('Recent game events').getByRole('button', { name: /Fleet dispatched/ })).toContainText('2 fleet slots available')
  await diagnosticScreenshot(page, { path: 'test-results/live-hud/fleet-390x844.png' })
  await expect(page.getByRole('button', { name: 'Fleet slots: 1 used / 3 total', exact: true })).toBeVisible()
  const reopened = await openHarvest(page)
  await expect(reopened.getByRole('textbox', { name: 'Recyclers', exact: true })).toHaveValue('2')
})

for (const width of [390]) {
  test('Galaxy history closes the active Harvest popup and releases its shortcuts when entering Fleets and Dispatch', async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const now = Date.now()
    await page.clock.setFixedTime(now)
    const fleet: components['schemas']['OwnMission4'] = {
      id: id(80),
      intent: {
        origin: body.id,
        destination: { type: 'Body', id: id(6), expected_kind: 'Planet', expected_owner: binding.player },
        mission: 'Transport',
        ships: [{ owner: binding.player, ship_type: 'SmallCargo', count: '2' }],
        cargo: { metal: '100000000', crystal: '0', deuterium: '0' },
        speed_percent: 100,
      },
      origin: body.coordinates,
      destination: { galaxy: 1, system: 371, position: 13 },
      leg: 'Outbound',
      ships: [{ ship_type: 'SmallCargo', count: '2' }],
      cargo: { metal: '100000000', crystal: '0', deuterium: '0' },
      due_at: now + 180000,
      launched_at: now - 180000,
      duration_ms: 360000,
      paid_fuel: '1000000',
      can_recall: true,
    }
    await setup(page, null, {
      catalog: [{ key: { kind:'Ship',id:'SmallCargo' }, requirements:[],enabled:true,mobile:true,body_kinds:['Planet'] }, ...recyclerCatalog],
      bodies:[{...body,inventories:[...body.inventories,{item:{kind:'Ship',id:'Recycler'},count:'5'}]}],
      missions: {
        fleets: [fleet, { ...fleet, id: id(81), leg: 'Returning' }],
        incoming: [{ sender: id(9), origin: { galaxy: 1, system: 372, position: 3 }, target: body.id, mission: 'Transport', arrival_at: now + 300000, ships: { visibility: 'Unknown' } }],
        score_value_micro: '0', fleet_slots: '4',
      },
    })
    const nav = page.getByRole('navigation', { name: 'Main navigation' })
    for (const layoutWidth of [320,768,1440,width]) {
      await page.setViewportSize({width:layoutWidth,height:900})
    await expect(nav.getByRole('link')).toHaveText(layoutWidth >= 1024
      ? ['Empire', 'Develop', 'Resources', 'Facilities', 'Research', 'Shipyard', 'Defense', 'Galaxy', 'Fleets', 'Reports', 'Combat Simulator', 'Alliance', 'Messages', 'High Scores']
      : ['Empire', 'Develop', 'Galaxy', 'Fleets', 'Menu'])
    }
    const galaxy = nav.getByRole('link', { name: 'Galaxy', exact: true })
    const fleets = nav.getByRole('link', { name: 'Fleets', exact: true })
    await galaxy.click()
    await expect(galaxy).toHaveAttribute('aria-current', 'page')
    await expect(fleets).not.toHaveAttribute('aria-current')
    await expect(page.getByRole('navigation', { name: 'Fleet navigation' })).toHaveCount(0)
    await expect(rows(page)).toHaveCount(15)
    const capture = async (screen: string) => {
      for(const layoutWidth of [320,768,1440,width]) {
        await page.setViewportSize({width:layoutWidth,height:900})
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(layoutWidth)
        if(layoutWidth===390||layoutWidth===1440) await diagnosticScreenshot(page,{path:`test-results/navigation-${screen}-${layoutWidth}x900.png`,animations:'disabled'})
      }
    }
    await capture('galaxy')
    const system = page.getByRole('textbox', {name:'Solar system',exact:true})
    const next = page.getByRole('button', {name:'Next system',exact:true})
    await page.setViewportSize({width:1280,height:844})
    await next.focus()
    await withGalaxyResponse(page,()=>page.keyboard.press('ArrowRight'))
    await expect(page).toHaveURL(/galaxy=1&system=372$/)
    await expect(system).toHaveValue('372')
    const harvest = await openHarvest(page)
    await expect(harvest).toContainText('Debris at [1:372:2]')
    await withGalaxyResponse(page,()=>page.goBack())
    await expect(system).toHaveValue('371')
    await expect(harvest).toBeHidden()
    await withGalaxyResponse(page,()=>page.goForward())
    await expect(rows(page).nth(1)).toContainText('[1:372:2]')
    await expect(harvest).toBeHidden()
    await expect(actions(page,2)).toBeEnabled()
    await next.focus()
    await withGalaxyResponse(page,()=>page.keyboard.press('ArrowLeft'))
    await expect(page).toHaveURL(/galaxy=1&system=371$/)
    await page.setViewportSize({width,height:900})
    await withGalaxyResponse(page,()=>next.click())
    await expect(rows(page).first()).toContainText('[1:372:1]')
    await fleets.click()
    await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/fleets`)
    await expect(fleets).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('region',{name:'Galaxy browser'})).toHaveCount(0)
    await page.keyboard.press('ArrowRight')
    await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/fleets`)
    await expect(page.getByRole('heading', { name: 'Transport Outbound' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Transport Returning' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Empire fleet traffic' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Fleet navigation' })).toHaveCount(0)
    await capture('fleets')
    await page.getByRole('link', { name: 'Dispatch Fleet', exact: true }).click()
    await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/dispatch`)
    await expect(fleets).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('region',{name:'Galaxy browser'})).toHaveCount(0)
    await page.keyboard.press('ArrowRight')
    await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/dispatch`)
    await expect(page.getByRole('textbox', { name: 'Destination coordinates' })).toBeVisible()
    await expect(page.getByText('Looking up destination…', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('textbox', { name: /^Small Cargo/ })).toBeVisible()
    await page.getByRole('textbox', { name: 'Destination coordinates' }).fill('1:371:2')
    await expect(page.getByLabel('Destination preview')).toContainText('CommanderAndromedaTheUnreasonablyLongName')
    await capture('dispatch')
    await page.getByRole('link', { name: 'Back to fleets', exact: true }).click()
    await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/fleets`)
    await expect(page.getByRole('heading', { name: 'Transport Outbound' })).toBeVisible()
    // A direct Dispatch load also offers a deterministic return to the list.
    await withBootstrapResponse(page, () => page.goto(`/u/andromeda/b/${body.id}/dispatch`))
    await page.getByRole('link', { name: 'Back to fleets', exact: true }).click()
    await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/fleets`)
  })
}

test('desktop Harvest keeps its Actions anchor when the planet changes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  let revision = 1
  const positions = { 2: { body: targetBody() } }
  await setup(page, null, {
    viewerRevision: () => String(revision),
    catalog: recyclerCatalog,
    bodies: [{ ...body, inventories: [{ item: { kind: 'Ship', id: 'Recycler' }, count: '5' }] }],
    missions: { fleets: [], incoming: [], fleet_slots: '3', score_value_micro: '0' },
  }, positions)
  const trigger = await actions(page, 2).elementHandle()
  const popover = await openHarvest(page)
  const input = popover.getByRole('textbox', { name: 'Recyclers', exact: true })
  await input.fill('2')
  positions[2].body = targetBody({ id: id(92), owner: id(93), name: 'Replacement planet' })
  revision++
  await refreshGame(page)
  await expect(rows(page).nth(1)).toContainText('Replacement planet')
  expect(await trigger!.evaluate(el => el.isConnected)).toBe(true)
  await expect(popover).toBeVisible()
  await expect(input).toHaveValue('2')
  const anchor = (await actions(page, 2).boundingBox())!
  const box = (await popover.boundingBox())!
  expect(box.x + box.width).toBeCloseTo(anchor.x + anchor.width, 0)
  expect(box.y).toBeCloseTo(anchor.y + anchor.height + 8, 0)
  await page.keyboard.press('Escape')
  await expect(popover).not.toBeVisible()
  await expect(actions(page, 2)).toBeFocused()
})

// Browser regression: Settings -> Galaxy wiring, reload and exact Spy submission.


// Browser regression: failed preference requests preserve edits and offer recovery.
for (const width of [390]) {
  test(`probe settings recover from a failed save at ${width}px`, async ({ page }) => {
    const preferenceResponse = (action: () => Promise<unknown>) => withFixtureResponse(page, (response) => response.url().endsWith('/player-preferences'), action)
    const settlePreferences = trackFixtureResponses(page, (request) => request.url().endsWith('/player-preferences'))
    await page.setViewportSize({ width, height: 844 })
    await setup(page, null, { missions: { fleets: [], incoming: [], score_value_micro: '0', fleet_slots: '3' } })
    await expect(spy(page)).toBeEnabled()
    await expect(page.getByText(/Spy sends|Change probe count/)).toHaveCount(0)
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    await page.route('**/player-preferences', async (route) => {
      await gate
      await route.fallback()
    })
    const loaded = withFixtureResponse(page, (response) => response.url().endsWith('/player-preferences'), () => page.goto(`/u/andromeda/b/${body.id}/settings/game`))
    const field = page.getByRole('textbox', { name: 'Probes per spy mission' })
    await expect(field).toBeDisabled()
    await diagnosticScreenshot(page, { path: `test-results/probe-settings-loading-${width}x844.png` })
    release()
    await loaded
    await expect(field).toBeEnabled()
    await field.fill('0')
    await expect(page.getByText('Enter a positive whole number.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save probe count' })).toBeDisabled()
    await diagnosticScreenshot(page, { path: `test-results/probe-settings-invalid-${width}x844.png` })
    await field.fill('4')
    await page.route('**/player-preferences', (route) => route.fulfill({ status: 503, json: { code: 'Unavailable' } }), { times: 1 })
    await page.getByRole('button', { name: 'Save probe count' }).click()
    await expect(page.getByText('Could not confirm the saved probe count. Reload the setting before trying again.')).toBeVisible()
    // Rendering the failure can precede requestfinished; settle it before listening for the reload.
    await settlePreferences()
    await expect(field).toHaveValue('4')
    await expect(page.getByRole('button', { name: 'Save probe count' })).toBeDisabled()
    await diagnosticScreenshot(page, { path: `test-results/probe-settings-error-${width}x844.png` })
    await withFixtureResponse(page, (response) => response.url().endsWith('/player-preferences') && !response.request().postDataJSON().preferences, () => page.getByRole('button', { name: 'Reload probe count' }).click())
    await expect(field).toHaveValue('4')
    await expect(page.getByRole('button', { name: 'Save probe count' })).toBeEnabled()
    await withFixtureResponse(page, (response) => response.url().endsWith('/player-preferences'), () => page.getByRole('button', { name: 'Save probe count' }).click())
    await expect(page.getByText('Probe count saved.')).toBeVisible()
    await preferenceResponse(() => page.reload())
    await expect(field).toHaveValue('4')
    await withGalaxyResponse(page, () => page.goto(`/u/andromeda/b/${body.id}/galaxy`))
    await expect(page.getByText(/Spy sends|Change probe count/)).toHaveCount(0)
    await expect(spy(page)).toBeDisabled()
    await expect(spy(page)).toHaveAttribute('title', 'Not enough espionage probes: 4 required, 2 available on the selected world.')
    await diagnosticScreenshot(page, { path: `test-results/probe-galaxy-insufficient-${width}x844.png` })
    await preferenceResponse(() => page.goto(`/u/andromeda/b/${body.id}/settings/game`))
    await field.fill('2')
    await preferenceResponse(() => page.getByRole('button', { name: 'Save probe count' }).click())
    await expect(page.getByText('Probe count saved.')).toBeVisible()
    await diagnosticScreenshot(page, { path: `test-results/probe-settings-saved-${width}x844.png` })
    await withGalaxyResponse(page, () => page.goto(`/u/andromeda/b/${body.id}/galaxy`))
    await expect(spy(page)).toBeEnabled()
    await expect(spy(page)).toHaveAttribute('title', 'Send 2 espionage probes')
    await diagnosticScreenshot(page, { path: `test-results/probe-galaxy-ready-${width}x844.png` })
    await routeWorld(page, async (route) => {
      const request = route.request().postDataJSON()
      if (request.type !== 'FleetQuote') return route.fallback()
      expect(request.intent.ships).toEqual([{ owner: binding.player, ship_type: 'EspionageProbe', count: '2' }])
      await route.fulfill({ json: { protocol: 4, binding, request_id: request.context.request_id,
        viewer_revision: '1', sampled_at: Date.now(), as_of_ms: Date.now(), data: {
          intent: request.intent, profile_hash: 'a'.repeat(64), terms_hash: 'b'.repeat(64), distance: 1000,
          speeds: [['EspionageProbe', '100000000']], duration_ms: 120000, fuel: '1000000', capacity: '10000000', maximum_payload: '9000000', slot_limit: '3',
        } } })
    })
    await page.route('**/commands', async (route) => {
      const { gameplay } = route.request().postDataJSON()
      expect(gameplay.command.action.intent.ships[0].count).toBe('2')
      await route.fulfill({ json: { protocol: 4, binding, command_id: gameplay.command_id, admitted_at: Date.now(), executed_at: Date.now(), status: 'Committed', result_ids: [id(80)], minimum_viewer_revision: '2' } })
    })
    await withFixtureResponse(page, (response) => response.url().endsWith('/commands'), () => spy(page).click())
    await expect(rows(page).nth(1).getByRole('button', { name: /^Your fleets to / })).toHaveText('1–…')
    await expect(page).toHaveURL(new RegExp(`/b/${body.id}/galaxy`))
    await diagnosticScreenshot(page, { path: `test-results/probe-galaxy-sent-${width}x844.png` })
  })
}


// Regression: customization must navigate with the exact body target and mission,
// expose editable probe quantities, and never submit the one-click spy command.
for (const [width, target] of [[1280, 'planet']] as const) {
  test(`Spy with opens an editable ${target} espionage draft at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    let commands = 0
    page.on('request', (request) => {
      if (request.url().endsWith('/commands')) commands++
    })
    await setup(
      page,
      null,
      {
        catalog: [
          {
            key: { kind: 'Ship', id: 'EspionageProbe' },
            body_kinds: ['Planet', 'Moon'],
            requirements: [],
            enabled: true,
            mobile: true,
          },
        ],
        missions: {
          fleets: [],
          incoming: [],
          fleet_slots: '3',
          score_value_micro: '0',
        },
      },
      {
        2: { moon: { id: id(70), name: 'Selene', diameter_km: 8500 } },
      },
    )
    await page.route('**/player-preferences', async (route) => {
      const request = route.request().postDataJSON()
      await route.fulfill({
        json: { ...request.context, preferences: { galaxy_probe_count: '3' } },
      })
    })
    await withGalaxyResponse(page, () => page.reload())
    // The saved quick-spy count exceeds our two probes; customization still works.
    await expect(spy(page)).toBeDisabled()
    await actions(page, 2).press('Enter')
    const customize = page.getByRole('menuitem', {
      name: 'Spy with…',
      exact: true,
    })
    await expect(customize).toBeEnabled()
    await diagnosticScreenshot(page, {
      path: `test-results/galaxy-spy-menu-${width}x900.png`,
    })
    await customize.focus()
    await withGalaxyResponse(page, () => customize.press('Enter'))
    await expect(page).toHaveURL(new RegExp(`/b/${body.id}/dispatch\\?`))
    await expect(page.getByRole('radio', { checked: true })).toHaveValue(
      'Espionage',
    )
    await expect(
      page.getByLabel('Destination coordinates', { exact: true }),
    ).toHaveValue(coordinatePattern('system', '371'))
    await expect(
      page.getByLabel('Destination coordinates', { exact: true }),
    ).toHaveValue(coordinatePattern('position', '2'))
    expect(new URL(page.url()).searchParams.get('target')).toBe(target)
    const probes = page.getByRole('textbox', {
      name: 'Espionage Probe · 2 available',
      exact: true,
    })
    await expect(probes).toBeVisible()
    await probes.fill('2')
    await expect(probes).toHaveValue('2')
    expect(commands).toBe(0)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width)
    await diagnosticScreenshot(page, {
      path: `test-results/galaxy-spy-dispatch-${width}x900.png`,
      fullPage: true,
    })
  })
}

// This journey protects hotkey-to-router wiring and real system response delivery.
