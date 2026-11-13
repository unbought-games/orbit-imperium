import { routeWorld } from './fixtures/game'
import { withFixtureResponse } from './fixtures/responses'
import { menuDestination } from './fixtures/navigation'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { test, expect } from './fixtures/test'
import { installGameFixture, refreshGame, binding, body, id } from './fixtures/game'
import { simulationCatalog } from './fixtures/simulation-catalog'
import observation from '../../../contracts/fixtures/espionage-expanded.json' with { type: 'json' }
import type { components } from '../src/contracts'
const technicalData = {
  facts: [], bonuses: [], storage_capacities: null,
  combat: { attack_ticks: '5000000', shield_ticks: '1000000', hull_ticks: '40000000', rapid_fire_against: [], rapid_fire_from: [] },
}
const catalog: components['schemas']['CatalogEntry3'][] = [
  { key: { kind: 'Ship', id: 'Bomber' }, body_kinds: ['Planet'], requirements: [], enabled: true, mobile: true, ship_statistics: { propulsion: null, combat: { ...technicalData.combat, attack_ticks: '100000000', shield_ticks: '50000000', hull_ticks: '750000000' } } },
  { key: { kind: 'Ship', id: 'LightFighter' }, body_kinds: ['Planet'], requirements: [], enabled: true, mobile: true, technical_data: technicalData },
  { key: { kind: 'Defense', id: 'RocketLauncher' }, body_kinds: ['Planet'], requirements: [], enabled: true, mobile: false, technical_data: technicalData },
  { key: { kind: 'Defense', id: 'HeavyLaser' }, body_kinds: ['Planet'], requirements: [], enabled: true, mobile: false, technical_data: { ...technicalData, combat: { ...technicalData.combat, attack_ticks: '25000000', shield_ticks: '10000000', hull_ticks: '80000000' } } },
  { key: { kind: 'Defense', id: 'LargeShieldDome' }, body_kinds: ['Planet'], requirements: [], enabled: true, mobile: false, technical_data: { ...technicalData, combat: { ...technicalData.combat, attack_ticks: '100000', shield_ticks: '1000000000', hull_ticks: '1000000000' } } },
  { key: { kind: 'Defense', id: 'PlasmaTurret' }, body_kinds: ['Planet'], requirements: [], enabled: true, mobile: false, technical_data: { ...technicalData, combat: { ...technicalData.combat, attack_ticks: '300000000', shield_ticks: '30000000', hull_ticks: '1000000000' } } },
]
for (const hidden of [false, true]) test(`prefills report simulation with ${hidden ? 'unknown' : 'observed'} intelligence`, async ({ page }) => {
  await installGameFixture(page, { protocol: 4, catalog, bodies: [{ ...body, inventories: [{ item: { kind: 'Ship', id: 'LightFighter' }, count: '3' }] }, { ...body, id: id(6), inventories: [{ item: { kind: 'Ship', id: 'LightFighter' }, count: '99' }] }], extraCapabilities: ['Reports'] })
  const header = { id: id(63), kind: 'Espionage', observed_at: 6000, read: true, hidden: false }
  await page.route('**/api/**/reports/**', async route => {
    const context = route.request().postDataJSON()
    await route.fulfill({ json: { protocol: 4, binding, request_id: context.request_id, viewer_revision: '1', sampled_at: Date.now(), as_of_ms: Date.now(), data: { header, payload: { ...observation, observed_at: Date.now() - 7200000, resources: hidden ? { visibility: 'Unknown' } : observation.resources, defenses: hidden ? { visibility: 'Unknown' } : { visibility: 'Known', value: [{ item: { kind: 'Defense', id: 'HeavyLaser' }, count: '7' }, { item: { kind: 'Defense', id: 'LargeShieldDome' }, count: '1' }, { item: { kind: 'Defense', id: 'PlasmaTurret' }, count: '3' }] }, fleet: hidden ? { visibility: 'Unknown' } : { visibility: 'Known', value: [{ item: { kind: 'Ship', id: 'LightFighter' }, count: '12' }] }, research: hidden ? { visibility: 'Unknown' } : observation.research } } } })
  })
  let submitted: any = null
  let attempts = 0
  await page.route('**/combat-simulation', async route => {
    submitted = route.request().postDataJSON()
    if (hidden && attempts++ === 0) { await route.fulfill({ status: 503, json: { code: 'Unavailable' } }); return }
    await route.fulfill({ json: { ...submitted.context, profile_hash: 'a'.repeat(64), loot_rules_enabled: true, moons_enabled: true, recycler_capacity: '20000000000', available_loot: { metal: '133000000', crystal: '133000000', deuterium: '134000000' }, samples: Array.from({ length: 10 }, () => ({ outcome: 'AttackerVictory', rounds: 1, moon_chance_percent: 0, debris: { metal: '18000000', crystal: '6000000', deuterium: '0' }, surviving_cargo_capacity: '400000000', estimated_loot: hidden ? null : { metal: '133000000', crystal: '133000000', deuterium: '134000000' }, attacker: [{ item: { kind: 'Ship', id: 'LightFighter' }, count: 8 }, { item: { kind: 'Ship', id: 'Bomber' }, count: 0 }], defender: [] })) } })
  })
  await withFixtureResponse(page, r => r.url().endsWith(`/reports/${header.id}`), () => page.goto(`/u/andromeda/b/${body.id}/reports/${header.id}`))
  const trigger = page.getByRole('button', { name: 'Simulate combat', exact: true })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'Combat simulation' })
  await expect(dialog).toContainText('historical snapshot')
  await expect(dialog.getByRole('button', { name: 'Use all 3 available Light Fighter' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Use all 3 available Light Fighter' }).focus()
  await page.keyboard.press('Enter')
  await expect(dialog.getByLabel('Attacker Light Fighter', { exact: true })).toHaveValue('3')
  await expect(dialog.getByRole('region', { name: 'Attacker technologies', exact: true })).toBeVisible()
  await expect(dialog.getByRole('region', { name: 'Defender defenses', exact: true })).toBeAttached()
  const defenderShips = dialog.getByRole('region', { name: 'Defender ships', exact: true })
  await expect(defenderShips.locator('details')).toHaveJSProperty('open', hidden)
  if (!hidden) {
    await expect(defenderShips.locator('summary')).toContainText('12 units · 1 type')
    await defenderShips.locator('summary').focus()
    await page.keyboard.press('Enter')
    await expect(dialog.getByLabel('Defender Light Fighter', { exact: true })).toBeVisible()
    await dialog.getByLabel('Defender Light Fighter', { exact: true }).fill('2001')
    await defenderShips.locator('summary').click()
    await expect(defenderShips.locator('summary')).toContainText('1 invalid values')
    await expect(dialog.getByRole('button', { name: 'Run 10 battles' })).toBeDisabled()
    await defenderShips.locator('summary').click()
    await dialog.getByLabel('Defender Light Fighter', { exact: true }).fill('13')
    await expect(defenderShips.locator('summary')).toContainText('13 units')
    await dialog.getByLabel('Defender Light Fighter', { exact: true }).fill('12')
    if (process.env.ORBIT_TEST_SCREENSHOTS === '1') for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      await defenderShips.scrollIntoViewIfNeeded()
      await diagnosticScreenshot(page, { path: `test-results/simulation-expanded-defender-${width}.png` })
    }
    await defenderShips.locator('summary').click()
  }

  await expect(dialog).toContainText('hypothetical quantities are allowed')
  await expect(dialog.getByLabel('Defender Light Fighter', { exact: true })).toHaveValue(hidden ? '0' : '12')
  await expect(dialog.getByLabel('Defender Rocket Launcher', { exact: true })).toHaveValue('0')
  await expect(dialog.getByLabel('Defender Heavy Laser', { exact: true })).toHaveValue(hidden ? '0' : '7')
  await expect(dialog.getByLabel('Defender Large Shield Dome', { exact: true })).toHaveValue(hidden ? '0' : '1')
  await expect(dialog.getByLabel('Defender Plasma Turret', { exact: true })).toHaveValue(hidden ? '0' : '3')
  await expect(dialog.getByLabel('Attacker Plasma Turret', { exact: true })).toHaveCount(0)
  await expect(dialog.getByLabel('Attacker Large Shield Dome', { exact: true })).toHaveCount(0)
  await expect(dialog.getByLabel('Attacker Heavy Laser', { exact: true })).toHaveCount(0)
  await dialog.getByLabel('Attacker Light Fighter', { exact: true }).fill('10')
  await dialog.getByLabel('Attacker Bomber', { exact: true }).fill('2')
  await expect(dialog.getByLabel('Defender Bomber', { exact: true })).toHaveValue('0')
  if (hidden) {
    await expect(dialog.getByRole('button', { name: 'Run 10 battles' })).toBeEnabled()
    await expect(dialog.getByRole('button', { name: 'Assume all unknown values are zero' })).toHaveCount(0)
    await expect(dialog).toContainText('Assumed zero · not observed')
  }
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    if (process.env.ORBIT_TEST_SCREENSHOTS === '1') {
      await dialog.evaluate(el => { el.scrollTop = 0 })
      await diagnosticScreenshot(page, { path: `test-results/simulation-${hidden}-${width}.png`, fullPage: false })
      if (hidden && width === 390) {
        await dialog.getByRole('group', { name: 'Defender', exact: true }).evaluate(el => el.scrollIntoView({ block: 'start' }))
        await diagnosticScreenshot(page, { path: `test-results/simulation-report-defender-${width}x1000.png` })
      }
    }
  }
  if (!hidden) for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await dialog.getByRole('region', { name: 'Attack planning', exact: true }).scrollIntoViewIfNeeded()
    await expect(dialog.getByRole('button', { name: 'Prepare attack' })).toBeDisabled()
    await diagnosticScreenshot(page, { path: `test-results/simulation-unavailable-${width}.png`, fullPage: false })
  }
  await dialog.getByRole('button', { name: 'Run 10 battles' }).click()
  if (hidden) {
    await expect(dialog.getByRole('alert')).toContainText('Simulation failed')
    await dialog.getByRole('button', { name: 'Run 10 battles' }).click()
  }
  await expect(dialog.getByRole('region', { name: 'Simulation results' })).toBeVisible()
  const results = dialog.getByRole('region', { name: 'Simulation results' })
  expect(await results.evaluate(el => Boolean(el.compareDocumentPosition(document.querySelector('[aria-label="Attack planning"]')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true)
  await expect(results).toContainText('Light Fighter2 lost · 8 surviving')
  await expect(results).toContainText('Bomber2 lost · 0 surviving')
  await expect(results).toContainText('Surviving cargo capacity: 400 average')
  await expect(results).toContainText('1 average battle round')
  await expect(results.getByRole('region', { name: 'Moon creation chance' })).toContainText('0%')
  await dialog.getByLabel('Moon creation target', { exact: false }).selectOption('PlanetWithMoon')
  await expect(results).toContainText('This planet already has a moon.')
  await dialog.getByLabel('Moon creation target', { exact: false }).selectOption('Unknown')
  await expect(results).toContainText(hidden ? 'resources were not observed' : 'Estimated loot: 400 average')
  if (!hidden) {
    for (const name of ['Metal', 'Crystal', 'Deuterium']) await expect(results.getByRole('img', { name, exact: true }).first()).toBeVisible()
    expect(submitted.inputs.observed_resources).toEqual(observation.resources.value)
  } else expect(submitted.inputs.observed_resources).toBeUndefined()
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    await results.evaluate(el => el.scrollIntoView({ block: 'start' }))
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    await diagnosticScreenshot(page, { path: `test-results/simulation-results-${hidden}-${width}.png`, fullPage: false })
  }
  await results.getByText('Losses and survivors', { exact: true }).click()
  await expect(results.getByText('Bomber', { exact: true })).toBeVisible()
  await results.getByText('Estimate ranges and assumptions', { exact: true }).click()
  await expect(results.getByText('Generated debris · metal', { exact: true })).toBeVisible()
  if (process.env.ORBIT_TEST_SCREENSHOTS === '1') for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await results.getByText('Estimate ranges and assumptions', { exact: true }).scrollIntoViewIfNeeded()
    await diagnosticScreenshot(page, { path: `test-results/simulation-result-details-${hidden}-${width}.png` })
  }
  await expect(results.getByText('Victory', { exact: false })).toHaveCSS('color', 'rgb(145, 201, 172)')
  await expect(results.getByText('Defeat', { exact: false })).toHaveCSS('color', 'rgb(227, 152, 133)')
  expect(submitted.inputs.defender.units).toEqual(hidden ? [] : [{ item: { kind: 'Ship', id: 'LightFighter' }, count: 12 }, { item: { kind: 'Defense', id: 'HeavyLaser' }, count: 7 }, { item: { kind: 'Defense', id: 'LargeShieldDome' }, count: 1 }, { item: { kind: 'Defense', id: 'PlasmaTurret' }, count: 3 }])
  expect(submitted.inputs.attacker.units).toEqual([{ item: { kind: 'Ship', id: 'Bomber' }, count: 2 }, { item: { kind: 'Ship', id: 'LightFighter' }, count: 10 }])
  expect(Object.keys(submitted).sort()).toEqual(['context', 'inputs'])
  await dialog.getByLabel('Attacker Light Fighter', { exact: true }).fill('20')
  await expect(dialog.getByRole('region', { name: 'Simulation results' })).toHaveCount(0)
  await dialog.getByText('Load owned defender', { exact: true }).click()
  await dialog.getByRole('button', { name: 'Replace defender from current planet', exact: true }).click()
  await expect(dialog.getByLabel('Defender Light Fighter', { exact: true })).toHaveValue('0')
  await expect(dialog.getByLabel('Attacker Light Fighter', { exact: true })).toHaveValue('20')
  await withFixtureResponse(page, r => r.url().endsWith('/combat-simulation'), () => dialog.getByRole('button', { name: 'Run 10 battles' }).click())
  await expect(results).toBeVisible()
  expect(submitted.inputs.observed_resources).toBeUndefined()
  if (!hidden && process.env.ORBIT_TEST_SCREENSHOTS === '1') {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      await dialog.getByRole('group', { name: 'Defender', exact: true }).evaluate(el => el.scrollIntoView({ block: 'start' }))
      await diagnosticScreenshot(page, { path: `test-results/simulator-report-import-${width}x1000.png` })
    }
  }
  await dialog.getByRole('button', { name: 'Replace defender from report', exact: true }).click()
  await expect(results).toHaveCount(0)
  await expect(dialog.getByLabel('Defender Light Fighter', { exact: true })).toHaveValue(hidden ? '0' : '12')
  await expect(dialog.getByLabel('Attacker Light Fighter', { exact: true })).toHaveValue('20')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
})

test('prepares an editable observed-planet attack with advisory hypothetical estimates and authoritative launch validation', async ({ page }) => {
  let revision = 1
  await installGameFixture(page, { protocol: 4, viewerRevision: () => String(revision), catalog,
    bodies: [{ ...body, inventories: [{ item: { kind: 'Ship', id: 'LightFighter' }, count: '3' }] }],
    extraCapabilities: ['Reports', 'Attack'] })
  const report = { ...observation, observed_at: Date.now() - 7200000, target: { ...observation.target, kind: 'Planet' } }
  const header = { id: id(63), kind: 'Espionage', observed_at: 6000, read: true, hidden: false }
  await page.route('**/api/**/reports/**', async route => {
    const context = route.request().postDataJSON()
    await route.fulfill({ json: { protocol: 4, binding, request_id: context.request_id, viewer_revision: String(revision), sampled_at: Date.now(), as_of_ms: Date.now(), data: { header, payload: report } } })
  })
  let quotes: any[] = []
  let launches = 0
  let hold = false
  let release: (() => void) | undefined
  let blocked = ''
  let changedTarget = false
  const destination = { type: 'Body', id: report.target.body, expected_kind: 'Planet', expected_owner: report.target.owner }
  await routeWorld(page, async route => {
    const request = route.request().postDataJSON()
    let data: any
    if (request.type === 'ResolveDestination') {
      expect(request.selection.kind).toBe('Planet')
      data = { ...destination, id: changedTarget ? id(91) : destination.id }
    } else if (request.type === 'Galaxy') {
      data = { galaxy: 1, system: 1, observed_at: 1000, player_names: {}, positions: Array.from({ length: 15 }, (_, i) => ({ coordinates: { galaxy: 1, system: 1, position: i + 1 }, body: null, debris: null })) }
    } else {
      if (!page.url().includes('/dispatch')) expect(request.type).toBe('FleetEstimate')
      quotes.push(request.intent)
      if (hold) { hold = false; await new Promise<void>(resolve => { release = resolve }) }
      if (blocked) return route.fulfill({ status: 422, json: { code: 'GameRejected', game_code: blocked } })
      data = { intent: request.intent, profile_hash: 'a'.repeat(64), distance: 1000, speeds: [], duration_ms: Math.ceil(100000 * 100 / request.intent.speed_percent),
        fuel: '2000000', capacity: '5000000000', maximum_payload: '4998000000', slot_limit: '1', terms_hash: 'b'.repeat(64) }
    }
    await route.fulfill({ json: { protocol: 4, binding, request_id: request.context.request_id, viewer_revision: String(revision), sampled_at: Date.now(), as_of_ms: Date.now(), data } })
  })
  page.on('request', request => { if (request.url().endsWith('/commands')) launches++ })
  await withFixtureResponse(page, r => r.url().endsWith(`/reports/${header.id}`), () => page.goto(`/u/andromeda/b/${body.id}/reports/${header.id}`))
  await page.getByRole('button', { name: 'Simulate combat', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Combat simulation' })
  const ship = dialog.getByLabel('Attacker Light Fighter', { exact: true })
  const plan = dialog.getByRole('region', { name: 'Attack planning', exact: true })
  const timing = plan.getByRole('region', { name: 'Flight timing' })
  const prepare = plan.getByRole('button', { name: 'Prepare attack' })
  await expect(prepare).toBeDisabled()
  await ship.fill('4')
  await expect(plan).toContainText('4 selected, 3 stationed')
  await expect(prepare).toBeDisabled()
  await expect(timing).toContainText('1m 40s')
  expect(quotes.at(-1).ships[0].count).toBe('4')
  if (process.env.ORBIT_TEST_SCREENSHOTS === '1') {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      await plan.scrollIntoViewIfNeeded()
      await diagnosticScreenshot(page, { path: `test-results/simulation-hypothetical-report-${width}.png` })
    }
  }
  await dialog.getByRole('button', { name: 'Use all 3 available Light Fighter' }).click()
  await expect(timing).toContainText('1m 40s')
  await expect(timing.getByRole('img', { name: 'Deuterium', exact: true })).toBeVisible()
  await expect.poll(() => quotes.at(-1)?.ships[0].count).toBe('3')
  expect(quotes.at(-1)).toMatchObject({ origin: body.id, mission: 'Attack', ships: [{ owner: binding.player, ship_type: 'LightFighter', count: '3' }], destination, speed_percent: 100 })
  await dialog.getByLabel('Attacker Weapons Technology', { exact: true }).fill('100')
  // A delayed quote must not replace a more recent speed selection.
  hold = true
  await dialog.getByLabel('Simulator flight speed').selectOption('50')
  await expect.poll(() => release !== undefined).toBe(true)
  await expect(timing).not.toContainText('1m 40s')
  if (process.env.ORBIT_TEST_SCREENSHOTS === '1') {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      await plan.scrollIntoViewIfNeeded()
      await diagnosticScreenshot(page, { path: `test-results/simulation-report-pending-${width}.png` })
    }
  }
  await dialog.getByLabel('Simulator flight speed').selectOption('20')
  await expect(timing).toContainText('8m 20s')
  const delayed = page.waitForResponse(r => r.url().endsWith('/world') && r.request().postDataJSON().intent?.speed_percent === 50)
  release!()
  await delayed
  await expect(timing).toContainText('8m 20s')
  await expect(timing).not.toContainText('3m 20s')
  // A viewer revision revalidates unchanged advisory inputs without blanking them.
  release = undefined
  hold = true
  revision++
  await refreshGame(page)
  try {
    await expect.poll(() => release !== undefined).toBe(true)
    await expect(timing).toContainText('8m 20s')
    await expect(timing).not.toContainText('Updating flight times')
  } finally { release?.() }
  await expect(timing).toContainText('8m 20s')
  // Server eligibility failures remain visible, with no guessed duration or fuel.
  blocked = 'BeginnerProtected'
  await dialog.getByLabel('Simulator flight speed').selectOption('30')
  await expect(timing).toContainText('Beginner protection prevents this mission')
  blocked = ''
  changedTarget = true
  await dialog.getByLabel('Simulator flight speed').selectOption('40')
  await expect(timing).toContainText('The observed target has changed')
  changedTarget = false
  await dialog.getByLabel('Simulator flight speed').selectOption('60')
  await expect(timing).toContainText('2m 47s')
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await plan.scrollIntoViewIfNeeded()
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    await diagnosticScreenshot(page, { path: `test-results/simulation-planning-${width}.png`, fullPage: false })
  }
  await prepare.click()
  await expect(page.locator('main h1')).toHaveText('Dispatch')
  await expect(page).toHaveURL(new RegExp(`/b/${body.id}/dispatch.*mission=Attack.*target=planet`))
  await expect(page.getByLabel('Light Fighter · 3 available')).toHaveValue('3')
  await expect(page.getByLabel('Speed', { exact: true })).toHaveValue('60')
  await expect(page.getByLabel('Destination coordinates', { exact: true })).toHaveValue('1:1:9')
  await expect(page.getByRole('region', { name: 'Fleet quote', exact: true })).toHaveCount(0)
  expect(launches).toBe(0)
  await expect(page.getByRole('region', { name: 'Flight timing' })).toContainText('2m 47s')
  await expect(page.getByLabel('Destination preview')).not.toContainText('Looking up destination')
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await diagnosticScreenshot(page, { path: `test-results/simulation-dispatch-${width}.png`, fullPage: true })
  }
  await page.getByLabel('Light Fighter · 3 available').fill('2')
  blocked = 'NoFleetSlot'
  await page.getByRole('button', { name: 'Review fleet', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('All fleet slots are occupied')
  expect(quotes.at(-1).ships).toEqual([{ owner: binding.player, ship_type: 'LightFighter', count: '2' }])
  expect(launches).toBe(0)
})

for (const width of [1440, 390]) test(`opens standalone simulation without reports at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 })
  await installGameFixture(page, { protocol: 4, catalog: simulationCatalog,
    missions: { fleets: [], incoming: [], score_value_micro: '0', fleet_slots: '1' },
    bodies: [{ ...body, inventories: [{ item: { kind: 'Ship', id: 'LightFighter' }, count: '3' }] }],
  })
  let reportRequests = 0
  let launches = 0
  page.on('request', request => {
    if (new URL(request.url()).pathname.includes('/reports/')) reportRequests++
    if (request.url().endsWith('/commands')) launches++
  })
  let submitted: any
  await page.route('**/combat-simulation', async route => {
    submitted = route.request().postDataJSON()
    await route.fulfill({ json: { ...submitted.context, profile_hash: 'a'.repeat(64), loot_rules_enabled: true, moons_enabled: true, recycler_capacity: '20000000000',
      samples: Array.from({ length: 10 }, () => ({ outcome: 'AttackerVictory', rounds: 1, moon_chance_percent: 0,
        debris: { metal: '18000000', crystal: '6000000', deuterium: '0' }, surviving_cargo_capacity: '400000000', estimated_loot: null,
        attacker: [{ item: { kind: 'Ship', id: 'LightFighter' }, count: 8 }], defender: [] })) } })
  })
  await withFixtureResponse(page, r => r.url().endsWith('/bootstrap'), () => page.goto(`/u/andromeda/b/${body.id}/overview`))
  const entry = await menuDestination(page, 'Combat Simulator')
  await expect(entry).toBeVisible()
  await diagnosticScreenshot(page, { path: `test-results/simulation-menu-${width}.png` })
  await entry.click()
  await expect(page.getByRole('heading', { name: 'Combat Simulator', exact: true })).toBeVisible()
  await expect(page).toHaveURL(/combat-simulator/)
  await expect(page.getByText('No report imported.', { exact: false })).toHaveCount(0)
  await expect(page.getByLabel('Defender Weapons Technology', { exact: true })).toHaveValue('0')
  await expect(page.getByLabel('Defender Light Fighter', { exact: true })).toHaveValue('0')
  if (width === 1440) {
    const attackerCargo = await page.getByLabel('Attacker Small Cargo', { exact: true }).boundingBox()
    const defenderCargo = await page.getByLabel('Defender Small Cargo', { exact: true }).boundingBox()
    expect(Math.abs(attackerCargo!.y - defenderCargo!.y)).toBeLessThan(2)
  }
  const runButton = page.getByRole('button', { name: 'Run 10 battles', exact: true })
  expect(await runButton.evaluate(button => {
    const box = button.getBoundingClientRect()
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
    return hit === button || button.contains(hit)
  })).toBe(true)
  await diagnosticScreenshot(page, { path: `test-results/simulation-standalone-defaults-${width}.png`, fullPage: width === 1440 })
  if (width === 390 && process.env.ORBIT_TEST_SCREENSHOTS === '1') {
    await page.getByRole('group', { name: 'Defender', exact: true }).scrollIntoViewIfNeeded()
    await diagnosticScreenshot(page, { path: `test-results/simulation-standalone-defender-${width}.png` })
  }
  await page.getByLabel('Attacker Light Fighter', { exact: true }).fill('10')
  await expect(page.getByRole('button', { name: 'Run 10 battles' })).toBeEnabled()
  await page.getByLabel('Defender Light Fighter', { exact: true }).fill('2')
  await page.getByLabel('Defender Weapons Technology', { exact: true }).fill('7')
  await expect(page.getByRole('button', { name: 'Assume all unknown values are zero' })).toHaveCount(0)
  const cleared = ['Attacker Weapons Technology', 'Attacker Bomber', 'Defender Shielding Technology', 'Defender Rocket Launcher']
  for (const name of cleared) await page.getByLabel(name, { exact: true }).fill('')
  await page.getByRole('button', { name: 'Add defending fleet' }).click()
  const ally = page.getByRole('group', { name: 'Allied defending fleet 1', exact: true })
  await ally.getByLabel('Defender Light Fighter', { exact: true }).fill('3')
  await ally.getByLabel('Defender Weapons Technology', { exact: true }).fill('')
  await ally.getByLabel('Defender Bomber', { exact: true }).fill('')
  await expect(page.getByRole('group', { name: 'Defender', exact: true }).getByLabel('Defender Light Fighter', { exact: true })).toHaveValue('2')
  await withFixtureResponse(page, r => r.url().endsWith('/combat-simulation'), () => page.getByRole('button', { name: 'Run 10 battles' }).click())
  for (const name of cleared) await expect(page.getByLabel(name, { exact: true }).first()).toHaveValue('0')
  await expect(ally.getByLabel('Defender Weapons Technology', { exact: true })).toHaveValue('0')
  await expect(ally.getByLabel('Defender Bomber', { exact: true })).toHaveValue('0')
  expect(submitted.inputs.attacker).toEqual({ technology: [0, 0, 0], units: [{ item: { kind: 'Ship', id: 'LightFighter' }, count: 10 }] })
  expect(submitted.inputs.defending_allies).toEqual([{ technology: [0, 0, 0], units: [{ item: { kind: 'Ship', id: 'LightFighter' }, count: 3 }] }])
  if (process.env.ORBIT_TEST_SCREENSHOTS === '1') {
    await ally.evaluate(el => el.scrollIntoView({ block: 'start' }))
    await page.evaluate(() => window.scrollBy(0, -80))
    await diagnosticScreenshot(page, { path: `test-results/simulation-filled-blanks-${width}x1000.png` })
  }
  const results = page.getByRole('region', { name: 'Simulation results' })
  await expect(results).toContainText('resources were not observed')
  expect(submitted.inputs.defender).toEqual({ technology: [7, 0, 0], units: [{ item: { kind: 'Ship', id: 'LightFighter' }, count: 2 }] })
  expect(submitted.inputs.observed_resources).toBeUndefined()
  await expect(page.getByRole('button', { name: 'Prepare attack' })).toHaveCount(0)
  await results.scrollIntoViewIfNeeded()
  await diagnosticScreenshot(page, { path: `test-results/simulation-standalone-results-${width}.png` })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByText('Simulation assumptions', { exact: true }).click()
  await expect(page.getByText('Ten randomized battles', { exact: false })).toBeVisible()
  await page.getByText('Simulation assumptions', { exact: true }).scrollIntoViewIfNeeded()
  await diagnosticScreenshot(page, { path: `test-results/simulation-standalone-help-${width}.png` })
  await page.getByLabel('Attacker Light Fighter', { exact: true }).fill('11')
  await expect(results).toHaveCount(0)
  await withFixtureResponse(page, r => r.url().endsWith('/bootstrap'), () => page.reload())
  await expect(page.getByLabel('Defender Light Fighter', { exact: true })).toHaveValue('0')
  expect(reportRequests).toBe(0)
  expect(launches).toBe(0)
})

// Regression: manual simulator coordinates must reach the estimate API even
// with no stationed fleet; input changes must never display a superseded result.
test('estimates manual hypothetical flights at 390px', async ({ page }) => {
  const width = 390
  await page.setViewportSize({ width, height: 1000 })
  const second = { ...body, id: id(6), name: 'Outpost', coordinates: { galaxy: 2, system: 1, position: 3 }, inventories: [] }
  await installGameFixture(page, { protocol: 4, catalog, bodies: [{ ...body, inventories: [] }, second], missions: { fleets: [], incoming: [], score_value_micro: '0', fleet_slots: '1' } })
  let unavailable = false
  const estimates: any[] = []
  const selections: any[] = []
  let launches = 0
  page.on('request', r => { if (r.url().endsWith('/commands')) launches++ })
  await routeWorld(page, async route => {
    const request = route.request().postDataJSON()
    let data: any
    if (request.type === 'ResolveDestination') {
      selections.push(request.selection)
      if (unavailable) return route.fulfill({ status: 422, json: { code: 'GameRejected', game_code: 'NotFound' } })
      data = { type: 'Body', id: id(request.selection.coordinates.position + 80), expected_owner: id(90), expected_kind: request.selection.kind }
    } else {
      expect(request.type).toBe('FleetEstimate')
      estimates.push(request.intent)
      data = { estimate: true, intent: request.intent, profile_hash: 'a'.repeat(64), duration_ms: 120000, fuel: '2000000', capacity: '5000000000', maximum_payload: '4998000000' }
    }
    await route.fulfill({ json: { protocol: 4, binding, request_id: request.context.request_id, viewer_revision: '1', sampled_at: Date.now(), as_of_ms: Date.now(), data } })
  })
  await withFixtureResponse(page, r => r.url().endsWith('/bootstrap'), () => page.goto(`/u/andromeda/combat-simulator`))
  const plan = page.getByRole('region', { name: 'Attack planning', exact: true })
  const timing = plan.getByRole('region', { name: 'Flight timing' })
  async function capturePlan(state: string) {
    if (process.env.ORBIT_TEST_SCREENSHOTS !== '1') return
    for (const captureWidth of [1440, 390]) {
      await page.setViewportSize({ width: captureWidth, height: 1000 })
      await page.mouse.move(0, 0)
      await plan.evaluate(el => el.scrollIntoView({ block: 'start' }))
      await page.evaluate(() => window.scrollBy(0, -72))
      await diagnosticScreenshot(page, { path: `test-results/simulation-manual-${state}-${captureWidth}.png` })
    }
  }
  const coordinates = plan.getByLabel('Destination coordinates', { exact: true })
  const ship = page.getByLabel('Attacker Light Fighter', { exact: true })
  await ship.fill('15')
  await page.getByLabel('Attacker Bomber', { exact: true }).fill('')
  await expect(timing).toContainText('Enter destination coordinates')
  await coordinates.fill('1:1:16')
  await expect(coordinates).toHaveAttribute('aria-invalid', 'true')
  await expect(timing).toContainText('Enter a position number')
  await capturePlan('invalid')
  await coordinates.fill('1:1:9')
  await expect(timing).toContainText('2m')
  await expect(timing.getByRole('img', { name: 'Deuterium', exact: true })).toBeVisible()
  expect(estimates.at(-1)).toMatchObject({ origin: body.id, ships: [{ count: '15', owner: binding.player, ship_type: 'LightFighter' }], speed_percent: 100 })
  await plan.getByLabel('Destination type').selectOption('Moon')
  await expect.poll(() => estimates.at(-1)?.destination.expected_kind).toBe('Moon')
  await expect(timing).toContainText('4m')
  expect(selections.at(-1)).toMatchObject({ coordinates: { galaxy: 1, system: 1, position: 9 }, kind: 'Moon' })
  await plan.scrollIntoViewIfNeeded()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await capturePlan('hypothetical')
  unavailable = true
  await plan.getByLabel('Destination type').selectOption('Planet')
  await expect(timing).toContainText('The destination is no longer available')
  await expect(timing).not.toContainText('2m')
  await capturePlan('unavailable')
  expect(launches).toBe(0)
})

// Regression: importing an owned world must be explicit, replace only the primary
// defender, preserve edits across selection changes, and send the displayed draft.
for (const width of [1440, 390]) test(`imports owned defender and samples new debris at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 })
  const home = { ...body, name: 'Home', inventories: [
    { item: { kind: 'Ship', id: 'LightFighter' } as const, count: '3' },
    { item: { kind: 'Defense', id: 'RocketLauncher' } as const, count: '20' },
  ] }
  const moon = { ...home, id: id(80), kind: 'Moon' as const, name: 'Watchtower', moon: { parent: body.id, created_at: 1000 }, inventories: [
    { item: { kind: 'Ship', id: 'LightFighter' } as const, count: '8' },
    { item: { kind: 'Defense', id: 'RocketLauncher' } as const, count: '7' },
  ] }
  await installGameFixture(page, { protocol: 4, catalog, bodies: [home, moon], research: [{ research: 'WeaponsTechnology', level: 4 }],
    missions: { fleets: [], incoming: [], score_value_micro: '0', fleet_slots: '1' },
  })
  let submitted: components['schemas']['SimulationInputs'] | undefined
  await page.route('**/combat-simulation', async route => {
    const request = route.request().postDataJSON()
    submitted = request.inputs
    await route.fulfill({ json: { ...request.context, profile_hash: 'a'.repeat(64), loot_rules_enabled: true, moons_enabled: true, recycler_capacity: '20000000000',
      samples: Array.from({ length: 10 }, (_, i) => ({ outcome: i < 5 ? 'AttackerVictory' : 'DefenderVictory', rounds: 2, moon_chance_percent: 20,
        surviving_cargo_capacity: '0', estimated_loot: null, attacker: [], defender: [],
        debris: { metal: String(i * 2_000_000_000), crystal: String(i * 1_000_000_000), deuterium: String(i * 100_000_000) },
      })) } })
  })
  await withFixtureResponse(page, r => r.url().endsWith('/bootstrap'), () => page.goto('/u/andromeda/combat-simulator'))
  const attacker = page.getByRole('group', { name: 'Attacker', exact: true })
  const defender = page.getByRole('group', { name: 'Defender', exact: true })
  await attacker.getByLabel('Attacker Light Fighter', { exact: true }).fill('25')
  await attacker.getByLabel('Attacker Weapons Technology', { exact: true }).fill('9')
  await defender.getByLabel('Defender Rocket Launcher', { exact: true }).fill('99')
  await page.getByText('Load owned defender', { exact: true }).click()
  const replace = page.getByRole('button', { name: 'Replace defender from current planet', exact: true })
  await expect(page.getByLabel('Include stationed ships')).not.toBeChecked()
  await replace.focus()
  await page.keyboard.press('Enter')
  await expect(defender.getByLabel('Defender Weapons Technology', { exact: true })).toHaveValue('4')
  await expect(defender.getByLabel('Defender Rocket Launcher', { exact: true })).toHaveValue('20')
  await expect(defender.getByLabel('Defender Light Fighter', { exact: true })).toHaveValue('0')
  await expect(attacker.getByLabel('Attacker Weapons Technology', { exact: true })).toHaveValue('9')
  await expect(attacker.getByLabel('Attacker Light Fighter', { exact: true })).toHaveValue('25')
  await expect(page.getByText('Defender imported from', { exact: false })).toContainText('Planet · Home')
  if (process.env.ORBIT_TEST_SCREENSHOTS === '1') {
    await defender.evaluate(el => el.scrollIntoView({ block: 'start' }))
    await page.evaluate(() => window.scrollBy(0, -90))
    await diagnosticScreenshot(page, { path: `test-results/simulator-import-planet-${width}x1000.png` })
  }
  await page.getByLabel('Include stationed ships').check()
  await expect(defender.getByLabel('Defender Light Fighter', { exact: true })).toHaveValue('0')
  await replace.click()
  await expect(defender.getByLabel('Defender Light Fighter', { exact: true })).toHaveValue('3')
  await defender.getByLabel('Defender Rocket Launcher', { exact: true }).fill('21')
  await page.getByRole('combobox', { name: 'Selected body' }).click()
  await page.getByRole('option', { name: /Watchtower/ }).click()
  const replaceMoon = page.getByRole('button', { name: 'Replace defender from current moon', exact: true })
  await expect(replaceMoon).toBeVisible()
  await expect(defender.getByLabel('Defender Rocket Launcher', { exact: true })).toHaveValue('21')
  await expect(defender.getByLabel('Defender Light Fighter', { exact: true })).toHaveValue('3')
  await expect(page.getByText('Defender imported from', { exact: false })).toContainText('Planet · Home')
  await replaceMoon.click()
  await expect(defender.getByLabel('Defender Rocket Launcher', { exact: true })).toHaveValue('7')
  await expect(defender.getByLabel('Defender Light Fighter', { exact: true })).toHaveValue('8')
  await expect(page.getByText('Defender imported from', { exact: false })).toContainText('Moon · Watchtower')
  if (process.env.ORBIT_TEST_SCREENSHOTS === '1') {
    await defender.evaluate(el => el.scrollIntoView({ block: 'start' }))
    await page.evaluate(() => window.scrollBy(0, -90))
    await diagnosticScreenshot(page, { path: `test-results/simulator-import-moon-${width}x1000.png` })
  }
  await withFixtureResponse(page, r => r.url().endsWith('/combat-simulation'), () => page.getByRole('button', { name: 'Run 10 battles' }).click())
  expect(submitted?.attacker).toEqual({ technology: [9, 0, 0], units: [{ item: { kind: 'Ship', id: 'LightFighter' }, count: 25 }] })
  expect(submitted?.defender).toEqual({ technology: [4, 0, 0], units: [{ item: { kind: 'Ship', id: 'LightFighter' }, count: 8 }, { item: { kind: 'Defense', id: 'RocketLauncher' }, count: 7 }] })
  expect(submitted?.observed_resources).toBeUndefined()
  await expect(page.getByLabel('Moon creation target', { exact: false })).toHaveValue('Moon')
  await expect(page.getByRole('region', { name: 'Moon creation chance' })).toContainText('0%')
  const debris = page.getByRole('region', { name: 'New debris field', exact: true })
  await expect(debris).toContainText('9,000 average')
  await page.getByText('Estimate ranges and assumptions', { exact: true }).click()
  await expect(page.getByRole('region', { name: 'Simulation results' })).toContainText('0–18,000')
  await expect(debris).toContainText('450 average')
  for (const resource of ['Metal', 'Crystal', 'Deuterium']) await expect(debris.getByRole('img', { name: resource, exact: true })).toHaveCount(1)
  await expect(debris).toContainText('collection is not simulated')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  if (process.env.ORBIT_TEST_SCREENSHOTS === '1') {
    await debris.evaluate(el => el.scrollIntoView({ block: 'center' }))
    await diagnosticScreenshot(page, { path: `test-results/simulator-debris-${width}x1000.png` })
  }
  await defender.getByLabel('Defender Rocket Launcher', { exact: true }).fill('8')
  await expect(debris).toHaveCount(0)
})
