
import { routeWorld } from './fixtures/game'
import { withFixtureResponse } from './fixtures/responses'
import { menuDestination } from './fixtures/navigation'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { test, expect } from './fixtures/test'
import { installGameFixture, refreshGame, binding, body, id } from './fixtures/game'
import { simulationCatalog } from './fixtures/simulation-catalog'
import observation from '../../../contracts/fixtures/espionage-expanded.json' with { type: 'json' }

import {catalog} from './fixtures/simulation-observation-catalog'


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
  await expect(plan.locator('details')).toHaveJSProperty('open', true)
  const prepare = plan.getByRole('button', { name: 'Review attack' })
  await expect(prepare).toBeDisabled()
  const planToggle = plan.locator('summary').filter({ hasText: 'Plan attack' })
  await planToggle.press('Enter')
  await expect(prepare).toBeVisible()
  await expect(prepare).toBeDisabled()
  await planToggle.press('Enter')
  await ship.fill('4')
  await expect(plan).not.toContainText('4 selected, 3 stationed')
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
  await dialog.getByRole('slider', {name:'Speed', exact:true}).fill('50')
  await expect.poll(() => release !== undefined).toBe(true)
  await expect(timing).not.toContainText('1m 40s')
  if (process.env.ORBIT_TEST_SCREENSHOTS === '1') {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      await plan.scrollIntoViewIfNeeded()
      await diagnosticScreenshot(page, { path: `test-results/simulation-report-pending-${width}.png` })
    }
  }
  await dialog.getByRole('slider', {name:'Speed', exact:true}).fill('20')
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
  await dialog.getByRole('slider', {name:'Speed', exact:true}).fill('30')
  await expect(timing).toContainText('Beginner protection prevents this mission')
  blocked = ''
  changedTarget = true
  await dialog.getByRole('slider', {name:'Speed', exact:true}).fill('40')
  await expect(timing).toContainText('The observed target has changed')
  changedTarget = false
  await dialog.getByRole('slider', {name:'Speed', exact:true}).fill('60')
  await expect(timing).toContainText('2m 47s')
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await plan.scrollIntoViewIfNeeded()
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    expect(await dialog.locator('input[id^="simulation-"]').evaluateAll(inputs => inputs.every(input => {
      const label = input.parentElement!.querySelector('label')!.getBoundingClientRect()
      const box = input.getBoundingClientRect()
      return label.right <= box.left + 1 || label.bottom <= box.top + 1
    }))).toBe(true)
    await diagnosticScreenshot(page, { path: `test-results/simulation-planning-${width}.png`, fullPage: false })
  }
  await planToggle.press('Enter')
  await expect(plan.locator('details')).toHaveJSProperty('open', false)
  await expect(timing).not.toBeVisible()
  await expect(prepare).toBeEnabled()
  await page.keyboard.press('Tab')
  await expect(prepare).toBeFocused()
  await withFixtureResponse(page, r => r.url().endsWith('/world') && r.request().postDataJSON().type === 'FleetQuote', () => page.keyboard.press('Enter'))
  const reviewPanel = page.getByRole('region', { name: 'Fleet quote', exact: true })
  await expect(reviewPanel).toBeFocused()
  expect(quotes.at(-1)).toMatchObject({origin: body.id, mission:'Attack', destination, speed_percent:60, ships:[{owner:binding.player, ship_type:'LightFighter',count:'3'}]})
  expect(launches).toBe(0)
  await page.getByRole('button', {name:'Back to edit mission'}).click()
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

test('the mobile Menu opens a fresh standalone simulator without requesting a report or launching a fleet', async ({page})=>{
  await page.setViewportSize({width:390,height:1000})
  await installGameFixture(page, {protocol:4,catalog:simulationCatalog,missions:{fleets:[],incoming:[],score_value_micro:'0',fleet_slots:'1'}})
  const requests: string[]=[]
  page.on('request', request=>{
    const path=new URL(request.url()).pathname
    if(path.includes('/reports/') || path.endsWith('/commands')) requests.push(path)
  })
  await withFixtureResponse(page, r => r.url().endsWith('/bootstrap'), () => page.goto(`/u/andromeda/b/${body.id}/overview`))
  await (await menuDestination(page,'Combat Simulator')).click()
  await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/combat-simulator`)
  await expect(page.getByRole('heading',{name:'Combat Simulator',exact:true})).toBeVisible()
  await page.getByLabel('Defender Light Fighter',{exact:true}).fill('2')
  await withFixtureResponse(page, r=>r.url().endsWith('/bootstrap'),()=>page.reload())
  await expect(page.getByLabel('Defender Light Fighter',{exact:true})).toHaveValue('0')
  expect(requests).toEqual([])
})
