import { routeProgressionOptions } from './fixtures/progression-options'
import { navigate, menuDestination } from './fixtures/navigation'
import { selectBody } from './fixtures/body-selector'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { confirmCancellation } from './fixtures/confirmation'
import {
  moveProductionSlider,
  openProductionSettings,
} from './fixtures/production-settings'
import { test, expect, type Page } from './fixtures/test'
import {
  refuseFixtureReads,
  installGameFixture,
  shellFixture,
  body,
  binding,
  refreshGame,
} from './fixtures/game'
import type { components } from '../src/contracts'
import { withBootstrapResponse } from './fixtures/responses'

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
async function setup(
  page: Page,
  blocked = false,
  commandReferences = false,
  planet = structuredClone(body),
  viewerRevision?: () => string,
) {
  const economy = { ...production(), body: planet.id }
  if (blocked) planet.amounts.metal = '0'
  const sent: components['schemas']['CommandEnvelopeV3'][] = []
  await installGameFixture(page, {
    production: [economy],
    bodies: planet.id === body.id ? [planet] : [structuredClone(body), planet],
    commandReferences,
    viewerRevision,
  })
  await routeProgressionOptions(page, async (route) => {
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
  await withBootstrapResponse(page, () =>
    page.goto(`/u/andromeda/b/${body.id}/resources`),
  )
  await expect(page.locator('main h1')).toHaveText('Resources')
  return { economy, sent, planet }
}

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
  await openProductionSettings(page)
  const panel = page.getByRole('region', { name: 'Production controls' })
  await expect(page.getByLabel('fusion reactor production')).toHaveCount(0)
  await expect(page.getByLabel('solar satellite production')).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Save production', exact: true }),
  ).toHaveCount(0)
  const totals = panel
    .locator('div')
    .filter({ has: page.getByText('Energy balance', { exact: true }) })
    .first()
  const confirmedTotals = await totals.innerText()
  try {
    await moveProductionSlider(page, 'metal mine production', '50')
    await expect.poll(() => sent.length).toBe(1)
    await moveProductionSlider(page, 'metal mine production', '100')
    await moveProductionSlider(page, 'solar plant production', '60')
    await expect(panel.getByRole('status')).toContainText(
      'Saving production changes',
    )
    expect(await totals.innerText()).toBe(confirmedTotals)
    expect(sent).toHaveLength(1)
    await panel.getByRole('status').scrollIntoViewIfNeeded()
    await diagnosticScreenshot(page, {
      path: 'test-results/production-autosave-pending-390.png',
    })
    await page.getByRole('link', { name: 'Develop', exact: true }).click()
    // A route change unmounts the controls while the user edits remain queued.
    await page.getByRole('link', { name: 'Facilities', exact: true }).click()
    await page.getByRole('link', { name: 'Resources', exact: true }).click()
    await openProductionSettings(page)
    await expect(page.getByLabel('metal mine production')).toHaveValue('100')
    await expect(page.getByLabel('solar plant production')).toHaveValue('60')
  } finally {
    release()
  }
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
  await diagnosticScreenshot(page, {
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
  await openProductionSettings(page)
  const settings = page.getByRole('region', { name: 'Production controls' })
  await expect(settings).toBeVisible()
  await expect(page.getByLabel('fusion reactor production')).toHaveCount(0)
  await moveProductionSlider(page, 'metal mine production', '50')
  const panel = page.getByRole('region', { name: 'Production controls' })
  await expect(
    page
      .getByTestId('game-error-banner')
      .getByRole('group', { name: 'Order status' }),
  ).toContainText('Settings Changed')
  await expect(
    page
      .getByTestId('game-error-banner')
      .getByRole('group', { name: 'Production settings error' }),
  ).toContainText('Your production edits are retained')
  await expect(panel.getByRole('alert')).toHaveCount(0)
  await expect(page.getByLabel('metal mine production')).toHaveValue('50')
  expect(sent).toHaveLength(0)
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await page.evaluate(() => window.scrollTo(0, 0))
    await diagnosticScreenshot(page, {
      path: `test-results/unified-production-error-${width}x900.png`,
      fullPage: true,
    })
  }
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
  await page
    .getByTestId('game-error-banner')
    .getByRole('button', { name: 'Retry production changes' })
    .click()
  await expect.poll(() => sent.length).toBe(1)
  expect(sent[0].command).toMatchObject({
    expected_settings_revision: '2',
    settings: { metal_mine: 50, crystal_mine: 80 },
  })
  await expect(panel.getByRole('status')).toHaveText(
    'All changes saved automatically.',
  )
})

test('production edits wait for an in-memory production command', async ({
  page,
}) => {
  let viewerRevision = '1'
  const { economy } = await setup(
    page,
    false,
    false,
    structuredClone(body),
    () => viewerRevision,
  )
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
      viewerRevision = '3'
      await route.fulfill({
        json: {
          ...pending,
          status: 'Committed',
          executed_at: Date.now(),
          minimum_viewer_revision: viewerRevision,
          result_ids: [],
        },
      })
    }
  })
  await page.route('**/commands/*', (route) => {
    const id = new URL(route.request().url()).pathname.split('/').pop()!
    return route.fulfill({ json: receipts.get(id) })
  })
  await openProductionSettings(page)
  await moveProductionSlider(page, 'metal mine production', '50')
  await expect.poll(() => sent.length).toBe(1)
  await openProductionSettings(page)
  const panel = page.getByRole('region', { name: 'Production controls' })
  const metal = page.getByLabel('metal mine production')
  await expect(metal).toHaveValue('50')
  const totals = panel
    .locator('div')
    .filter({ has: page.getByText('Energy balance', { exact: true }) })
    .first()
  const confirmedTotals = await totals.innerText()
  const desired = '100'
  await moveProductionSlider(page, 'metal mine production', desired)
  await expect(metal).toHaveValue(desired)
  await expect(panel.getByRole('status')).toContainText(
    'Saving production changes',
  )
  expect(sent).toHaveLength(1)
  expect(await totals.innerText()).toBe(confirmedTotals)
  economy.settings = {
    ...economy.settings,
    metal_mine: 50,
    crystal_mine: 80,
  }
  economy.settings_revision = '2'
  viewerRevision = '2'
  // The committed production receipt releases the queued edit after refresh.
  const original = receipts.get(sent[0].command_id)!
  receipts.set(sent[0].command_id, {
    ...original,
    status: 'Committed',
    executed_at: Date.now(),
    minimum_viewer_revision: viewerRevision,
    result_ids: [],
  })
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

test('legacy resource catalogs retain cancellation and refresh the open upgrade after completion', async ({
  page,
}) => {
  const activate = async (control: ReturnType<Page['getByRole']>) => {
    // Layout changes can put a resource trigger under the previous click,
    // opening a hover popover over the next action on slower renderers.
    await page.mouse.move(0, 0)
    await expect(
      page.getByRole('dialog', { name: /^(Metal|Crystal|Deuterium)$/ }),
    ).toHaveCount(0)
    await expect(control).toBeVisible()
    await expect(control).toBeEnabled()
    await control.click()
    await page.mouse.move(0, 0)
  }
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
  await withBootstrapResponse(page, () =>
    page.goto(`/u/andromeda/b/${body.id}/resources`),
  )
  await expect(
    page.getByRole('button', { name: 'Resource settings', exact: true }),
  ).toHaveCount(0)
  await activate(
    page.getByRole('link', { name: 'Upgrade Metal Mine', exact: true }),
  )
  await expect(
    page.getByRole('region', { name: 'Upgrade quote' }),
  ).toBeVisible()
  await activate(page.getByRole('button', { name: 'Retry', exact: true }))
  await expect(
    page.getByRole('button', { name: 'Confirm upgrade', exact: true }),
  ).toBeVisible()
  await activate(
    page.getByRole('link', { name: 'Back to Resources', exact: true }),
  )
  await expect(
    page.getByRole('link', { name: 'Upgrade Metal Mine', exact: true }),
  ).toBeFocused()
  await activate(
    page.getByRole('link', { name: 'Upgrade Metal Mine', exact: true }),
  )
  await activate(
    page.getByRole('button', { name: 'Confirm upgrade', exact: true }),
  )
  await expect(page.locator('[data-catalog-item]')).toHaveCount(0)
  await activate(
    page.getByRole('link', { name: 'Back to Resources', exact: true }),
  )
  await expect(
    page.getByRole('link', { name: 'Upgrade Metal Mine', exact: true }),
  ).toBeEnabled()
  await activate(
    page.getByRole('link', { name: 'Upgrade Metal Mine', exact: true }),
  )
  releaseUpgrade()
  await expect(
    page.getByRole('region', { name: 'Active construction' }),
  ).toBeVisible()
  await activate(
    page.getByRole('link', { name: 'Back to Resources', exact: true }),
  )
  await expect(
    page.getByRole('link', { name: 'Upgrade Metal Mine', exact: true }),
  ).toBeEnabled()
  await expect(
    page.getByRole('link', { name: 'Upgrade Fusion Reactor', exact: true }),
  ).toHaveAttribute('title', 'Fusion Reactor · unavailable in this universe')
  await activate(
    page.getByRole('link', { name: 'Upgrade Metal Mine', exact: true }),
  )
  expect(sent[0].command).toMatchObject({
    type: 'StartUpgrade',
    body: body.id,
    building: 'MetalMine',
    expected_terms_hash: 'b'.repeat(64),
  })
  await expect(
    page.getByRole('region', { name: 'Upgrade quote' }),
  ).toBeVisible()
  await activate(
    page
      .getByRole('region', { name: 'Upgrade quote' })
      .getByRole('button', { name: 'Cancel construction', exact: true }),
  )
  await confirmCancellation(page)
  await expect(
    page.getByRole('region', { name: 'Active construction' }),
  ).toHaveCount(0)
  expect(sent[1].command).toEqual({
    type: 'CancelConstruction',
    operation: '00000000-0000-4000-8000-000000000010',
  })
  const pane = page.getByRole('region', { name: 'Upgrade quote' })
  await activate(
    pane.getByRole('button', { name: 'Confirm upgrade', exact: true }),
  )
  await expect(
    pane.getByRole('region', { name: 'Active construction' }),
  ).toBeVisible()
  planet.levels.MetalMine = 2
  constructions.length = 0
  await refreshGame(page)
  await expect(
    pane.getByRole('heading', { name: 'Upgrade to level 3', exact: true }),
  ).toBeVisible()
  await activate(
    pane.getByRole('button', { name: 'Confirm upgrade', exact: true }),
  )
  await expect.poll(() => sent.length).toBe(4)
  expect(sent[3].command).toMatchObject({
    type: 'StartUpgrade',
    expected_terms_hash: 'c'.repeat(64),
  })
})

test('resource settings navigation preserves history and reload support at 390px', async ({
  page,
}) => {
  const width = 390
  await page.setViewportSize({ width, height: 900 })
  await setup(page)
  await page.getByRole('link', { name: 'Empire', exact: true }).click()
  // The Empire route moves focus on commit. Finish that transition before
  // focusing the persistent energy link and sending a real keyboard event.
  await expect(page.locator('main h1')).toHaveText('Empire — Planet [1:371:12]')
  await expect(page.locator('main h1')).toBeFocused()
  const menu = page.getByRole('navigation', { name: 'Menu destinations' })
  const settings = await menuDestination(page, 'Resource settings')
  await expect(settings).toHaveAttribute(
    'href',
    `/u/andromeda/b/${body.id}/resource-settings`,
  )
  await settings.focus()
  await expect(settings).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(menu).not.toBeVisible()
  await expect(page.locator('main h1')).toHaveText('Resource settings')
  await expect(page.locator('main h1')).toBeFocused()
  await expect(
    page.getByRole('link', { name: 'Develop', exact: true }),
  ).toHaveAttribute('aria-current', 'page')
  await expect(
    page.getByRole('link', { name: 'Menu', exact: true }),
  ).not.toHaveAttribute('aria-current')
  await expect(
    page.getByRole('navigation', { name: 'Develop navigation', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'Production controls' }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Upgrade Metal Mine', exact: true }),
  ).toHaveCount(0)
  await withBootstrapResponse(page, () => page.reload())
  await expect(page.getByLabel('metal mine production')).toHaveValue('100')
  await page.goBack()
  await expect(page).toHaveURL(new RegExp(`/b/${body.id}/overview$`))
  await page.goForward()
  await expect(
    page.getByRole('region', { name: 'Production controls' }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Develop', exact: true }),
  ).toHaveAttribute('aria-current', 'page')
  await diagnosticScreenshot(page, {
    path: `test-results/resource-settings-develop-${width}x900.png`,
    fullPage: true,
  })
})

test("full-storage warnings open the selected planet's matching storage at 390px", async ({
  browser,
}) => {
  const width = 390
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width, height: 900 },
  })
  const page = await context.newPage()
  try {
    const colony = {
      ...structuredClone(body),
      id: '00000000-0000-4000-8000-000000000006',
    }
    colony.amounts = { ...colony.capacity, crystal: '11000000000' }
    const { sent } = await setup(page, false, false, colony)
    await selectBody(page, colony.id)
    await expect(page).toHaveURL(new RegExp(`/b/${colony.id}/resources$`))
    await expect(page.locator('main h1')).toBeFocused()
    const trigger = page
      .getByRole('group', { name: 'Planet and resources', exact: true })
      .getByRole('button', { name: 'Deuterium details', exact: true })
    await trigger.tap()
    const dialog = page.getByRole('dialog', { name: 'Deuterium', exact: true })
    const link = dialog.getByRole('link', { name: 'Storage full', exact: true })
    const destination = `/u/andromeda/b/${colony.id}/resources/deuterium-tank`
    await expect(link).toHaveAttribute('href', destination)
    await link.tap()
    await expect(page).toHaveURL(destination)
    const panel = page.getByRole('region', { name: 'Progression quote' })
    await expect(
      panel.getByRole('heading', { name: 'Deuterium Tank', exact: true }),
    ).toBeVisible()
    await expect(
      panel.getByRole('button', { name: 'Confirm upgrade', exact: true }),
    ).toBeEnabled()
    await expect(dialog).toHaveCount(0)
    // A second tap on the already selected destination still closes the popover.
    await trigger.tap()
    await expect(dialog).toBeVisible()
    await link.tap()
    await expect(dialog).toHaveCount(0)
    await selectBody(page, body.id)
    await expect(page).toHaveURL(
      new RegExp(`/b/${body.id}/resources/deuterium-tank$`),
    )
    await page
      .getByRole('group', { name: 'Planet and resources', exact: true })
      .getByRole('button', { name: 'Metal details', exact: true })
      .click()
    await expect(
      page.getByRole('dialog', { name: 'Metal', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Storage full', exact: true }),
    ).toHaveCount(0)
    expect(sent).toHaveLength(0)
  } finally {
    await context.close()
  }
})
