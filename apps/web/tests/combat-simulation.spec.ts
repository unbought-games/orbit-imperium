import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { test, expect } from './fixtures/test'
import { installGameFixture, refreshGame, binding, body, id } from './fixtures/game'
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
    await route.fulfill({ json: { ...submitted.context, profile_hash: 'a'.repeat(64), loot_rules_enabled: true, samples: Array.from({ length: 10 }, () => ({ outcome: 'AttackerVictory', rounds: 1, surviving_cargo_capacity: '400000000', estimated_loot: hidden ? null : { metal: '133000000', crystal: '133000000', deuterium: '134000000' }, attacker: [{ item: { kind: 'Ship', id: 'LightFighter' }, count: 8 }, { item: { kind: 'Ship', id: 'Bomber' }, count: 0 }], defender: [] })) } })
  })
  await page.goto(`/u/andromeda/b/${body.id}/reports/${header.id}`)
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
  await expect(dialog).toContainText('hypothetical quantities are allowed')
  await expect(dialog.getByLabel('Defender Light Fighter', { exact: true })).toHaveValue(hidden ? '' : '12')
  await expect(dialog.getByLabel('Defender Rocket Launcher', { exact: true })).toHaveValue(hidden ? '' : '0')
  await expect(dialog.getByLabel('Defender Heavy Laser', { exact: true })).toHaveValue(hidden ? '' : '7')
  await expect(dialog.getByLabel('Defender Large Shield Dome', { exact: true })).toHaveValue(hidden ? '' : '1')
  await expect(dialog.getByLabel('Defender Plasma Turret', { exact: true })).toHaveValue(hidden ? '' : '3')
  await expect(dialog.getByLabel('Attacker Plasma Turret', { exact: true })).toHaveCount(0)
  await expect(dialog.getByLabel('Attacker Large Shield Dome', { exact: true })).toHaveCount(0)
  await expect(dialog.getByLabel('Attacker Heavy Laser', { exact: true })).toHaveCount(0)
  await dialog.getByLabel('Attacker Light Fighter', { exact: true }).fill('10')
  await dialog.getByLabel('Attacker Bomber', { exact: true }).fill('2')
  await expect(dialog.getByLabel('Defender Bomber', { exact: true })).toHaveValue(hidden ? '' : '0')
  if (hidden) {
    await expect(dialog.getByRole('button', { name: 'Run 10 battles' })).toBeDisabled()
    await dialog.getByRole('button', { name: 'Assume all unknown values are zero' }).click()
    await expect(dialog).toContainText('Player assumption · not observed')
  }
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    await dialog.evaluate(el => { el.scrollTop = 0 })
    await diagnosticScreenshot(page, { path: `test-results/simulation-${hidden}-${width}.png`, fullPage: false })
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
  await expect(results).toContainText('Light Fighter2 lost · 8 surviving')
  await expect(results).toContainText('Bomber2 lost · 0 surviving')
  await expect(results).toContainText('Surviving cargo capacity: 400 average')
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
  await expect(results.getByText('Victory · attacker wins')).toHaveCSS('color', 'rgb(145, 201, 172)')
  await expect(results.getByText('Defeat · defender wins')).toHaveCSS('color', 'rgb(227, 152, 133)')
  expect(submitted.inputs.defender.units).toEqual(hidden ? [] : [{ item: { kind: 'Ship', id: 'LightFighter' }, count: 12 }, { item: { kind: 'Defense', id: 'HeavyLaser' }, count: 7 }, { item: { kind: 'Defense', id: 'LargeShieldDome' }, count: 1 }, { item: { kind: 'Defense', id: 'PlasmaTurret' }, count: 3 }])
  expect(submitted.inputs.attacker.units).toEqual([{ item: { kind: 'Ship', id: 'Bomber' }, count: 2 }, { item: { kind: 'Ship', id: 'LightFighter' }, count: 10 }])
  expect(Object.keys(submitted).sort()).toEqual(['context', 'inputs'])
  await dialog.getByLabel('Attacker Light Fighter', { exact: true }).fill('20')
  await expect(dialog.getByRole('region', { name: 'Simulation results' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
})

test('prepares an editable observed-moon attack with authoritative, race-safe flight quotes', async ({ page }) => {
  let revision = 1
  await installGameFixture(page, { protocol: 4, viewerRevision: () => String(revision), catalog,
    bodies: [{ ...body, inventories: [{ item: { kind: 'Ship', id: 'LightFighter' }, count: '3' }] }],
    extraCapabilities: ['Reports', 'Attack'] })
  const report = { ...observation, observed_at: Date.now() - 7200000, target: { ...observation.target, kind: 'Moon' } }
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
  const destination = { type: 'Body', id: report.target.body, expected_kind: 'Moon', expected_owner: report.target.owner }
  await page.route('**/world', async route => {
    const request = route.request().postDataJSON()
    let data: any
    if (request.type === 'ResolveDestination') {
      expect(request.selection.kind).toBe('Moon')
      data = { ...destination, id: changedTarget ? id(91) : destination.id }
    } else if (request.type === 'Galaxy') {
      data = { galaxy: 1, system: 1, observed_at: 1000, player_names: {}, positions: Array.from({ length: 15 }, (_, i) => ({ coordinates: { galaxy: 1, system: 1, position: i + 1 }, body: null, debris: null })) }
    } else {
      quotes.push(request.intent)
      if (hold) { hold = false; await new Promise<void>(resolve => { release = resolve }) }
      if (blocked) return route.fulfill({ status: 422, json: { code: 'GameRejected', game_code: blocked } })
      data = { intent: request.intent, profile_hash: 'a'.repeat(64), distance: 1000, speeds: [], duration_ms: Math.ceil(100000 * 100 / request.intent.speed_percent),
        fuel: '2000000', capacity: '5000000000', maximum_payload: '4998000000', slot_limit: '1', terms_hash: 'b'.repeat(64) }
    }
    await route.fulfill({ json: { protocol: 4, binding, request_id: request.context.request_id, viewer_revision: String(revision), sampled_at: Date.now(), as_of_ms: Date.now(), data } })
  })
  page.on('request', request => { if (request.url().endsWith('/commands')) launches++ })
  await page.goto(`/u/andromeda/b/${body.id}/reports/${header.id}`)
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
  await dialog.getByRole('button', { name: 'Use all 3 available Light Fighter' }).click()
  await expect(timing).toContainText('1m 40s')
  await expect(timing.getByRole('img', { name: 'Deuterium', exact: true })).toBeVisible()
  expect(quotes.at(-1)).toMatchObject({ origin: body.id, mission: 'Attack', ships: [{ owner: binding.player, ship_type: 'LightFighter', count: '3' }], destination, speed_percent: 100 })
  await dialog.getByLabel('Attacker Weapons Technology', { exact: true }).fill('100')
  // A delayed quote must not replace a more recent speed selection.
  hold = true
  await dialog.getByLabel('Simulator flight speed').selectOption('50')
  await expect.poll(() => release !== undefined).toBe(true)
  await expect(timing).not.toContainText('1m 40s')
  await dialog.getByLabel('Simulator flight speed').selectOption('20')
  await expect(timing).toContainText('8m 20s')
  const delayed = page.waitForResponse(r => r.url().endsWith('/world') && r.request().postDataJSON().intent?.speed_percent === 50)
  release!()
  await delayed
  await expect(timing).toContainText('8m 20s')
  await expect(timing).not.toContainText('3m 20s')
  // A viewer revision immediately invalidates a previously successful estimate.
  release = undefined
  hold = true
  revision++
  await refreshGame(page)
  await expect.poll(() => release !== undefined).toBe(true)
  await expect(timing).not.toContainText('8m 20s')
  release!()
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
  await expect(page).toHaveURL(new RegExp(`/b/${body.id}/dispatch.*mission=Attack.*target=moon`))
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
