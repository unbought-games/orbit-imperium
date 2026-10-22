import { captureCatalog } from './fixtures/catalog-capture'
import { test, expect, type Page } from '@playwright/test'
import { shellFixture, body, binding, refreshGame } from './fixtures/game'
import type { components } from '../src/contracts'

function production(): components['schemas']['ProductionDto'] {
  return {
    body: body.id,
    settings: {
      metal_mine: 100,
      crystal_mine: 100,
      deuterium_synthesizer: 100,
      solar_plant: 100,
      fusion_reactor: 100,
      solar_satellite: 100,
    },
    settings_revision: '1',
    editable: [
      'metal_mine',
      'crystal_mine',
      'deuterium_synthesizer',
      'solar_plant',
    ],
    gross_per_hour: {
      metal: '63000000',
      crystal: '37000000',
      deuterium: '10000000',
    },
    fuel_deuterium_per_hour: '0',
    net_deuterium_per_hour: { sign: 'Nonnegative', magnitude: '10000000' },
    energy_supply: '48400000',
    energy_demand: '22000000',
    utilization: '1000000',
    fuel_utilization: '1000000',
  }
}
async function setup(page: Page, blocked = false, commandReferences = false) {
  const economy = production()
  const planet = structuredClone(body)
  if (blocked) planet.amounts.metal = '0'
  const sent: components['schemas']['CommandEnvelopeV3'][] = []
  await shellFixture(page, {
    production: [economy],
    bodies: [planet],
    commandReferences,
  })
  await page.route('**/progression-options', async (route) => {
    const { context, request } = route.request().postDataJSON()
    const level = planet.levels[request.building as keyof typeof planet.levels]
    await route.fulfill({
      json: {
        protocol: 3,
        binding,
        request_id: context.request_id,
        viewer_revision: '1',
        sampled_at: Date.now(),
        as_of_ms: Date.now(),
        request,
        terms: {
          type: 'Building',
          profile_hash: 'a'.repeat(64),
          body: body.id,
          building: request.building,
          action: request.type,
          source_level: level,
          target_level: request.type === 'Demolition' ? level - 1 : level + 1,
          paid: { metal: '60000000', crystal: '15000000', deuterium: '0' },
          duration_ms: 76000,
          formula:
            request.type === 'Demolition'
              ? 'DemolitionClassic'
              : 'BuildingRedesign2011',
          facilities: [],
          required_energy: '35000000',
          reserve_fields: 1,
        },
        terms_hash: 'b'.repeat(64),
        blockers: blocked
          ? [
              {
                code: 'InsufficientResources',
                requirement: null,
                required: '60000000',
                actual: '0',
                resource: 'Metal',
                unit: 'MicroResource',
              },
            ]
          : [],
        estimates: {
          first_start_at: Date.now(),
          final_due_at: Date.now() + 76000,
        },
      },
    })
  })
  await page.route('**/commands', async (route) => {
    const envelope = route.request().postDataJSON()
    sent.push(envelope)
    if (envelope.command.type === 'SetProduction') {
      economy.settings = envelope.command.settings
      economy.settings_revision = String(Number(economy.settings_revision) + 1)
    }
    await route.fulfill({
      json: {
        protocol: 3,
        binding,
        command_id: envelope.command_id,
        admitted_at: Date.now(),
        executed_at: Date.now(),
        status: 'Committed',
        result_ids: [],
        minimum_viewer_revision: '1',
      },
    })
  })
  await page.goto(`/u/andromeda/b/${body.id}/resources`)
  await expect(page.locator('main h1')).toHaveText('Resources')
  return { economy, sent, planet }
}

test('tile upgrade arrow starts one quoted upgrade without opening details', async ({
  page,
}) => {
  const { planet, economy } = await setup(page, true)
  economy.gross_per_hour.metal = '0'
  await refreshGame(page)
  const quick = page.getByRole('button', {
    name: 'Start upgrade Metal Mine',
    exact: true,
  })
  await expect(
    page.getByRole('button', { name: 'Upgrade Metal Mine', exact: true }),
  ).toHaveAttribute('title', /Not enough resources/)
  await expect(quick).toHaveCount(0)
  planet.amounts.metal = '60000000'
  await refreshGame(page)
  await expect(quick).toBeVisible()
  const sent: components['schemas']['CommandEnvelopeV3'][] = []
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/commands', async (route) => {
    const envelope = route.request().postDataJSON()
    sent.push(envelope)
    await gate
    await route.fulfill({
      json: {
        protocol: 3,
        binding,
        command_id: envelope.command_id,
        admitted_at: Date.now(),
        executed_at: Date.now(),
        status: 'Rejected',
        code: 'InsufficientResources',
      },
    })
  })
  await quick.click()
  await expect.poll(() => sent.length).toBeGreaterThan(0)
  expect(new Set(sent.map((x) => x.command_id)).size).toBe(1)
  expect(sent[0].command).toEqual({
    type: 'StartUpgrade',
    body: body.id,
    building: 'MetalMine',
    expected_terms_hash: 'b'.repeat(64),
  })
  await expect(
    page.getByRole('region', { name: 'Progression quote' }),
  ).toHaveCount(0)
  await expect(
    page
      .getByRole('button', { name: 'Upgrade Metal Mine', exact: true })
      .getByLabel('Construction progress'),
  ).toContainText('Confirming')
  await expect(quick).toHaveCount(0)
  release()
  await expect(quick).toBeVisible()
})

test('unaffordable building tiles show resource shortages before opening and update with live balances', async ({
  page,
}) => {
  const { planet, economy } = await setup(page, true)
  economy.gross_per_hour.metal = '0'
  await refreshGame(page)
  const tile = page.getByRole('button', {
    name: 'Upgrade Metal Mine',
    exact: true,
  })
  await expect(tile).toHaveAttribute('title', /Not enough resources/)
  await expect(tile).toBeEnabled()
  await tile.click()
  await expect(
    page.getByRole('button', { name: 'Confirm upgrade' }),
  ).toBeDisabled()
  planet.amounts.metal = '60000000'
  await refreshGame(page)
  await expect(tile).not.toHaveAttribute('title', /Not enough resources/)
  await expect(
    page.getByRole('button', { name: 'Confirm upgrade' }),
  ).toBeEnabled()
  planet.amounts.metal = '59999999'
  await refreshGame(page)
  await expect(tile).toHaveAttribute('title', /Not enough resources/)
})

test('unaffordable tiles stay striped when another building starts and quote refresh is slow', async ({
  page,
}) => {
  const planet = structuredClone(body)
  planet.amounts.metal = '0'
  await refreshGame(page)
  const constructions: components['schemas']['Construction3'][] = []
  await shellFixture(page, { bodies: [planet], constructions })
  let blocked = false
  let requests = 0
  await page.route('**/progression-options', async (route) => {
    requests++
    if (blocked) return route.abort()
    const { context, request } = route.request().postDataJSON()
    await route.fulfill({
      json: {
        protocol: 3,
        binding,
        request_id: context.request_id,
        viewer_revision: '1',
        sampled_at: Date.now(),
        as_of_ms: Date.now(),
        request,
        terms: {
          type: 'Building',
          profile_hash: 'a'.repeat(64),
          body: body.id,
          building: request.building,
          action: 'Upgrade',
          source_level:
            planet.levels[request.building as keyof typeof planet.levels],
          target_level:
            planet.levels[request.building as keyof typeof planet.levels] + 1,
          paid: { metal: '60000000', crystal: '0', deuterium: '0' },
          duration_ms: 76000,
          formula: 'BuildingRedesign2011',
          facilities: [],
          required_energy: '0',
          reserve_fields: 1,
        },
        terms_hash: 'b'.repeat(64),
        blockers: [],
        estimates: null,
      },
    })
  })
  await page.goto(`/u/andromeda/b/${body.id}/resources`)
  const metal = page.getByRole('button', {
    name: 'Upgrade Metal Mine',
    exact: true,
  })
  await expect(metal).toHaveAttribute('title', /Not enough resources/)
  blocked = true
  const before = requests
  constructions.push({
    id: '00000000-0000-4000-8000-000000000010',
    body: body.id,
    building: 'SolarPlant',
    target_level: 2,
    due_at: Date.now() + 76000,
    paid: { metal: '0', crystal: '0', deuterium: '0' },
  })
  await refreshGame(page)
  await expect(
    page
      .getByRole('button', { name: 'Upgrade Solar Plant', exact: true })
      .getByLabel('Construction progress'),
  ).toBeVisible()
  expect(requests).toBe(before)
  await expect(metal).toHaveAttribute('title', /Not enough resources/)
  planet.amounts.metal = '60000000'
  await refreshGame(page)
  await expect(metal).not.toHaveAttribute('title', /Not enough resources/)
})

test('Improve and resource blockers follow current balances while the quote stays open', async ({
  page,
}) => {
  const { planet, sent, economy } = await setup(page, true)
  // Keep the one-micro-unit precision boundary stable while other balances poll.
  economy.gross_per_hour.crystal = '0'
  await refreshGame(page)
  let quotes = 0
  page.on('request', (request) => {
    if (request.url().endsWith('/progression-options')) quotes++
  })
  await page
    .getByRole('button', { name: 'Upgrade Metal Mine', exact: true })
    .click()
  const confirm = page.getByRole('button', { name: 'Confirm upgrade' })
  await expect(confirm).toBeDisabled()
  await expect(page.getByLabel('Action blockers')).toContainText('current 0')
  planet.amounts.metal = '60000000'
  await refreshGame(page)
  await expect(confirm).toBeEnabled()
  await expect(page.getByLabel('Action blockers')).toHaveCount(0)
  planet.amounts.crystal = '14999999'
  await refreshGame(page)
  await expect(confirm).toBeDisabled()
  await expect(page.getByLabel('Action blockers')).toContainText('crystal')
  planet.amounts.crystal = '15000000'
  await refreshGame(page)
  await expect(confirm).toBeEnabled()
  expect(quotes).toBe(1)
  expect(sent).toHaveLength(0)
})

test('an open quote refreshes when a confirmed building level changes', async ({
  page,
}) => {
  const { planet } = await setup(page)
  await page
    .getByRole('button', { name: 'Upgrade Metal Mine', exact: true })
    .click()
  const quote = page.getByRole('region', { name: 'Progression quote' })
  await quote.getByText('Construction terms', { exact: true }).click()
  await expect(
    quote.getByText('Full refund if cancelled before completion.', {
      exact: true,
    }),
  ).toBeVisible()
  await expect(quote).not.toContainText('A quote reserves nothing')
  await expect(quote).toContainText('Required to improve to level 2')
  planet.levels.MetalMine = 2
  await refreshGame(page)
  await expect(quote).toContainText('Required to improve to level 3')
})

test('resource settings keep production rules and fuel figures without repeated helpers', async ({
  page,
}) => {
  await setup(page)
  await page
    .getByRole('button', { name: 'Resource settings', exact: true })
    .click()
  const settings = page.getByRole('region', { name: 'Production controls' })
  await expect(settings.getByRole('combobox')).toHaveCount(6)
  await expect(settings).toContainText('Deuterium fuel: 0 / hour')
  await expect(settings).toContainText('Net deuterium: 10 / hour')
  await expect(settings).toContainText(
    'Full storage stops production; excess resources remain usable.',
  )
  await expect(settings).toContainText(
    'Energy shortages reduce output without changing your settings.',
  )
  await expect(settings).not.toContainText('Confirmed economy')
  await expect(settings).not.toContainText('output · energy demand')
  await expect(settings).not.toContainText('Save applies all settings')
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({
      path: `test-results/copy-production-${width}.png`,
      fullPage: true,
    })
  }
})

test('unedited production controls follow current saved settings', async ({
  page,
}) => {
  const { economy } = await setup(page)
  await page
    .getByRole('button', { name: 'Resource settings', exact: true })
    .click()
  await expect(page.getByLabel('metal mine production')).toHaveValue('100')
  economy.settings = { ...economy.settings, metal_mine: 70 }
  await refreshGame(page)
  economy.settings_revision = '2'
  await refreshGame(page)
  await expect(page.getByLabel('metal mine production')).toHaveValue('70')
  await expect(
    page.getByRole('button', { name: 'Use current revision for this draft' }),
  ).toHaveCount(0)
})

test('resource cost images expose live details on hover and keyboard focus', async ({
  page,
}) => {
  const { planet, economy, sent } = await setup(page, true)
  economy.gross_per_hour.metal = '0'
  await refreshGame(page)
  await page
    .getByRole('button', { name: 'Upgrade Metal Mine', exact: true })
    .click()
  const metal = page
    .getByLabel('Required resources')
    .getByRole('button', { name: 'Metal details' })
  await expect(metal.getByText('Metal', { exact: true })).toBeVisible()
  await expect(metal.getByText('60', { exact: true })).toBeVisible()
  const amountStyle = await metal
    .getByText('60', { exact: true })
    .evaluate((element) => ({
      size: parseFloat(getComputedStyle(element).fontSize),
      color: getComputedStyle(element).color,
    }))
  const nameSize = await metal
    .getByText('Metal', { exact: true })
    .evaluate((element) => parseFloat(getComputedStyle(element).fontSize))
  expect(amountStyle.size).toBeGreaterThan(nameSize)
  expect(amountStyle.color).toBe(
    await metal.evaluate((element) => getComputedStyle(element).color),
  )
  await metal.hover()
  const details = page.getByRole('dialog', { name: 'Metal', exact: true })
  await expect(details).toContainText('Required 60')
  await expect(details).toContainText('Available 0')
  await expect(details).toContainText('Shortfall 60')
  planet.amounts.metal = '60000000'
  await refreshGame(page)
  await expect(details).toContainText('Available 60')
  await expect(details).not.toContainText('Shortfall')
  await page.keyboard.press('Escape')
  await expect(details).toHaveCount(0)
  await expect(
    page.getByRole('region', { name: 'Progression quote' }),
  ).toBeVisible()
  await page.mouse.move(0, 0)
  const demolition = page.getByRole('button', { name: 'Demolish Metal Mine' })
  await demolition.focus()
  await expect(demolition).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(metal).toBeFocused()
  await expect(details).toBeVisible()
  expect(sent).toHaveLength(0)
})

test('resource cost details open by tap and fit a phone viewport', async ({
  browser,
}) => {
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width: 390, height: 844 },
  })
  const page = await context.newPage()
  await setup(page)
  await page
    .getByRole('button', { name: 'Upgrade Metal Mine', exact: true })
    .tap()
  await page
    .getByLabel('Required resources')
    .getByRole('button', { name: 'Crystal details' })
    .tap()
  const details = page.getByRole('dialog', { name: 'Crystal', exact: true })
  await expect(details).toContainText('Required 15')
  await expect(details).toContainText('Available 9,420')
  const bounds = await details.boundingBox()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390)
  await page.keyboard.press('Escape')
  await expect(details).toHaveCount(0)
  await context.close()
})

test('level zero buildings offer upgrades without a tear-down option', async ({
  page,
}) => {
  await setup(page)
  await page
    .getByRole('button', { name: 'Upgrade Deuterium Synthesizer', exact: true })
    .click()
  const quote = page.getByRole('region', { name: 'Progression quote' })
  await expect(quote).toContainText('Level 0')
  await expect(
    quote.getByRole('button', { name: 'Confirm upgrade' }),
  ).toBeVisible()
  await expect(
    quote.getByRole('button', { name: 'Demolish Deuterium Synthesizer' }),
  ).toHaveCount(0)
})

test('building tiles open top details, preserve quoted commands, and restore keyboard focus', async ({
  page,
}) => {
  const { sent } = await setup(page)
  await expect(
    page.getByRole('button', { name: 'Resource settings', exact: true }),
  ).toBeVisible()
  const tile = page.getByRole('button', {
    name: 'Upgrade Metal Mine',
    exact: true,
  })
  await tile.focus()
  await page.keyboard.press('Enter')
  const quote = page.getByRole('region', { name: 'Progression quote' })
  await expect(quote).toContainText('Metal Mine')
  await expect(quote).toContainText('1m 16s')
  await expect(quote).toContainText('35')
  await expect(quote).toBeFocused()
  expect(sent).toHaveLength(0)
  await page.getByRole('button', { name: 'Demolish Metal Mine' }).click()
  await expect(quote).toContainText('Tear down to level 0')
  await page.getByRole('button', { name: 'Confirm demolition' }).click()
  await expect.poll(() => sent.length).toBe(1)
  expect(sent[0].command).toEqual({
    type: 'StartDemolition',
    body: body.id,
    building: 'MetalMine',
    expected_terms_hash: 'b'.repeat(64),
  })
  await expect(quote).toBeVisible()
  await quote.focus()
  await page.keyboard.press('Escape')
  await expect(quote).toBeHidden()
  await expect(tile).toBeFocused()
})

test('production autosaves rapid edits after reconciliation and keeps confirmed totals', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 })
  const { economy } = await setup(page)
  const sent: components['schemas']['CommandEnvelopeV3'][] = []
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/commands', async (route) => {
    const envelope = route.request().postDataJSON()
    sent.push(envelope)
    if (sent.length === 1) await gate
    // Another client's unrelated edit must survive the queued local changes.
    economy.settings = { ...envelope.command.settings, crystal_mine: 80 }
    economy.settings_revision = String(Number(economy.settings_revision) + 1)
    economy.gross_per_hour.metal = '7000000'
    await route.fulfill({
      json: {
        protocol: 3,
        binding,
        command_id: envelope.command_id,
        admitted_at: Date.now(),
        executed_at: Date.now(),
        status: 'Committed',
        result_ids: [],
        minimum_viewer_revision: '1',
      },
    })
  })
  await page
    .getByRole('button', { name: 'Resource settings', exact: true })
    .click()
  const panel = page.getByRole('region', { name: 'Production controls' })
  await expect(page.getByLabel('fusion reactor production')).toBeDisabled()
  await expect(page.getByLabel('solar satellite production')).toBeDisabled()
  await expect(
    page.getByRole('button', { name: 'Save production', exact: true }),
  ).toHaveCount(0)
  const totals = panel
    .locator('div')
    .filter({ has: page.getByText('Energy balance', { exact: true }) })
    .first()
  const confirmedTotals = await totals.innerText()
  await page.getByLabel('metal mine production').selectOption('50')
  await expect.poll(() => sent.length).toBe(1)
  await page.getByLabel('metal mine production').selectOption('100')
  await page.getByLabel('solar plant production').selectOption('60')
  await expect(panel.getByRole('status')).toContainText(
    'Saving production changes',
  )
  expect(await totals.innerText()).toBe(confirmedTotals)
  expect(sent).toHaveLength(1)
  await panel.getByRole('status').scrollIntoViewIfNeeded()
  await page.screenshot({
    path: 'test-results/production-autosave-pending-390.png',
  })
  await page.getByRole('button', { name: 'Close resource settings' }).click()
  // A route change unmounts the controls while the user edits remain queued.
  await page.getByRole('link', { name: 'Facilities', exact: true }).click()
  await page.getByRole('link', { name: 'Resources', exact: true }).click()
  await page
    .getByRole('button', { name: 'Resource settings', exact: true })
    .click()
  await expect(page.getByLabel('metal mine production')).toHaveValue('100')
  await expect(page.getByLabel('solar plant production')).toHaveValue('60')
  release()
  await expect.poll(() => sent.length).toBe(2)
  expect(sent[1].command).toMatchObject({
    type: 'SetProduction',
    expected_settings_revision: '2',
    settings: {
      metal_mine: 100,
      crystal_mine: 80,
      solar_plant: 60,
      fusion_reactor: 100,
      solar_satellite: 100,
    },
  })
  await expect(panel.getByRole('status')).toHaveText(
    'All changes saved automatically.',
  )
  await expect(page.getByLabel('crystal mine production')).toHaveValue('80')
  expect(await totals.innerText()).not.toBe(confirmedTotals)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await panel.getByRole('status').scrollIntoViewIfNeeded()
  await page.screenshot({
    path: 'test-results/production-autosave-saved-390.png',
  })
})

test('production rejection retains edits and retry preserves unrelated server changes', async ({
  page,
}) => {
  const { economy, sent } = await setup(page)
  await page.route('**/commands', async (route) => {
    const envelope = route.request().postDataJSON()
    economy.settings.crystal_mine = 80
    economy.settings_revision = '2'
    await route.fulfill({
      json: {
        protocol: 3,
        binding,
        command_id: envelope.command_id,
        admitted_at: Date.now(),
        executed_at: Date.now(),
        status: 'Rejected',
        code: 'SettingsChanged',
      },
    })
  })
  await page
    .getByRole('button', { name: 'Resource settings', exact: true })
    .click()
  await page.getByLabel('metal mine production').selectOption('50')
  const panel = page.getByRole('region', { name: 'Production controls' })
  await expect(panel.getByRole('alert')).toContainText('rejected')
  await expect(page.getByLabel('metal mine production')).toHaveValue('50')
  expect(sent).toHaveLength(0)
  await panel.screenshot({
    path: 'test-results/production-autosave-rejected-1440.png',
  })
  await page.route('**/commands', async (route) => {
    const envelope = route.request().postDataJSON()
    sent.push(envelope)
    economy.settings = envelope.command.settings
    economy.settings_revision = '3'
    await route.fulfill({
      json: {
        protocol: 3,
        binding,
        command_id: envelope.command_id,
        admitted_at: Date.now(),
        executed_at: Date.now(),
        status: 'Committed',
        result_ids: [],
        minimum_viewer_revision: '1',
      },
    })
  })
  await panel.getByRole('button', { name: 'Retry production changes' }).click()
  await expect.poll(() => sent.length).toBe(1)
  expect(sent[0].command).toMatchObject({
    expected_settings_revision: '2',
    settings: { metal_mine: 50, crystal_mine: 80 },
  })
  await expect(panel.getByRole('status')).toHaveText(
    'All changes saved automatically.',
  )
})

for (const restoredCommand of ['production', 'legacy upgrade'] as const) {
  test(`production edits survive a restored ${restoredCommand} command`, async ({
    page,
  }) => {
    const { economy } = await setup(page)
    const sent: components['schemas']['CommandEnvelopeV3'][] = []
    const receipts = new Map<string, components['schemas']['BoundReceipt3']>()
    await page.route('**/commands', async (route) => {
      const envelope = route.request().postDataJSON()
      sent.push(envelope)
      const pending: components['schemas']['BoundReceipt3'] = {
        protocol: 3,
        binding,
        command_id: envelope.command_id,
        admitted_at: Date.now(),
        executed_at: null,
        status: 'Pending',
      }
      if (sent.length === 1) {
        receipts.set(envelope.command_id, pending)
        await route.fulfill({ json: pending })
      } else {
        economy.settings = envelope.command.settings
        economy.settings_revision = '3'
        await route.fulfill({
          json: {
            ...pending,
            status: 'Committed',
            executed_at: Date.now(),
            minimum_viewer_revision: '1',
            result_ids: [],
          },
        })
      }
    })
    await page.route('**/commands/*', (route) => {
      const id = new URL(route.request().url()).pathname.split('/').pop()!
      return route.fulfill({ json: receipts.get(id) })
    })
    if (restoredCommand === 'production') {
      await page
        .getByRole('button', { name: 'Resource settings', exact: true })
        .click()
      await page.getByLabel('metal mine production').selectOption('50')
    } else {
      await page
        .getByRole('button', { name: 'Start upgrade Metal Mine', exact: true })
        .click()
    }
    await expect.poll(() => sent.length).toBe(1)
    // Wait for durable receipt storage, then emulate an older saved command
    // that predates submitted_intent. Reload must preserve command recovery.
    await expect
      .poll(() =>
        page.evaluate(() =>
          Object.entries(sessionStorage)
            .filter(([key]) => key.startsWith('orbit:attempts:v3:'))
            .some(([, value]) => JSON.parse(value).status === 'pending'),
        ),
      )
      .toBe(true)
    if (restoredCommand === 'legacy upgrade')
      await page.evaluate(() => {
        for (const [key, value] of Object.entries(sessionStorage)) {
          if (!key.startsWith('orbit:attempts:v3:')) continue
          const attempt = JSON.parse(value)
          delete attempt.submitted_intent
          sessionStorage.setItem(key, JSON.stringify(attempt))
        }
      })
    await page.reload()
    await page
      .getByRole('button', { name: 'Resource settings', exact: true })
      .click()
    const panel = page.getByRole('region', { name: 'Production controls' })
    const metal = page.getByLabel('metal mine production')
    await expect(metal).toHaveValue(
      restoredCommand === 'production' ? '50' : '100',
    )
    const totals = panel
      .locator('div')
      .filter({ has: page.getByText('Energy balance', { exact: true }) })
      .first()
    const confirmedTotals = await totals.innerText()
    const desired = restoredCommand === 'production' ? '100' : '50'
    await metal.selectOption(desired)
    await expect(metal).toHaveValue(desired)
    await expect(panel.getByRole('status')).toContainText(
      'Saving production changes',
    )
    expect(sent).toHaveLength(1)
    expect(await totals.innerText()).toBe(confirmedTotals)
    economy.settings = {
      ...economy.settings,
      metal_mine: restoredCommand === 'production' ? 50 : 100,
      crystal_mine: 80,
    }
    economy.settings_revision = '2'
    if (restoredCommand === 'legacy upgrade') {
      await refreshGame(page)
      await expect(page.getByLabel('crystal mine production')).toHaveValue('80')
    }
    // The production command commits; the legacy upgrade rejects. Either
    // terminal result should release the queued edit without a Retry click.
    const original = receipts.get(sent[0].command_id)!
    receipts.set(
      sent[0].command_id,
      restoredCommand === 'production'
        ? {
            ...original,
            status: 'Committed',
            executed_at: Date.now(),
            minimum_viewer_revision: '1',
            result_ids: [],
          }
        : {
            ...original,
            status: 'Rejected',
            executed_at: Date.now(),
            code: 'InsufficientResources',
          },
    )
    await refreshGame(page)
    await expect.poll(() => sent.length).toBe(2)
    expect(sent[1].command).toMatchObject({
      type: 'SetProduction',
      expected_settings_revision: '2',
      settings: { metal_mine: Number(desired), crystal_mine: 80 },
    })
    await expect(panel.getByRole('status')).toHaveText(
      'All changes saved automatically.',
    )
    await expect(metal).toHaveValue(desired)
    await expect(panel.getByRole('alert')).toHaveCount(0)
  })
}

test('resources fit compact and touch layouts in all three states', async ({
  page,
}) => {
  await setup(page)
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    for (const state of ['scene', 'building', 'settings']) {
      if (state === 'building')
        await page
          .getByRole('button', { name: 'Upgrade Metal Mine', exact: true })
          .click()
      if (state === 'settings')
        await page
          .getByRole('button', { name: 'Resource settings', exact: true })
          .click()
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${width} ${state}`,
      ).toBe(true)
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.screenshot({
        animations: 'disabled',
        path: `test-results/resources-${state}-${width}.png`,
        fullPage: true,
      })
      if (state === 'building')
        await page
          .getByRole('button', { name: 'Dismiss quote', exact: true })
          .click()
      if (state === 'settings')
        await page
          .getByRole('button', { name: 'Close resource settings' })
          .click()
    }
  }
})

test('a late inspection cannot overwrite another building or reopen dismissed details', async ({
  page,
}) => {
  const { sent } = await setup(page)
  let release = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(
    '**/progression-options',
    async (route) => {
      await held
      await route.fallback()
    },
    { times: 1 },
  )
  await page
    .getByRole('button', { name: 'Upgrade Metal Mine', exact: true })
    .click()
  await expect(page.getByText('Loading building details…')).toBeVisible()
  await page
    .getByRole('button', { name: 'Upgrade Crystal Mine', exact: true })
    .click()
  const quote = page.getByRole('region', { name: 'Progression quote' })
  await expect(
    quote.getByRole('heading', { name: 'Crystal Mine', exact: true }),
  ).toBeVisible()
  await expect(
    quote.getByRole('button', { name: 'Confirm upgrade' }),
  ).toBeEnabled()
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith('/progression-options') &&
      r.request().postDataJSON().request.building === 'MetalMine',
  )
  release()
  await response
  await expect(
    quote.getByRole('heading', { name: 'Crystal Mine', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Dismiss quote' }).click()
  await expect(quote).toHaveCount(0)
  expect(sent).toHaveLength(0)
})

test('blocked quotes cannot purchase and details remain usable with reduced motion and enlarged text', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const { sent } = await setup(page, true)
  await page.setViewportSize({ width: 390, height: 844 })
  await page
    .getByRole('button', { name: 'Upgrade Metal Mine', exact: true })
    .click()
  await expect(page.getByLabel('Action blockers')).toContainText(
    'Insufficient Resources',
  )
  await expect(
    page.getByRole('button', { name: 'Confirm upgrade' }),
  ).toBeDisabled()
  await page.addStyleTag({
    content:
      'html { font-size: 200% !important } * { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; }',
  })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.getByRole('button', { name: 'Dismiss quote' }).click()
  await page
    .getByRole('button', { name: 'Resource settings', exact: true })
    .click()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  expect(sent).toHaveLength(0)
})

test('legacy resource catalogs retain cancellation and refresh the open upgrade after completion', async ({
  page,
}) => {
  const constructions: components['schemas']['Construction3'][] = []
  const planet = structuredClone(body)
  await shellFixture(page, { protocol: 2, constructions, bodies: [planet] })
  const sent: components['schemas']['CommandEnvelopeV2'][] = []
  let releaseUpgrade!: () => void
  const upgradeGate = new Promise<void>((resolve) => {
    releaseUpgrade = resolve
  })
  let failNextQuote = true
  await page.route('**/quotes', async (route) => {
    if (failNextQuote) {
      failNextQuote = false
      await route.fulfill({ status: 422, json: { code: 'Unavailable' } })
      return
    }
    const { context, request } = route.request().postDataJSON()
    await route.fulfill({
      json: {
        protocol: 2,
        binding,
        request_id: context.request_id,
        viewer_revision: '1',
        sampled_at: Date.now(),
        as_of_ms: Date.now(),
        request,
        terms: {
          profile_hash: 'a'.repeat(64),
          terms_hash: (planet.levels.MetalMine === 1 ? 'b' : 'c').repeat(64),
          cost: { metal: '60000000', crystal: '15000000', deuterium: '0' },
          duration: 76000,
          target_level: planet.levels.MetalMine + 1,
          fuel: '0',
          capacity: '0',
          maximum_payload: '0',
        },
      },
    })
  })
  await page.route('**/commands', async (route) => {
    const envelope = route.request().postDataJSON()
    sent.push(envelope)
    if (envelope.command.type === 'StartUpgrade') await upgradeGate
    if (envelope.command.type === 'StartUpgrade')
      constructions.push({
        id: '00000000-0000-4000-8000-000000000010',
        body: body.id,
        building: 'MetalMine',
        target_level: planet.levels.MetalMine + 1,
        due_at: Date.now() + 76000,
        paid: { metal: '60000000', crystal: '15000000', deuterium: '0' },
      })
    if (envelope.command.type === 'CancelConstruction') constructions.length = 0
    await route.fulfill({
      json: {
        protocol: 2,
        binding,
        command_id: envelope.command_id,
        admitted_at: Date.now(),
        executed_at: Date.now(),
        status: 'Committed',
        result_ids: [],
        minimum_viewer_revision: '1',
      },
    })
  })
  await page.goto(`/u/andromeda/b/${body.id}/resources`)
  await expect(
    page.getByRole('button', { name: 'Resource settings', exact: true }),
  ).toBeDisabled()
  await page
    .getByRole('button', { name: 'Upgrade Metal Mine', exact: true })
    .click()
  await expect(
    page.getByRole('region', { name: 'Upgrade quote' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Confirm upgrade', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Dismiss', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Upgrade Metal Mine', exact: true }),
  ).toBeFocused()
  await page
    .getByRole('button', { name: 'Upgrade Metal Mine', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Confirm upgrade', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'Upgrade Metal Mine', exact: true }),
  ).toBeEnabled()
  releaseUpgrade()
  await expect(
    page.getByRole('region', { name: 'Construction status' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Upgrade Metal Mine', exact: true }),
  ).toBeEnabled()
  await expect(
    page.getByRole('button', { name: 'Upgrade Fusion Reactor', exact: true }),
  ).toHaveAttribute('title', 'Fusion Reactor · unavailable in this universe')
  expect(sent[0].command).toMatchObject({
    type: 'StartUpgrade',
    body: body.id,
    building: 'MetalMine',
    expected_terms_hash: 'b'.repeat(64),
  })
  await expect(
    page.getByRole('region', { name: 'Upgrade quote' }),
  ).toBeVisible()
  await page
    .getByRole('region', { name: 'Upgrade quote' })
    .getByRole('button', { name: 'Cancel construction', exact: true })
    .click()
  await expect(
    page.getByRole('region', { name: 'Construction status' }),
  ).toHaveCount(0)
  expect(sent[1].command).toEqual({
    type: 'CancelConstruction',
    operation: '00000000-0000-4000-8000-000000000010',
  })
  const pane = page.getByRole('region', { name: 'Upgrade quote' })
  await pane
    .getByRole('button', { name: 'Confirm upgrade', exact: true })
    .click()
  await expect(
    pane.getByRole('region', { name: 'Active construction' }),
  ).toBeVisible()
  planet.levels.MetalMine = 2
  await refreshGame(page)
  constructions.length = 0
  await expect(
    pane.getByRole('heading', { name: 'Upgrade to level 3', exact: true }),
  ).toBeVisible()
  await pane
    .getByRole('button', { name: 'Confirm upgrade', exact: true })
    .click()
  await expect.poll(() => sent.length).toBe(4)
  expect(sent[3].command).toMatchObject({
    type: 'StartUpgrade',
    expected_terms_hash: 'c'.repeat(64),
  })
})

test('stockpiles, energy, and signed hourly rates round down to whole units', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const economy = production()
  economy.net_deuterium_per_hour = { sign: 'Negative', magnitude: '3500000' }
  await refreshGame(page)
  await shellFixture(page, { production: [economy] })
  const strip = page.getByLabel('Current resources')
  await strip.getByRole('button', { name: 'Metal details' }).click()
  await expect(
    page.getByRole('dialog', { name: 'Metal', exact: true }),
  ).toContainText('Production +63 / hour')
  await page.keyboard.press('Escape')
  await strip.getByRole('button', { name: 'Deuterium details' }).click()
  await expect(
    page.getByRole('dialog', { name: 'Deuterium', exact: true }),
  ).toContainText('Net production -4 / hour')
  await page.keyboard.press('Escape')
  await expect(
    strip.getByRole('button', { name: 'Energy details' }).locator('strong'),
  ).toHaveText('26')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

for (const [pageName, building, title] of [
  ['resources', 'MetalMine', 'Metal Mine'],
  ['facilities', 'RoboticsFactory', 'Robotics Factory'],
] as const) {
  test(`construction cancels from ${pageName} building details without an upgrade quote`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const constructions: components['schemas']['Construction3'][] = [
      {
        id: '00000000-0000-4000-8000-000000000010',
        body: body.id,
        building,
        target_level: 2,
        due_at: Date.now() + 76000,
        paid: { metal: '60000000', crystal: '15000000', deuterium: '0' },
      },
    ]
    await shellFixture(page, {
      constructions,
      catalog: [
        {
          key: { kind: 'Building', id: building },
          enabled: true,
          requirements: [],
          mobile: false,
          body_kinds: ['Planet'],
        },
      ],
    })
    await page.route('**/progression-options', (route) => route.abort())
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let reject = true
    const sent = new Map<string, components['schemas']['CommandEnvelopeV3']>()
    const receipts = new Map<string, components['schemas']['BoundReceipt3']>()
    const deliveries: string[] = []
    await page.route('**/commands', async (route) => {
      const envelope = route.request().postDataJSON()
      deliveries.push(envelope.command_id)
      const previous = sent.get(envelope.command_id)
      if (previous) expect(envelope).toEqual(previous)
      else {
        sent.set(envelope.command_id, envelope)
        receipts.set(envelope.command_id, {
          protocol: 3,
          binding,
          command_id: envelope.command_id,
          admitted_at: Date.now(),
          executed_at: Date.now(),
          ...(reject
            ? { status: 'Rejected', code: 'OperationNotActive' }
            : {
                status: 'Committed',
                result_ids: [],
                minimum_viewer_revision: '1',
              }),
        })
      }
      if (deliveries.length === 1) return route.abort('connectionreset')
      await gate
      const receipt = receipts.get(envelope.command_id)!
      if (receipt.status === 'Committed') constructions.length = 0
      await route.fulfill({ json: receipt })
    })
    await page.goto(`/u/andromeda/b/${body.id}/${pageName}`)
    await expect(
      page.getByRole('complementary', { name: 'Activity' }),
    ).toHaveCount(0)
    await page
      .getByRole('button', { name: `Upgrade ${title}`, exact: true })
      .click()
    const pane = page.getByRole('region', { name: 'Progression quote' })
    await expect(pane).toContainText('level 2')
    await expect(pane).toContainText('60 metal')
    const cancel = pane.getByRole('button', {
      name: 'Cancel construction',
      exact: true,
    })
    await expect(cancel).toBeEnabled()
    await expect(
      pane.getByRole('button', { name: 'Confirm upgrade' }),
    ).toHaveCount(0)
    await cancel.click()
    await expect(cancel).toBeDisabled()
    await expect(pane).toContainText('Cancelling')
    // The first response was lost; recovery must replay the original identity.
    await expect.poll(() => deliveries.length).toBeGreaterThan(1)
    expect(sent.size).toBe(1)
    expect([...sent.values()][0].command).toEqual({
      type: 'CancelConstruction',
      operation: constructions[0].id,
    })
    release()
    await expect(cancel).toBeEnabled()
    reject = false
    await cancel.click()
    await expect.poll(() => sent.size).toBe(2)
    await expect(cancel).toHaveCount(0)
  })
}

for (const [protocol, pageName, building, title] of [
  [3, 'resources', 'MetalMine', 'Metal Mine'],
  [2, 'resources', 'MetalMine', 'Metal Mine'],
  [3, 'facilities', 'RoboticsFactory', 'Robotics Factory'],
] as const) {
  test(`building grid shows confirmed construction on ${pageName} protocol ${protocol}`, async ({
    page,
  }) => {
    const planet = structuredClone(body)
    const constructions: components['schemas']['Construction3'][] = [
      {
        id: '00000000-0000-4000-8000-000000000010',
        body: body.id,
        building,
        target_level: planet.levels[building] + 1,
        due_at: Date.now() + 109000,
        paid: { metal: '0', crystal: '0', deuterium: '0' },
      },
    ]
    await shellFixture(page, {
      protocol,
      constructions,
      bodies: [planet],
      catalog: [
        {
          key: { kind: 'Building', id: building },
          enabled: true,
          requirements: [],
          mobile: false,
          body_kinds: ['Planet'],
        },
      ],
    })
    await page.goto(`/u/andromeda/b/${body.id}/${pageName}`)
    const tile = page.getByRole('button', {
      name: `Upgrade ${title}`,
      exact: true,
    })
    const progress = tile.getByLabel('Construction progress')
    await expect(progress).toContainText(/1m \d+s/)
    await expect(
      progress.getByLabel(`Target level ${planet.levels[building] + 1}`),
    ).toBeVisible()
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 })
      await expect(progress).toBeVisible()
      const tileBox = await tile.boundingBox(),
        progressBox = await progress.boundingBox()
      expect(progressBox!.x).toBeGreaterThanOrEqual(tileBox!.x)
      expect(progressBox!.x + progressBox!.width).toBeLessThanOrEqual(
        tileBox!.x + tileBox!.width,
      )
    }
    constructions.length = 0
    planet.levels[building]++
    await refreshGame(page)
    await expect(progress).toHaveCount(0)
  })
}

test('mobile construction starts visibly before the server responds and rejection rolls back', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setup(page)
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/commands', async (route) => {
    const envelope = route.request().postDataJSON()
    await gate
    await route.fulfill({
      json: {
        protocol: 3,
        binding,
        command_id: envelope.command_id,
        admitted_at: Date.now(),
        executed_at: Date.now(),
        status: 'Rejected',
        code: 'InsufficientResources',
      },
    })
  })
  await page
    .getByRole('button', { name: 'Upgrade Metal Mine', exact: true })
    .click()
  await page.getByRole('button', { name: 'Confirm upgrade' }).click()
  const notice = page.getByRole('region', { name: 'Construction status' })
  await expect(notice).toContainText('Metal Mine')
  await expect(notice).toContainText('level 2')
  await expect(notice).toContainText(/seconds remaining/)
  await expect(notice).toContainText('Submitting')
  const tileProgress = page
    .getByRole('button', { name: 'Upgrade Metal Mine', exact: true })
    .getByLabel('Construction progress')
  await expect(tileProgress).toContainText('Confirming')
  await expect(
    page
      .getByRole('region', { name: 'Progression quote' })
      .getByRole('region', { name: 'Active construction' }),
  ).toContainText('Confirming')
  await notice.scrollIntoViewIfNeeded()
  await expect(notice).toBeInViewport()
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await notice.scrollIntoViewIfNeeded()
  await expect(notice).toBeInViewport()
  await expect(page.getByText('Action log', { exact: true })).toHaveCount(0)
  await page.screenshot({
    path: 'test-results/construction-pending-mobile.png',
  })
  release()
  await expect(page.getByLabel('Action needs attention')).toContainText(
    'Action rejected',
  )
  await expect(notice).toHaveCount(0)
  await expect(tileProgress).toHaveCount(0)
  await page.getByRole('button', { name: 'Dismiss notice' }).click()
  await expect(page.getByLabel('Action needs attention')).toHaveCount(0)
})

test('construction cancellation is reachable in the in-flow notice and recovers on rejection', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const constructions: components['schemas']['Construction3'][] = [
    {
      id: '00000000-0000-4000-8000-000000000010',
      body: body.id,
      building: 'MetalMine',
      target_level: 2,
      due_at: Date.now() + 76000,
      paid: { metal: '60000000', crystal: '15000000', deuterium: '0' },
    },
  ]
  await shellFixture(page, { constructions })
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let reject = true
  const sent: components['schemas']['CommandEnvelopeV3'][] = []
  await page.route('**/commands', async (route) => {
    const envelope = route.request().postDataJSON()
    sent.push(envelope)
    await gate
    if (!reject) constructions.length = 0
    await route.fulfill({
      json: {
        protocol: 3,
        binding,
        command_id: envelope.command_id,
        admitted_at: Date.now(),
        executed_at: Date.now(),
        ...(reject
          ? { status: 'Rejected', code: 'OperationNotActive' }
          : {
              status: 'Committed',
              result_ids: [],
              minimum_viewer_revision: '1',
            }),
      },
    })
  })
  await page.getByRole('link', { name: 'Build', exact: true }).click()
  const notice = page.getByRole('region', { name: 'Construction status' })
  await notice.scrollIntoViewIfNeeded()
  await expect(notice).toBeInViewport()
  const cancel = notice.getByRole('button', {
    name: 'Cancel construction',
    exact: true,
  })
  await cancel.click()
  await expect(cancel).toBeDisabled()
  await expect(notice).toContainText('Cancelling')
  release()
  await expect(page.getByLabel('Action needs attention')).toContainText(
    'Action rejected',
  )
  await expect(cancel).toBeEnabled()
  await page.getByRole('button', { name: 'Dismiss notice' }).click()
  reject = false
  await cancel.click()
  await expect(notice).toHaveCount(0)
  expect(sent).toHaveLength(2)
  expect(sent[0].command).toEqual({
    type: 'CancelConstruction',
    operation: '00000000-0000-4000-8000-000000000010',
  })
})

test('resource accrual enables an open quote even while the next server snapshot is delayed', async ({
  page,
}) => {
  await page.clock.install()
  await setup(page, true)
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/overview', async (route) => {
    await gate
    await route.fulfill({ status: 503, json: { code: 'Unavailable' } })
  })
  await page
    .getByRole('button', { name: 'Upgrade Metal Mine', exact: true })
    .click()
  const confirm = page.getByRole('button', { name: 'Confirm upgrade' })
  await expect(confirm).toBeDisabled()
  await page.clock.fastForward(3_600_000)
  await expect(confirm).toBeEnabled()
  await expect(
    page
      .getByLabel('Current resources')
      .getByRole('button', { name: 'Metal details' })
      .locator('strong'),
  ).toHaveText('63')
  release()
  await page.unrouteAll({ behavior: 'wait' })
})

test('active construction stays visible without covering current work at enlarged text sizes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 })
  await shellFixture(page, {
    constructions: [
      {
        id: '00000000-0000-4000-8000-000000000010',
        body: body.id,
        building: 'MetalMine',
        target_level: 2,
        due_at: Date.now() + 76000,
        paid: { metal: '60000000', crystal: '15000000', deuterium: '0' },
      },
    ],
  })
  await page.getByRole('link', { name: 'Build', exact: true }).click()
  await page.addStyleTag({
    content:
      'html { font-size: 200% !important } * { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; }',
  })
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page
    .getByRole('region', { name: 'Construction status' })
    .scrollIntoViewIfNeeded()
  await expect(
    page.getByRole('region', { name: 'Construction status' }),
  ).toBeInViewport()
  await expect(
    page.getByRole('complementary', { name: 'Activity' }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Navigation' })
    .getByRole('link', { name: 'Resources', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Upgrade Metal Mine', exact: true })
    .click()
  await expect(
    page
      .getByRole('region', { name: 'Progression quote' })
      .getByRole('button', { name: 'Cancel construction', exact: true }),
  ).toBeEnabled()
  const quote = page.getByRole('region', { name: 'Progression quote' })
  await expect(quote.getByText(/Full refund before completion:/)).toHaveCount(1)
  await expect(quote).not.toContainText('Full payment is refunded')
  await expect(quote).not.toContainText('A quote reserves nothing')
})

for (const dismissFirst of ['message', 'saved action'] as const) {
  test(`new local errors and older rejections stay visible and dismiss independently (${dismissFirst} first)`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await setup(page)
    await page.route('**/commands', async (route) => {
      const envelope = route.request().postDataJSON()
      await route.fulfill({
        json: {
          protocol: 3,
          binding,
          command_id: envelope.command_id,
          admitted_at: Date.now(),
          executed_at: Date.now(),
          status: 'Rejected',
          code: 'InsufficientResources',
        },
      })
    })
    await page
      .getByRole('button', { name: 'Upgrade Metal Mine', exact: true })
      .click()
    await page.getByRole('button', { name: 'Confirm upgrade' }).click()
    const saved = page.getByRole('group', { name: 'Saved action', exact: true })
    await expect(saved).toContainText('Action rejected')
    await page
      .getByRole('button', { name: 'Upgrade Crystal Mine', exact: true })
      .click()
    await expect(
      page.getByRole('button', { name: 'Confirm upgrade' }),
    ).toBeEnabled()
    await context.setOffline(true)
    await page.getByRole('button', { name: 'Confirm upgrade' }).click()
    const message = page.getByRole('group', { name: 'Current action error' })
    await expect(message).toContainText('Connect before confirming an action.')
    await expect(saved).toContainText('Action rejected')
    await page.screenshot({
      path: `test-results/action-notices-${dismissFirst.replaceAll(' ', '-')}.png`,
    })
    if (dismissFirst === 'message') {
      await message.getByRole('button', { name: 'Dismiss message' }).click()
      await expect(message).toHaveCount(0)
      await expect(saved).toBeVisible()
      await saved.getByRole('button', { name: 'Dismiss notice' }).click()
    } else {
      await saved.getByRole('button', { name: 'Dismiss notice' }).click()
      await expect(saved).toHaveCount(0)
      await expect(message).toBeVisible()
      await message.getByRole('button', { name: 'Dismiss message' }).click()
    }
    await expect(page.getByLabel('Action needs attention')).toHaveCount(0)
    await context.setOffline(false)
  })
}

test('an accepted construction can be cancelled before its engine outcome arrives', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setup(page, false, true)
  const sent: components['schemas']['CommandEnvelopeV3'][] = []
  const receipts = new Map<string, components['schemas']['BoundReceipt3']>()
  await page.route('**/commands', async (route) => {
    const envelope = route.request().postDataJSON()
    sent.push(envelope)
    const receipt: components['schemas']['BoundReceipt3'] = {
      protocol: 3,
      binding,
      command_id: envelope.command_id,
      admitted_at: Date.now(),
      executed_at: null,
      status: 'Pending',
    }
    receipts.set(envelope.command_id, receipt)
    await route.fulfill({ json: receipt })
  })
  await page.route('**/commands/*', async (route) => {
    const id = new URL(route.request().url()).pathname.split('/').pop()!
    await route.fulfill({ json: receipts.get(id) })
  })
  await page.goto(`/u/andromeda/b/${body.id}/resources`)
  await page
    .getByRole('button', { name: 'Upgrade Metal Mine', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Confirm upgrade', exact: true })
    .click()
  const notice = page.getByRole('region', { name: 'Construction status' })
  await expect(notice).toContainText('order accepted')
  const cancel = notice.getByRole('button', { name: 'Cancel construction' })
  await expect(cancel).toBeEnabled()
  await cancel.click()
  await expect.poll(() => sent.length).toBe(2)
  expect(sent[1].command).toEqual({
    type: 'CancelConstruction',
    operation: sent[0].command_id,
  })
  expect(
    [...receipts.values()].every((receipt) => receipt.status === 'Pending'),
  ).toBe(true)
  await expect(notice).toContainText('Cancelling')
})

test('resource orbit and exact decision ledger fit desktop and narrow phones', async ({
  page,
}) => {
  const { economy, planet } = await setup(page, true)
  planet.coordinates.position = 4
  economy.gross_per_hour.metal = '0'
  await refreshGame(page)
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto(`/u/andromeda/b/${body.id}/resources`)
    await expect(page.getByLabel('Planet energy')).toContainText('Supply')
    await page.getByLabel('Planet energy').locator('..').locator('img').evaluate(image => (image as HTMLImageElement).decode())
    await expect(page.getByLabel('Resource economy')).toContainText('Capacity')
    await captureCatalog(page, `test-results/progression-resources-${width}.png`)
    await page.getByRole('button', { name: 'Upgrade Metal Mine', exact: true }).click()
    const pane = page.getByRole('region', { name: 'Progression quote' })
    await expect(pane.getByRole('table')).toContainText('Need 60 more')
    await expect(pane.getByRole('button', { name: 'Confirm upgrade', exact: true })).toBeDisabled()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await captureCatalog(page, `test-results/progression-resources-blocked-${width}.png`)
  }
})

test('fractional balances stay whole in the ledger and tooltip without enabling an unaffordable upgrade', async ({ page }) => {
  const { planet, economy, sent } = await setup(page, true)
  planet.amounts.metal = '59999999'
  planet.amounts.crystal = '864661927'
  economy.gross_per_hour.metal = '0'
  economy.gross_per_hour.crystal = '0'
  await refreshGame(page)
  await page.goto(`/u/andromeda/b/${body.id}/resources`)
  await page.getByRole('button', { name: 'Upgrade Metal Mine', exact: true }).click()
  const pane = page.getByRole('region', { name: 'Progression quote' })
  const metal = pane.getByRole('row').filter({ has: page.getByRole('button', { name: 'Metal details' }) })
  const crystal = pane.getByRole('row').filter({ has: page.getByRole('button', { name: 'Crystal details' }) })
  await expect(metal.locator('td').nth(0)).toHaveText('Available59')
  await expect(metal.locator('td').nth(1)).toHaveText('After spendingNeed 1 more')
  await expect(crystal.locator('td').nth(0)).toHaveText('Available864')
  await expect(crystal.locator('td').nth(1)).toHaveText('After spending849')
  await expect(pane.getByRole('button', { name: 'Confirm upgrade', exact: true })).toBeDisabled()
  await metal.getByRole('button', { name: 'Metal details' }).click()
  const tooltip = page.getByRole('dialog', { name: 'Metal', exact: true })
  await expect(tooltip).toContainText('Available 59')
  await expect(tooltip).toContainText('Shortfall 1')
  expect(sent).toHaveLength(0)
})
