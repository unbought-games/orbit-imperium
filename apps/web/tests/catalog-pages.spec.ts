import { withBootstrapResponse, withFixtureResponse } from './fixtures/responses'
import { routeProgressionOptions } from './fixtures/progression-options'
import { productionFixture } from '../src/test-support/production'
import { navigate } from './fixtures/navigation'
import { selectBody } from './fixtures/body-selector'
import { attachFailureScreenshots, diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { confirmCancellation } from './fixtures/confirmation'
import { readFileSync } from 'node:fs'
import { test, expect, type Page } from './fixtures/test'
import { installGameFixture, shellFixture, body, binding, refreshGame, id } from './fixtures/game'
import { universeSlug } from '../src/client-model/universe-name'
import type { components } from '../src/contracts'
type S = components['schemas']

test('active research remains cancellable from its details after removing Current work', async ({
  page,
}) => {
  const operation: S['ResearchOperationDto'] = {
    id: '00000000-0000-4000-8000-000000000010',
    host: body.id,
    research: 'EnergyTechnology',
    source_level: 1,
    target_level: 2,
    paid: { metal: '60000000', crystal: '15000000', deuterium: '0' },
    started_at: Date.now(),
    due_at: Date.now() + 76000,
    labs: [],
    effective_lab: '1',
    can_cancel: true,
  }
  const options = {
    catalog,
    researchOperation: operation as S['ResearchOperationDto'] | null,
  }
  await shellFixture(page, options)
  await routeProgressionOptions(page, (route) => route.abort())
  let sent: unknown
  await page.route('**/commands', async (route) => {
    const envelope = route.request().postDataJSON()
    sent = envelope.command
    options.researchOperation = null
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
  await withBootstrapResponse(page, () => page.goto(`/u/andromeda/b/${body.id}/research`))
  const progress = page
    .getByRole('link', { name: 'Research Energy Technology', exact: true })
    .getByRole('group', { name: 'Research progress' })
  await expect(progress).toContainText(/1m \d+s/)
  await expect(progress.getByLabel('Target level 2')).toBeVisible()
  await expect(
    page.getByRole('group', { name: 'Research progress' }),
  ).toHaveCount(1)
  await page
    .getByRole('link', { name: 'Research Energy Technology', exact: true })
    .click()
  const pane = page.getByRole('region', { name: 'Progression quote' })
  await expect(pane.getByRole('group', { name: 'Cancellation refund', exact: true })).toContainText('60')
  await expect(pane.getByText('Refund on cancel', { exact: true })).toHaveCount(1)
  await pane
    .getByRole('button', { name: 'Cancel research', exact: true })
    .click()
  await expect(page.getByRole('dialog', { name: 'Cancel research?', exact: true })).toHaveCount(0)
  await expect
    .poll(() => sent)
    .toEqual({ type: 'CancelResearch', operation: operation.id })
  await expect(
    pane.getByRole('button', { name: 'Cancel research', exact: true }),
  ).toHaveCount(0)
  await expect(progress).toHaveCount(0)
})
const catalog: S['CatalogEntry3'][] = [
  {
    key: { kind: 'Building', id: 'RoboticsFactory' },
    requirements: [],
    enabled: true,
    mobile: false,
    body_kinds: ['Planet'],
  },
  {
    key: { kind: 'Building', id: 'ResearchLab' },
    requirements: [],
    enabled: true,
    mobile: false,
    body_kinds: ['Planet'],
  },
  {
    key: { kind: 'Research', id: 'EnergyTechnology' },
    requirements: [{ type: 'BodyBuilding', building: 'ResearchLab', level: 1 }],
    enabled: true,
    mobile: false,
    body_kinds: ['Planet'],
  },
  {
    key: { kind: 'Research', id: 'CombustionDrive' },
    requirements: [
      { type: 'PlayerResearch', research: 'EnergyTechnology', level: 1 },
    ],
    enabled: true,
    mobile: false,
    body_kinds: ['Planet'],
  },
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
  {
    key: { kind: 'Ship', id: 'Dreadnought' },
    requirements: [],
    enabled: false,
    mobile: true,
    body_kinds: ['Planet'],
  },
  {
    key: { kind: 'Defense', id: 'RocketLauncher' },
    requirements: [],
    enabled: true,
    mobile: false,
    body_kinds: ['Planet'],
  },
]
async function installCatalogFixture(page: Page, blocked = false, unitCost?: S['Resources'], options: Parameters<typeof shellFixture>[1] = {}) {
  const blockers = blocked
    ? [
        {
          code: 'NoFreeField',
          requirement: null,
          required: null,
          actual: null,
          resource: null,
          unit: null,
        },
      ]
    : []
  const sent: S['CommandEnvelopeV3'][] = []
  const inspections: S['QuoteRequest3'][] = []
  const planet = structuredClone(body)
  await installGameFixture(page, {
    bodies: [planet],
    // Isolate command affordability from passive income during exact-balance checks.
    production: (options.bodies ?? [planet]).map(planet => ({ ...productionFixture(planet), gross_per_hour: { metal: '0', crystal: '0', deuterium: '0' } })),
    catalog,
    research: [
      { research: 'EnergyTechnology', level: 1 },
      { research: 'CombustionDrive', level: 0 },
    ],
    ...options,
  })
  await routeProgressionOptions(page, async (route) => {
    const { context, request } = route.request().postDataJSON()
    inspections.push(request)
    const paid = unitCost ?? { metal: '60000000', crystal: '15000000', deuterium: '0' }
    const common = { profile_hash: 'a'.repeat(64), paid }
    const terms =
      request.type === 'Research'
        ? {
            ...common,
            type: 'Research',
            host: request.host,
            research: request.research,
            source_level: 0,
            target_level: 1,
            duration_ms: 60000,
            formula: 'ResearchClassic',
            labs: [],
            effective_lab: '1',
            required_energy: '0',
          }
        : request.type === 'Manufacture'
          ? {
              ...common,
              type: 'Manufacture',
              body: request.body,
              item: request.item,
              quantity: request.quantity,
              unit_cost: paid,
              paid: Object.fromEntries(
                Object.entries(paid).map(([key, value]) => [
                  key,
                  (BigInt(value) * BigInt(request.quantity)).toString(),
                ]),
              ),
              unit_duration_ms: 30000,
              formula: 'ManufactureClassic',
              facilities: [],
            }
          : {
              ...common,
              type: 'Building',
              body: request.body,
              building: request.building,
              action: request.type,
              source_level: 0,
              target_level: 1,
              duration_ms: 76000,
              formula: 'BuildingRedesign2011',
              facilities: [],
              required_energy: '0',
              reserve_fields: 1,
            }
    await route.fulfill({
      json: {
        protocol: 3,
        binding,
        request_id: context.request_id,
        viewer_revision: '1',
        sampled_at: Date.now(),
        as_of_ms: Date.now(),
        request,
        terms,
        terms_hash: 'b'.repeat(64),
        blockers,
        estimates: null,
      },
    })
  })
  await page.route('**/commands', async (route) => {
    const envelope = route.request().postDataJSON()
    sent.push(envelope)
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
  return { sent, planet, blockers, inspections }
}

async function setup(page: Page, blocked = false, unitCost?: S['Resources'], options: Parameters<typeof shellFixture>[1] = {}) {
  const fixture = await installCatalogFixture(page, blocked, unitCost, options)
  await withFixtureResponse(
    page,
    response => new URL(response.url()).pathname === '/api/v1/bootstrap',
    () => page.goto(`/u/${universeSlug(options.universeName ?? 'Andromeda')}/b/${body.id}/overview`),
  )
  await expect(page.locator('main h1')).toContainText('Empire —')
  return fixture
}

test('facility rows offer quick build while retaining detail-page confirmation', { tag: '@journey' }, async ({
  page,
}) => {
  const { sent, planet, blockers } = await setup(page, true)
  await navigate(page, 'Facilities')
  await page
    .getByRole('link', { name: 'Upgrade Robotics Factory', exact: true })
    .click()
  await expect(page.getByLabel('Action blockers')).toContainText(
    'No Free Field',
  )
  const quick = page.getByRole('button', {
    name: 'Build Robotics Factory level 1',
    exact: true,
  })
  await expect(quick).toHaveCount(0)
  await page.getByRole('link', { name: /^Back to / }).click()
  await expect(quick).toBeDisabled()
  blockers.length = 0
  planet.fields++
  await refreshGame(page)
  await expect(quick).toBeEnabled()
  await page.getByRole('link', { name: 'Upgrade Robotics Factory', exact: true }).click()
  expect(sent).toHaveLength(0)
  const confirm = page.getByRole('button', { name: 'Confirm upgrade', exact: true })
  await expect(confirm).toBeEnabled()
  await confirm.focus()
  await page.keyboard.press('Enter')
  await expect.poll(() => sent.length).toBe(1)
  expect(sent[0].command).toEqual({
    type: 'StartUpgrade',
    body: body.id,
    building: 'RoboticsFactory',
    expected_terms_hash: 'b'.repeat(64),
  })
  await expect(
    page.getByRole('region', { name: 'Progression quote' }),
  ).toBeVisible()
})

for (const [pageName, tile, action, region] of [
  [
    'Facilities',
    'Upgrade Robotics Factory',
    'Confirm upgrade',
    'Active construction',
  ],
  [
    'Research',
    'Research Combustion Drive',
    'Confirm research',
    'Active research',
  ],
]) {
  test(`${pageName} details remain open with optimistic work and recover after rejection`, async ({
    page,
  }) => {
    await setup(page)
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const writes = new Set<string>()
    await page.route('**/commands', async (route) => {
      const envelope = route.request().postDataJSON()
      writes.add(envelope.command_id)
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
    await navigate(page, pageName)
    await page.getByRole('link', { name: tile, exact: true }).click()
    const pane = page.getByRole('region', { name: 'Progression quote' })
    await pane.getByRole('button', { name: action, exact: true }).click()
    await expect(pane).toBeVisible()
    const work = pane.getByRole('region', { name: region, exact: true })
    await expect(work).toContainText('Confirming')
    await expect(work.getByRole('button', { name: /^Cancel (construction|research)$/ })).toBeDisabled()
    await expect(work.getByRole('heading')).toBeFocused()
    const progress = page
      .getByRole('link', { name: tile, exact: true })
      .getByRole('group', {
        name:
          pageName === 'Research'
            ? 'Research progress'
            : 'Construction progress',
      })
    await expect(page.locator('[data-catalog-item]')).toHaveCount(0)
    await pane.getByRole('link', { name: /^Back to / }).click()
    await expect(progress).toContainText('Confirming')
    await page.getByRole('link', { name: tile, exact: true }).click()
    expect(writes.size).toBe(1)
    release()
    await expect(work).toHaveCount(0)
    await expect(progress).toHaveCount(0)
    await expect(pane).toBeVisible()
    await expect(
      pane.getByRole('button', { name: action, exact: true }),
    ).toBeEnabled()
    await pane.getByRole('link', { name: /^Back to / }).click()
    await expect(pane).toBeHidden()
    await expect(progress).toHaveCount(0)
  })
}

test('facility tiles mark insufficient resources while remaining inspectable', async ({
  page,
}) => {
  const { planet } = await setup(page)
  planet.amounts.metal = '0'
  await refreshGame(page)
  await navigate(page, 'Facilities')
  const tile = page.getByRole('link', {
    name: 'Upgrade Robotics Factory',
    exact: true,
  })
  await expect(tile).toHaveAttribute('title', /Not enough resources/)
  await expect(tile).toBeEnabled()
  await tile.click()
  await expect(page.getByLabel('Missing resources').getByRole('img', { name: 'metal', exact: true })).toBeVisible()
  planet.amounts.metal = '60000000'
  await refreshGame(page)
  await page.getByRole('link', { name: /^Back to / }).click()
  await expect(tile).not.toHaveAttribute('title', /Not enough resources/)
})


for (const width of [1440, 390, 320]) {
  test(`catalog tabs omit colony expanders and repeated titles at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await setup(page)
    for (const [tab, tile] of [
      ['Resources', 'Upgrade Metal Mine'],
      ['Facilities', 'Upgrade Robotics Factory'],
      ['Research', 'Research Combustion Drive'],
      ['Shipyard', 'Build Small Cargo'],
      ['Defense', 'Build Rocket Launcher'],
    ]) {
      await navigate(page, tab)
      const navigation = width >= 1024
        ? page.getByRole('complementary', { name: 'Game navigation' })
        : page.getByRole('navigation', { name: 'Develop navigation' })
      await expect(navigation.getByRole('link', { name: tab, exact: true })).toHaveAttribute('aria-current', 'page')
      await expect(page.locator('main h1')).toHaveText(tab)
      // Work summaries can have their own headings; the repeated page header is gone.
      await expect(page.locator('main > header').getByRole('heading', { name: tab, exact: true })).toHaveCount(0)
      await expect(page.locator('main details')).toHaveCount(['Shipyard', 'Defense'].includes(tab) ? 1 : 0)
      await expect(page.locator('main summary')).toHaveText(tab === 'Shipyard' ? ['Compare ships'] : tab === 'Defense' ? ['Compare defenses'] : [])
      if (tab === 'Resources') {
        await expect(page.getByText(/Production, storage and energy/)).toHaveCount(0)
        await expect(page.getByRole('button', { name: 'Resource settings', exact: true })).toHaveCount(0)
        await expect(page.getByRole('region', { name: 'Production controls' })).toBeHidden()
        await expect(page.getByRole('region', { name: 'Shipyard & defense', exact: true })).toHaveCount(0)
        await expect(page.getByRole('region', { name: 'Buildings', exact: true })).toBeVisible()
      }
      await expect(page.getByRole('link', { name: tile, exact: true })).toBeVisible()
      const queueName = ['Resources', 'Facilities'].includes(tab)
        ? 'Buildings'
        : tab === 'Research' ? 'Research' : 'Shipyard & defense'
      const queueBounds = (await page.getByRole('region', { name: queueName, exact: true }).boundingBox())!
      const catalog = page.getByRole('region').filter({ has: page.getByRole('link', { name: /^(Upgrade|Research|Build) / }) }).first()
      const catalogHeading = (await catalog.getByRole('heading', { level: 2 }).boundingBox())!
      const catalogGap = catalogHeading.y - (queueBounds.y + queueBounds.height)
      expect(catalogGap).toBeGreaterThanOrEqual(0)
      expect(catalogGap).toBeLessThanOrEqual(20)
      if (['Research', 'Shipyard', 'Defense'].includes(tab)) {
        await expect(page.getByText(/Universe-wide research · host and funding body/)).toHaveCount(0)
        await expect(page.getByText('Research applies to all your planets.', { exact: true })).toHaveCount(0)
        await expect(page.locator('main').getByText(/^Planet \[.*\]$/)).toHaveCount(0)
        const queue = page.getByRole('region', { name: tab === 'Research' ? 'Research' : 'Shipyard & defense', exact: true })
        await expect(queue).toBeVisible()
        // Every catalog starts with work; ship comparison follows the ship tiles.
        const queueBounds = (await queue.boundingBox())!
        const navigation = width >= 1024
          ? page.getByRole('group', { name: 'Planet and resources' })
          : page.getByRole('navigation', { name: 'Develop navigation' })
        const tabs = (await navigation.boundingBox())!
        expect(queueBounds.y - (tabs.y + tabs.height)).toBeGreaterThanOrEqual(0)
        expect(queueBounds.y - (tabs.y + tabs.height)).toBeLessThanOrEqual(20)
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
    await diagnosticScreenshot(page, { path: `test-results/catalog-without-scene-${width}.png` })
  })
}

test('facilities and research share detail pages and technology prerequisites', async ({
  page,
}) => {
  const { sent } = await setup(page)
  await navigate(page, 'Facilities')
  await page
    .getByRole('link', { name: 'Upgrade Robotics Factory', exact: true })
    .click()
  const details = page.getByRole('region', { name: 'Progression quote' })
  await expect(details).toContainText('1m 16s')
  await expect(
    page.getByRole('button', { name: 'Demolish Robotics Factory' }),
  ).toHaveCount(0)
  await page
    .getByRole('button', { name: 'Confirm upgrade', exact: true })
    .click()
  await expect.poll(() => sent.length).toBe(1)
  expect(sent[0].command.type).toBe('StartUpgrade')
  await navigate(page, 'Research')
  const tile = page.getByRole('link', {
    name: 'Research Combustion Drive',
    exact: true,
  })
  await tile.click()
  await expect(details).toContainText('Effective laboratory level')
  await page
    .getByRole('button', { name: 'Technology tree', exact: true })
    .click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Energy Technology')
  await expect(dialog).toContainText('Research Lab')
  await dialog.getByRole('tab', { name: 'Techtree', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(
    dialog.getByRole('tab', { name: 'Applications', exact: true }),
  ).toBeFocused()
  await expect(
    dialog.getByRole('tab', { name: 'Applications', exact: true }),
  ).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('End')
  await expect(
    dialog.getByRole('tab', { name: 'Techinfo', exact: true }),
  ).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(details).toBeVisible()
  await page
    .getByRole('button', { name: 'Confirm research', exact: true })
    .click()
  await expect.poll(() => sent.length).toBe(2)
  expect(sent[1].command).toMatchObject({
    type: 'StartResearch',
    research: 'CombustionDrive',
    host: body.id,
    expected_terms_hash: 'b'.repeat(64),
  })
  await expect(details).toBeVisible()
  await details.getByRole('link', { name: /^Back to / }).click()
  await expect(tile).toBeFocused()
})

test('manufacturing updates totals locally and Build validates without dismissing ships or defenses', { tag: '@journey' }, async ({
  page,
}) => {
  const { sent, inspections } = await setup(page)
  await navigate(page, 'Shipyard')
  await expect(
    page.getByRole('link', { name: 'Build Dreadnought', exact: true }),
  ).toHaveAttribute('title', 'Dreadnought · unavailable in this universe')
  await page
    .getByRole('link', { name: 'Build Small Cargo', exact: true })
    .click()
  const pane = page.getByRole('region', { name: 'Progression quote' })
  await expect(pane).toContainText('1 × Small Cargo')
  const initialInspections = inspections.length
  await page.getByLabel('Shipyard quantity').fill('3')
  await expect(
    page.getByRole('button', { name: 'Build', exact: true }),
  ).toBeEnabled()

  await expect(
    page.getByRole('region', { name: 'Progression quote' }),
  ).toContainText('3 × Small Cargo')
  await expect(
    pane.getByRole('button', { name: 'Metal details' }),
  ).toContainText('180')
  expect(inspections.length).toBe(initialInspections)
  expect(sent).toHaveLength(0)
  await page.getByRole('button', { name: 'Build', exact: true }).click()
  await expect.poll(() => sent.length).toBe(1)
  expect(sent[0].command).toMatchObject({
    type: 'StartManufacture',
    quantity: '3',
    item: { kind: 'Ship', id: 'SmallCargo' },
  })
  expect(inspections.at(-1)).toMatchObject({
    type: 'Manufacture',
    quantity: '3',
  })
  await expect(pane).toBeVisible()
  await navigate(page, 'Defense')
  await page
    .getByRole('link', { name: 'Build Rocket Launcher', exact: true })
    .click()
  await page.getByLabel('Defenses quantity').fill('0')

  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(pane).not.toContainText('Enter a quantity to see the total cost.')
  await expect(
    page.getByRole('button', { name: 'Build', exact: true }),
  ).toBeDisabled()
  await page.getByLabel('Defenses quantity').fill('2')

  await page.getByRole('button', { name: 'Build', exact: true }).click()
  await expect.poll(() => sent.length).toBe(2)
  expect(sent[1].command).toMatchObject({
    type: 'StartManufacture',
    quantity: '2',
    item: { kind: 'Defense', id: 'RocketLauncher' },
  })
  await expect(pane).toBeVisible()
})

for (const width of [390, 1440]) {
  for (const [destination, tile] of width === 390
    ? [['Shipyard', 'Build Small Cargo']]
    : [['Defense', 'Build Rocket Launcher']]) {
    test(`${destination} keeps the item route while submitting and exposes the order on the catalog at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      await setup(page)
      await navigate(page, destination)
      await page.getByRole('link', { name: tile, exact: true }).click()
      let release!: () => void
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      await page.route('**/commands', async (route) => {
        await gate
        await route.fallback()
      })
      const build = page.getByRole('button', { name: 'Build', exact: true })
      await build.click()
      await expect(build).toBeDisabled()
      const pane = page.getByRole('region', { name: 'Progression quote' })
      await expect(pane).toBeVisible()
      await expect(
        page.getByRole('list', { name: 'Manufacturing queue' }),
      ).toHaveCount(0)
      await pane.getByRole('link', { name: /^Back to / }).click()
      await expect(
        page.getByRole('list', { name: 'Manufacturing queue' }),
      ).toContainText('Confirming')
      const summary = page.getByRole('region', {
        name: 'Shipyard & defense',
        exact: true,
      })
      await expect(
        summary
          .locator('dt')
          .filter({ hasText: /^Until complete$/ })
          .locator('..'),
      ).toContainText('Pending')
      await expect(summary.locator('dt')).toHaveText([
        'Starts in',
        'Until complete',
      ])
      await expect(summary.getByRole('progressbar')).toHaveCount(0)
      await diagnosticScreenshot(summary, {
        path: `test-results/queue-${destination.toLowerCase()}-pending-${width}x900.png`,
      })
      await page.getByRole('link', { name: tile, exact: true }).click()
      release()
      await expect(build).toBeEnabled()
      await expect(pane).toBeVisible()
    })
  }
}

test('catalogs fit narrow screens and enlarged text without losing controls', async ({
  page,
}) => {
  await installCatalogFixture(page)
  // Keep each route mounted while exercising every viewport. Rebooting the
  // fixture application for each size adds no responsive-layout coverage.
  for (const [path, tile] of [
    ['facilities', 'Upgrade Robotics Factory'],
    ['research', 'Research Energy Technology'],
    ['shipyard', 'Build Light Fighter'],
    ['defense', 'Build Rocket Launcher'],
  ]) {
    await withBootstrapResponse(page, () => page.goto(
      path === 'research'
        ? `/u/andromeda/b/${body.id}/research`
        : `/u/andromeda/b/${body.id}/${path}`,
    ))
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await page.getByRole('link', { name: tile, exact: true }).click()
      const panel = page.getByRole('region', { name: 'Progression quote' })
      await expect(panel).toBeVisible()
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
      await page
        .getByRole('button', { name: 'Technology tree', exact: true })
        .click()
      await expect(page.getByRole('dialog')).toBeVisible()
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
      await page.keyboard.press('Escape')
      await expect(panel).toBeVisible()
      if (width !== 1440) {
        await panel.getByRole('link', { name: /^Back to / }).click()
        await expect(panel).toBeHidden()
      }
    }
    // Every category must remain usable at enlarged text, not just the last one.
    await page.setViewportSize({ width: 390, height: 844 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.evaluate(() => (document.documentElement.style.fontSize = '200%'))
    const panel = page.getByRole('region', { name: 'Progression quote' })
    await expect(panel).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByRole('button', { name: 'Technology tree', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.keyboard.press('Escape')
    await panel.getByRole('link', { name: /^Back to / }).click()
    await expect(page.getByRole('link', { name: tile, exact: true })).toBeFocused()
    await page.evaluate(() => document.documentElement.style.removeProperty('font-size'))
    await page.emulateMedia({ reducedMotion: 'no-preference' })
  }
})

for (const width of [1440, 390]) {
  test(`atlas artwork decodes and fits at ${width}px`, async ({ page }) => {
    const { artworkReviewFixture } = await import('./fixtures/artwork')
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
    await artworkReviewFixture(page)
    await page.goto('/__atlas-review')
    await expect(page.getByRole('img')).toHaveCount(18)
    await expect
      .poll(() =>
        page
          .getByRole('img')
          .evaluateAll((images) =>
            images.every(
              (image) =>
                image instanceof HTMLImageElement &&
                image.complete &&
                image.naturalWidth > 0,
            ),
          ),
      )
      .toBe(true)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width)
    const hero = page.getByRole('img', {
      name: 'Copper world · slot 4',
      exact: true,
    })
    if (width === 390)
      expect(
        await hero.evaluate((image) => (image as HTMLImageElement).currentSrc),
      ).toContain('/planet-04-640.webp')
    await diagnosticScreenshot(page, {
      path: `test-results/artwork-${width}.png`,
      fullPage: true,
    })
  })
}

const laserCatalog: S['CatalogEntry3'][] = JSON.parse(readFileSync('rules/mvp-v1-slice-8.json', 'utf8')).catalog

test('Light Laser shows completed inventory and builds a batch at its catalog cost', async ({ page }) => {
  const { sent, planet } = await setup(page, false, { metal: '1500000000', crystal: '500000000', deuterium: '0' }, {
    catalog: laserCatalog,
    research: [{ research: 'EnergyTechnology', level: 2 }, { research: 'LaserTechnology', level: 3 }],
  })
  planet.levels.Shipyard = 2
  planet.inventories.push({ item: { kind: 'Defense', id: 'LightLaser' }, count: '7' })
  await refreshGame(page)
  await navigate(page, 'Defense')
  const tile = page.getByRole('link', { name: 'Build Light Laser', exact: true })
  await expect(tile).toContainText('7')
  await tile.click()
  const pane = page.getByRole('region', { name: 'Progression quote' })
  await pane.getByRole('button', { name: 'Technology tree', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Shipyard')
  await expect(dialog).toContainText('Laser Technology')
  await expect(dialog).toContainText('3 / 3 · Met')
  await dialog.getByRole('button', { name: 'Close technology' }).click()
  await expect(pane.locator('img').first()).toBeVisible()
  await page.getByLabel('Defenses quantity').fill('3')
  await expect(pane).toContainText('3 × Light Laser')
  await expect(pane.getByRole('button', { name: 'Metal details' })).toContainText('4,500')
  await expect(pane.getByRole('button', { name: 'Crystal details' })).toContainText('1,500')
  await pane.getByRole('button', { name: 'Build', exact: true }).click()
  await expect.poll(() => sent.length).toBe(1)
  expect(sent[0].command).toMatchObject({ type: 'StartManufacture', body: body.id, item: { kind: 'Defense', id: 'LightLaser' }, quantity: '3' })
})

for (const [width, hasTouch] of [[390, true], [1440, true], [1440, false]] as const) {
  test.describe(`catalog focus at ${width}px (${hasTouch ? 'touch' : 'desktop'})`, () => {
    test.use({ viewport: { width, height: 844 }, hasTouch, isMobile: width === 390 })

    test('detail containers stay unoutlined while controls retain keyboard focus', async ({ page, browserName }) => {
      const outline = hasTouch || width < 768 ? 'none' : 'solid'
      await setup(page)
      await withBootstrapResponse(page, () => page.goto(`/u/andromeda/b/${body.id}/shipyard`))
      const tile = page.getByRole('link', { name: 'Build Small Cargo', exact: true })
      if (width === 390) await tile.tap()
      else await tile.click()
      const panel = page.getByRole('region', { name: 'Progression quote' })
      await expect(panel).toBeFocused()
      await expect(panel).toHaveCSS('outline-style', 'none')
      await withBootstrapResponse(page, () => page.reload())
      await expect(panel).toBeFocused()
      await expect(panel).toHaveCSS('outline-style', 'none')
      await diagnosticScreenshot(page, { path: `test-results/catalog-focus-reload-${width}-${hasTouch ? 'touch' : 'desktop'}.png` })

      const tree = panel.getByRole('button', { name: 'Technology tree', exact: true })
      if (width === 390) await tree.tap()
      else await tree.click()
      const close = page.getByRole('button', { name: 'Close technology' })
      if (width === 390) await close.tap()
      else await close.click()
      // WebKit leaves pointer-activated buttons unfocused, so the native dialog
      // returns to the panel. Keyboard activation below must return to the button.
      await expect(browserName === 'webkit' ? panel : tree).toBeFocused()
      await expect(panel).toHaveCSS('outline-style', 'none')

      const back = panel.getByRole('link', { name: 'Back to Shipyard', exact: true })
      await back.click()
      await expect(tile).toBeFocused()
      await page.keyboard.press('Enter')
      await expect(panel).toBeFocused()
      await expect(panel).toHaveCSS('outline-style', 'none')
      // macOS WebKit uses Option-Tab to include links and buttons in traversal.
      const tabKey = browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab'
      await page.keyboard.press(tabKey)
      await expect(back).toBeFocused()
      await expect(back).toHaveCSS('outline-style', outline)
      // Traverse real controls from the programmatic reading-order anchor.
      const quantity = panel.getByLabel('Shipyard quantity')
      let visitedQuantity = false
      for (let i = 0; i < 20 && !(await tree.evaluate(element => element === document.activeElement)); i++) {
        await page.keyboard.press(tabKey)
        if (await quantity.evaluate(element => element === document.activeElement)) {
          visitedQuantity = true
          await expect(quantity).toHaveCSS('outline-style', outline)
        }
      }
      expect(visitedQuantity).toBe(true)
      await expect(tree).toBeFocused()
      await expect(tree).toHaveCSS('outline-style', outline)
      await page.keyboard.press('Enter')
      await expect(page.getByRole('dialog', { name: 'Technology — Small Cargo', exact: true })).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(tree).toBeFocused()
      await expect(tree).toHaveCSS('outline-style', outline)
      await expect(panel).toHaveCSS('outline-style', 'none')
      await diagnosticScreenshot(page, { path: `test-results/catalog-focus-keyboard-${width}-${hasTouch ? 'touch' : 'desktop'}.png` })
    })
  })
}

for (const width of [390, 1440]) {
  test(`catalog deep links survive refresh and history without Escape dismissal at ${width}px`, { tag: (width === 390) ? '@journey' : [] }, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const { sent } = await setup(page)
    for (const [tab, path, item, title, linkName] of [
      ['Resources', 'resources', 'metal-mine', 'Metal Mine', 'Upgrade Metal Mine'],
      ['Facilities', 'facilities', 'robotics-factory', 'Robotics Factory', 'Upgrade Robotics Factory'],
      ['Research', 'research', 'combustion-drive', 'Combustion Drive', 'Research Combustion Drive'],
      ['Shipyard', 'shipyard', 'small-cargo', 'Small Cargo', 'Build Small Cargo'],
      ['Defense', 'defense', 'rocket-launcher', 'Rocket Launcher', 'Build Rocket Launcher'],
    ]) {
      const parent = `/u/andromeda/b/${body.id}/${path}`
      const detail = `${parent}/${item}`
      await navigate(page, tab)
      const tile = page.getByRole('link', { name: linkName, exact: true })
      await expect(tile).toHaveAttribute('href', detail)
      await tile.click()
      await expect(page).toHaveURL(detail)
      await expect(page.locator('[data-catalog-item]')).toHaveCount(0)
      await expect(page.getByRole('region', { name: /^(Buildings|Research|Shipyard & defense)$/ })).toHaveCount(0)
      const panel = page.getByRole('region', { name: 'Progression quote' })
      await expect(panel.getByRole('heading', { name: title, exact: true })).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page).toHaveURL(detail)
      await expect(panel).toBeVisible()
      await withBootstrapResponse(page, () => page.reload())
      await expect(panel).toBeVisible()
      await expect(panel).toBeFocused()
      await expect(panel).toHaveCSS('outline-style', 'none')
      await expect(page.locator('[data-catalog-item]')).toHaveCount(0)
      const back = panel.getByRole('link', { name: `Back to ${tab}`, exact: true })
      await expect(back).toHaveAttribute('href', parent)
      await back.click()
      await expect(page).toHaveURL(parent)
      await expect(tile).toBeFocused()
      await page.goBack()
      await expect(page).toHaveURL(detail)
      await expect(panel).toBeVisible()
      await page.goForward()
      await expect(page).toHaveURL(parent)
    }
    expect(sent).toEqual([])
  })
}

test('planet changes retain the item, reset edits, and link across prerequisites in the selected context', async ({ page }) => {
  const other = { ...structuredClone(body), id: id(6), coordinates: { galaxy: 1, system: 10, position: 4 } }
  const entries = catalog.map(entry => entry.key.id === 'SmallCargo' ? {
    ...entry, requirements: [
      { type: 'PlayerResearch' as const, research: 'CombustionDrive' as const, level: 1 },
      { type: 'BodyBuilding' as const, building: 'Shipyard' as const, level: 2 },
    ],
  } : entry)
  const { sent, inspections } = await setup(page, false, undefined, { bodies: [body, other], catalog: entries })
  await withBootstrapResponse(page, () => page.goto(`/u/andromeda/b/${body.id}/shipyard/small-cargo`))
  await page.getByLabel('Shipyard quantity').fill('7')
  await selectBody(page, other.id)
  await expect(page).toHaveURL(`/u/andromeda/b/${other.id}/shipyard/small-cargo`)
  await expect(page.getByLabel('Shipyard quantity')).toHaveValue('1')
  await expect.poll(() => inspections.some(r => r.type === 'Manufacture' && r.body === other.id)).toBe(true)
  await page.getByRole('button', { name: 'Technology tree', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Technology — Small Cargo' })
  const drive = dialog.getByRole('link', { name: 'Combustion Drive', exact: true })
  await expect(drive).toHaveAttribute('href', `/u/andromeda/b/${other.id}/research/combustion-drive`)
  await drive.click()
  await expect(page).toHaveURL(`/u/andromeda/b/${other.id}/research/combustion-drive`)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect.poll(() => inspections.some(r => r.type === 'Research' && r.host === other.id)).toBe(true)
  expect(sent).toEqual([])
  await page.getByRole('button', { name: 'Confirm research', exact: true }).click()
  await expect.poll(() => sent.length).toBe(1)
  expect(sent[0].command).toMatchObject({ type: 'StartResearch', research: 'CombustionDrive', host: other.id })
  await page.goBack()
  await expect(page).toHaveURL(`/u/andromeda/b/${other.id}/shipyard/small-cargo`)
  expect(sent).toHaveLength(1)
})

test('unknown catalog IDs and inaccessible planets fail closed while disabled items remain inspectable', async ({ page }) => {
  const { sent, inspections } = await setup(page)
  for (const path of [
    `/u/andromeda/b/${body.id}/resources/not-a-building`,
    `/u/andromeda/b/${body.id}/facilities/metal-mine`,
    `/u/andromeda/b/${id(99)}/research/combustion-drive`,
  ]) {
    await withBootstrapResponse(page, () => page.goto(path))
    await expect(page.getByRole('heading', { name: 'Destination unavailable' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Progression quote' })).toHaveCount(0)
    await expect(page).toHaveURL(path)
  }
  await withBootstrapResponse(page, () => page.goto(`/u/andromeda/b/${body.id}/shipyard/dreadnought`))
  const detail = page.getByRole('region', { name: 'Progression quote' })
  await expect(detail).toContainText('Unavailable in this universe.')
  await expect(detail.getByRole('button', { name: 'Build', exact: true })).toBeDisabled()
  expect(inspections.some(r => r.type === 'Manufacture' && r.item.id === 'Dreadnought')).toBe(false)
  expect(sent).toEqual([])
})

for (const catalogSource of ['published', 'moon-tagged'] as const) {
test(`Moon-only facilities from ${catalogSource} metadata are omitted on planets and inspectable on moons`, async ({ page }) => {
  const moon = { ...structuredClone(body), id: id(7), kind: 'Moon' as const }
  const published: S['CatalogEntry3'][] = JSON.parse(readFileSync('rules/mvp-v1-slice-9.json', 'utf8')).catalog
  const moonEntries = published.filter(entry => ['LunarBase', 'SensorPhalanx', 'JumpGate'].includes(entry.key.id)).map(entry =>
    catalogSource === 'moon-tagged' ? { ...entry, body_kinds: ['Moon'] as S['CatalogEntry3']['body_kinds'] } : entry,
  )
  expect(moonEntries).toHaveLength(3)
  const { sent } = await setup(page, false, undefined, { bodies: [body, moon], catalog: [...catalog, ...moonEntries] })
  await withBootstrapResponse(page, () => page.goto(`/u/andromeda/b/${body.id}/facilities`))
  for (const name of ['Lunar Base', 'Sensor Phalanx', 'Jump Gate'])
    await expect(page.getByRole('link', { name: `Upgrade ${name}`, exact: true })).toHaveCount(0)
  await selectBody(page, moon.id)
  for (const name of ['Lunar Base', 'Sensor Phalanx', 'Jump Gate'])
    await expect(page.getByRole('link', { name: `Upgrade ${name}`, exact: true })).toBeVisible()
  expect(sent).toEqual([])
})

}

test('catalog item links open natively in a new tab without changing the original selection', async ({ page, context }) => {
  const { sent } = await setup(page)
  await navigate(page, 'Resources')
  const parent = `/u/andromeda/b/${body.id}/resources`
  const detail = `${parent}/metal-mine`
  // Hold the popup at a static document until its isolated HTTP fixtures are attached.
  await context.route('**/u/**', route => route.fulfill({ contentType: 'text/html', body: '<html><body>Preparing fixture</body></html>' }))
  const opened = context.waitForEvent('page')
  await page.getByRole('link', { name: 'Upgrade Metal Mine', exact: true }).click({ button: 'middle' })
  const tab = await opened
  await expect(tab).toHaveURL(detail)
  await expect(page).toHaveURL(parent)
  await expect(page.getByRole('region', { name: 'Progression quote' })).toHaveCount(0)
  await context.unroute('**/u/**')
  const popupFixture = await setup(tab)
  await withBootstrapResponse(tab, () => tab.goto(detail))
  const panel = tab.getByRole('region', { name: 'Progression quote' })
  await expect(panel.getByRole('heading', { name: 'Metal Mine', exact: true })).toBeVisible()
  await expect(panel.getByRole('link', { name: 'Back to Resources' })).toHaveAttribute('href', parent)
  expect(sent).toEqual([])
  expect(popupFixture.sent).toEqual([])
  await tab.close()
})

const ionCatalog: S['CatalogEntry3'][] = JSON.parse(readFileSync('rules/mvp-v1-slice-9.json', 'utf8')).catalog

for (const width of [390]) {
test(`Ion Technology shows readable field notes, prerequisite progress, costs and submits research at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 })
  const research: { research: S['ResearchId3']; level: number }[] = [
    { research: 'EnergyTechnology', level: 4 },
    { research: 'LaserTechnology', level: 4 },
    { research: 'IonTechnology', level: 0 },
  ]
  const { sent, planet } = await setup(page, false, { metal: '1000000000', crystal: '300000000', deuterium: '100000000' }, { catalog: ionCatalog, research })
  planet.levels.ResearchLab = 4
  await refreshGame(page)
  await navigate(page, 'Research')
  await page.getByRole('link', { name: 'Research Ion Technology', exact: true }).click()
  const pane = page.getByRole('region', { name: 'Progression quote' })
  const notes = pane.getByRole('figure', { name: 'Ion Technology illustration' }).locator('figcaption')
  await expect(notes).toContainText('The science of charged particles harnessed for war.')
  await expect(notes).toContainText('from formidable planetary cannons to the weapons carried into battle by cruisers')
  await expect(notes).not.toContainText(/prerequisites|per.level|requires|at level/i)
  await notes.scrollIntoViewIfNeeded()
  await diagnosticScreenshot(page, { path: `test-results/ion-field-notes-${width}.png` })
  await pane.getByRole('button', { name: 'Technology tree', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Technology — Ion Technology', exact: true })
  await expect(dialog).toContainText('Research Lab')
  await expect(dialog).toContainText('Energy Technology')
  await expect(dialog).toContainText('Laser Technology')
  await expect(dialog).toContainText('4 / 5')
  await dialog.getByRole('button', { name: 'Close technology' }).click()
  research[1].level = 5
  await refreshGame(page)
  await pane.getByRole('button', { name: 'Technology tree', exact: true }).click()
  await expect(dialog).toContainText('5 / 5 · Met')
  await dialog.getByRole('button', { name: 'Close technology' }).click()
  await expect(pane.getByRole('button', { name: 'Metal details' })).toContainText('1,000')
  await expect(pane.getByRole('button', { name: 'Crystal details' })).toContainText('300')
  await expect(pane.getByRole('button', { name: 'Deuterium details' })).toContainText('100')
  const art = pane.locator('img').first()
  await expect(art).toHaveAttribute('src', /ion-technology/)
  await expect.poll(() => art.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true)
  await pane.getByRole('button', { name: 'Confirm research', exact: true }).click()
  await expect.poll(() => sent.length).toBe(1)
  expect(sent[0].command).toMatchObject({ type: 'StartResearch', research: 'IonTechnology', host: body.id })
})
}

for (const width of [1440, 390]) {
  test(`machined actions preserve native links, focus and tactile presses at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await setup(page)
    await navigate(page, 'Facilities')
    await page.getByRole('link', { name: 'Upgrade Robotics Factory', exact: true }).click()
    const panel = page.getByRole('region', { name: 'Progression quote' })
    const primary = panel.getByRole('button', { name: 'Confirm upgrade', exact: true })
    const back = panel.getByRole('link', { name: 'Back to Facilities', exact: true })
    await expect(primary).toBeEnabled()
    const faces = []
    for (const control of [primary, back]) {
      await control.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }))
      const paint = await control.evaluate((element) => ({
        face: getComputedStyle(element, '::after').backgroundColor,
        faceTop: parseFloat(getComputedStyle(element, '::after').top),
        plate: getComputedStyle(element, '::before').clipPath,
        hitArea: getComputedStyle(element).clipPath,
      }))
      expect(paint.plate).toContain('polygon')
      expect(paint.hitArea).toBe('none')
      faces.push(paint.face)
      const box = (await control.boundingBox())!
      expect(box.width).toBeGreaterThanOrEqual(44)
      expect(box.height).toBeGreaterThanOrEqual(44)
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      await expect(control).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 1)')
      expect(await control.evaluate((element) => parseFloat(getComputedStyle(element, '::after').top))).toBe(paint.faceTop + 1)
      // Releasing outside cancels the native action and restores the raised face.
      await page.mouse.move(0, 0)
      await page.mouse.up()
      await expect(control).toHaveCSS('transform', 'none')
    }
    expect(faces[0]).not.toBe(faces[1])
    const tree = panel.getByRole('button', { name: 'Technology tree', exact: true })
    await tree.focus()
    await page.keyboard.down('Space')
    await expect(tree).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 1)')
    await expect(tree).toHaveCSS('outline-style', width < 768 ? 'none' : 'solid')
    await page.keyboard.up('Space')
    await expect(page.getByRole('dialog', { name: 'Technology — Robotics Factory', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Close technology' }).click()
    await back.focus()
    await diagnosticScreenshot(page, { path: `test-results/machined-buttons-${width}.png` })
    await page.keyboard.press('Enter')
    await expect(page.getByRole('link', { name: 'Upgrade Robotics Factory', exact: true })).toBeFocused()
  })
}

test('disabled and reduced-motion buttons retain honest feedback and high-contrast focus', async ({ page }) => {
  const { sent } = await setup(page, true)
  await navigate(page, 'Facilities')
  await page.getByRole('link', { name: 'Upgrade Robotics Factory', exact: true }).click()
  const primary = page.getByRole('button', { name: 'Confirm upgrade', exact: true })
  await expect(primary).toBeDisabled()
  const box = (await primary.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await expect(primary).toHaveCSS('transform', 'none')
  await page.mouse.up()
  expect(sent).toHaveLength(0)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const tree = page.getByRole('button', { name: 'Technology tree', exact: true })
  await tree.focus()
  await page.keyboard.down('Space')
  await expect(tree).toHaveCSS('transform', 'none')
  expect(await tree.evaluate((element) => getComputedStyle(element, '::after').top)).toBe('2px')
  await page.keyboard.up('Space')
  const close = page.getByRole('button', { name: 'Close technology' })
  await page.emulateMedia({ forcedColors: 'active' })
  await close.focus()
  await expect(close).toHaveCSS('border-top-style', 'solid')
  await expect(close).toHaveCSS('outline-style', 'solid')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Technology — Robotics Factory', exact: true })).not.toBeVisible()
})

test('machined icon links and secondary actions work with touch', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  try {
    // This separate context shares the configured test origin, not a live account.
    await setup(page)
    await navigate(page, 'Facilities')
    await page.getByRole('link', { name: 'Upgrade Robotics Factory', exact: true }).tap()
    await page.getByRole('button', { name: 'Technology tree', exact: true }).tap()
    await page.getByRole('button', { name: 'Close technology' }).tap()
    await page.getByRole('link', { name: 'Back to Facilities', exact: true }).tap()
    await expect(page.getByRole('region', { name: 'Progression quote' })).toHaveCount(0)
  } catch (error) {
    await attachFailureScreenshots([page], test.info())
    throw error
  } finally {
    await context.close()
  }
})

test('clickable catalog cards keep artwork and labels left aligned independently of action buttons', async ({ page }) => {
  const now = Date.now()
  await page.clock.install({ time: now - 1000 })
  await page.clock.pauseAt(now)
  const planet = structuredClone(body)
  planet.levels.RoboticsFactory = 4
  planet.levels.ResearchLab = 2
  await setup(page, false, undefined, {
    sampledAt: now,
    bodies: [planet],
    catalog: [...catalog, {
      key: { kind: 'Building', id: 'Shipyard' },
      enabled: true,
      mobile: false,
      body_kinds: ['Planet'],
      requirements: [],
    }],
    constructions: [{
      id: id(10), body: body.id, building: 'RoboticsFactory', target_level: 5,
      due_at: now + 363000, paid: { metal: '0', crystal: '0', deuterium: '0' },
    }],
  })
  await navigate(page, 'Facilities')
  await expect(page.getByRole('button', { name: /^Build Robotics Factory/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Build Research Lab', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Build Shipyard', exact: true })).toBeDisabled()
  for (const width of [1440, 768, 767, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    for (const title of ['Robotics Factory', 'Research Lab', 'Shipyard']) {
      const card = page.getByRole('link', { name: `Upgrade ${title}`, exact: true })
      await expect(card).toBeVisible()
      const bounds = await card.evaluate((element) => {
        const card = element.getBoundingClientRect()
        const artwork = element.firstElementChild!.getBoundingClientRect()
        const caption = element.children[1].getBoundingClientRect()
        return { cardLeft: card.left, artLeft: artwork.left, artRight: artwork.right, captionLeft: caption.left }
      })
      // Art sits at the card's left border; the caption immediately follows it.
      // Applying the action-button flex centering or gap breaks these invariants.
      expect(bounds.artLeft - bounds.cardLeft).toBeCloseTo(1, 0)
      expect(bounds.captionLeft - bounds.artRight).toBeCloseTo(0, 0)
      await expect(card).toHaveCSS('text-align', 'left')
      const cardBox = (await card.boundingBox())!
      expect(cardBox.height).toBeGreaterThanOrEqual(width >= 768 ? 100 : 44)
      expect(cardBox.height).toBeLessThanOrEqual(width >= 768 ? 110 : 60)
    }
    const robotics = page.getByRole('link', { name: 'Upgrade Robotics Factory', exact: true })
    await expect(robotics.getByLabel('Construction progress')).toContainText('6m')
    await expect(robotics).toContainText('Level 4')
    const list = page.getByRole('region', { name: 'Facility buildings', exact: true })
    await diagnosticScreenshot(list, { path: `test-results/facilities-left-aligned-${width}.png` })
  }
})

for (const width of [390, 1440]) {
  test(`game routes use the final shared decision layout at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    const { sent } = await setup(page)
    for (const [route, tile, title, quantityLabel] of [
      ['facilities', 'Upgrade Robotics Factory', 'Robotics Factory', null],
      ['research', 'Research Combustion Drive', 'Combustion Drive', null],
      ['shipyard', 'Build Small Cargo', 'Small Cargo', 'Shipyard quantity'],
      ['defense', 'Build Rocket Launcher', 'Rocket Launcher', 'Defenses quantity'],
    ] as const) {
      await withBootstrapResponse(page, () => page.goto(`/u/andromeda/b/${body.id}/${route}`))
      await page.getByRole('link', { name: tile, exact: true }).click()
      const pane = page.getByRole('region', { name: 'Progression quote' })
      await expect(pane.getByRole('heading', { name: title, exact: true })).toBeVisible()
      await expect(pane.locator('article > header').getByText(/^(Building|Research|Ship|Defense)$/)).toHaveCount(0)
      await expect(page.getByRole('link', { name: tile, exact: true })).toHaveCount(0)
      const cost = pane.getByRole('group', { name: 'Required resources', exact: true }).first()
      await expect(cost.getByRole('button', { name: 'Metal details', exact: true })).toBeVisible()
      await expect(cost.getByText('Metal', { exact: true })).toHaveCount(0)
      if (quantityLabel) {
        const input = pane.getByRole('textbox', { name: quantityLabel, exact: true })
        const action = pane.getByRole('button', { name: 'Build', exact: true })
        await input.fill('12345')
        const fieldBox = (await input.boundingBox())!, actionBox = (await action.boundingBox())!
        expect(Math.abs(fieldBox.width - actionBox.width)).toBeLessThan(1)
        expect(fieldBox.x + fieldBox.width).toBeLessThan(actionBox.x)
        expect(Math.abs(fieldBox.y - actionBox.y)).toBeLessThan(1)
        await expect.poll(async () => (await action.innerText()).replace(/\s+/g, ' ').trim()).toBe(width < 768 ? 'Order 12345' : `Order 12345 ${title}`)
        await input.fill('1')
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await diagnosticScreenshot(pane, { path: `test-results/final-integration/game-detail-${route}-${width}.png` })
      await pane.getByRole('link', { name: /^Back to / }).click()
      await expect(page.getByRole('link', { name: tile, exact: true })).toBeFocused()
    }
    expect(sent).toHaveLength(0)
  })
}

for (const [section, tile, startAction, cancelAction, cancelType, cancelLabel] of [
  ['Facilities', 'Upgrade Robotics Factory', 'Confirm upgrade', 'Cancel construction', 'CancelConstruction', 'Cancel Construction'],
  ['Research', 'Research Combustion Drive', 'Confirm research', 'Cancel research', 'CancelResearch', 'Cancel Research'],
] as const) {
  test(`accepted ${section} start aliases keep cancellation feedback beside the action`, async ({ page }) => {
    await setup(page, false, undefined, { commandReferences: true })
    const sent: S['CommandEnvelopeV3'][] = []
    await page.route('**/commands', route => {
      const envelope = route.request().postDataJSON()
      sent.push(envelope)
      return route.fulfill({ json: {
        protocol: 3, binding, command_id: envelope.command_id,
        admitted_at: Date.now(), executed_at: null, status: 'Pending',
      } })
    })
    await navigate(page, section)
    await page.getByRole('link', { name: tile, exact: true }).click()
    await page.getByRole('button', { name: startAction, exact: true }).click()
    const result = page.getByRole('group', { name: 'Latest action result', exact: true })
    await expect(result).toContainText('Order accepted; awaiting the game result.')
    await page.getByRole('button', { name: cancelAction, exact: true }).click()
    await confirmCancellation(page)
    await expect.poll(() => sent.length).toBe(2)
    expect(sent[1].command).toEqual({ type: cancelType, operation: sent[0].command_id })
    await expect(result).toContainText(`Last submitted: ${cancelLabel}`)
    await expect(result).toContainText('Order accepted; awaiting the game result.')
    await expect(result).not.toContainText('confirmed')
  })
}

// Mobile variant retired under the one-repair policy; evidence and retained
// deterministic coverage are recorded in test-migration-progression.md.
for (const width of [1280]) {
  test(`ship comparison follows catalog rows and opens with the keyboard at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 950 })
    const ship = (
      id: 'LightFighter' | 'HeavyFighter',
      speed: string,
      drive: 'CombustionDrive' | 'ImpulseDrive',
    ): S['CatalogEntry3'] => ({
      key: { kind: 'Ship', id },
      enabled: true,
      mobile: true,
      requirements: [],
      body_kinds: ['Planet'],
      ship_statistics: {
        cost: ['3000', '1000', '0'],
        propulsion: {
          cargo_capacity: '50',
          base_speed: speed,
          fuel_consumption: '20',
          drive,
          drive_coefficient:
            drive === 'CombustionDrive' ? ['1', '10'] : ['1', '5'],
          impulse_upgrade: null,
        },
        combat: {
          attack_ticks: '5000000',
          shield_ticks: '1000000',
          hull_ticks: '40000000',
          technology_bonus: ['1', '10'],
          rapid_fire_against: [],
          rapid_fire_from: [],
        },
      },
    })
    const options = {
      catalog: [
        ship('LightFighter', '12500', 'CombustionDrive'),
        ship('HeavyFighter', '10000', 'ImpulseDrive'),
      ],
      research: [
        { research: 'CombustionDrive' as const, level: 2 },
        { research: 'ImpulseDrive' as const, level: 4 },
      ],
    }
    await shellFixture(page, options)
    await withBootstrapResponse(page, () => page.goto(`/u/andromeda/b/${body.id}/shipyard`))
    const summary = page.locator('summary').filter({ hasText: 'Compare ships' })
    const comparisonBox = (await summary.boundingBox())!
    for (const name of ['Build Light Fighter', 'Build Heavy Fighter']) {
      const ship = page.getByRole('link', { name, exact: true })
      const shipBox = (await ship.boundingBox())!
      expect(comparisonBox.y).toBeGreaterThan(shipBox.y + shipBox.height)
    }
    await summary.focus()
    await page.keyboard.press('Enter')
    const table = page.getByRole('table', {
      name: 'Current player ship statistics · per ship',
    })
    await expect(
      table.getByRole('row', { name: 'Effective speed 15,000 18,000' }),
    ).toBeVisible()
    await expect(
      table.getByRole('img', { name: 'Metal', exact: true }),
    ).toHaveCount(2)
    await expect(
      table.getByRole('row', {
        name: 'Attack strength Unavailable Unavailable',
      }),
    ).toBeVisible()
    // Prop updates and selection controls run against the isolated real component.
  })
}

const largeDomeContent = JSON.parse(readFileSync('rules/content/large-shield-dome.json', 'utf8'))
const largeDomeCatalog: S['CatalogEntry3'][] = (JSON.parse(readFileSync('rules/mvp-v1-slice-12.json', 'utf8')).catalog as S['CatalogEntry3'][]).map(entry => entry.key.id === 'LargeShieldDome'
  ? { ...entry, enabled: true, requirements: largeDomeContent.requirements }
  : entry)

for (const width of [390]) {
  test(`Large Shield Dome shows requirements and artwork and enforces its own limit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    const { sent, planet } = await setup(page, false, { metal: '50000000000', crystal: '50000000000', deuterium: '0' }, {
      catalog: largeDomeCatalog,
      research: [{ research: 'ShieldingTechnology', level: 6 }],
    })
    planet.levels.Shipyard = 6
    planet.amounts = { metal: '100000000000', crystal: '100000000000', deuterium: '0' }
    planet.inventories.push({ item: { kind: 'Defense', id: 'SmallShieldDome' }, count: '1' })
    await refreshGame(page)
    await navigate(page, 'Defense')
    await page.getByRole('link', { name: 'Build Large Shield Dome', exact: true }).click()
    const pane = page.getByRole('region', { name: 'Progression quote' })
    await expect(pane).toContainText('Its shield protects itself, not other units.')
    const art = pane.locator('img').first()
    await expect(art).toHaveAttribute('src', /large-shield-dome/)
    await expect.poll(() => art.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true)
    await pane.getByRole('button', { name: 'Technology tree', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Shipyard')
    await expect(dialog).toContainText('Shielding Technology')
    await expect(dialog.getByText('6 / 6 · Met', { exact: true })).toHaveCount(2)
    await dialog.getByRole('button', { name: 'Close technology' }).click()
    const cost = pane.getByRole('group', { name: 'Required resources', exact: true }).first()
    for (const name of ['Metal', 'Crystal']) await expect(cost.getByRole('button', { name: `${name} details` })).toContainText('50,000')
    await pane.getByLabel('Defenses quantity').fill('2')
    await expect(pane.getByRole('button', { name: 'Build', exact: true })).toBeDisabled()
    await expect(pane).toContainText('Capacity Reserved')
    await pane.getByLabel('Defenses quantity').fill('1')
    await expect(pane.getByRole('button', { name: 'Build', exact: true })).toBeEnabled()
    await pane.getByRole('button', { name: 'Build', exact: true }).click()
    await expect.poll(() => sent.length).toBe(1)
    expect(sent[0].command).toEqual({ type: 'StartManufacture', body: body.id, item: { kind: 'Defense', id: 'LargeShieldDome' }, quantity: '1', expected_terms_hash: 'b'.repeat(64) })
    planet.inventories.push({ item: { kind: 'Defense', id: 'LargeShieldDome' }, count: '1' })
    await refreshGame(page)
    await expect(pane).toContainText('Order confirmed. Costs shown are for a new order.')
    await pane.getByLabel('Defenses quantity').fill('1')
    await expect(pane.getByRole('button', { name: 'Build', exact: true })).toBeDisabled()
    await expect(pane).toContainText('Capacity Reserved')
    expect(sent).toHaveLength(1)
  })
}

// Regression: defense comparison must be reachable from both catalog and detail,
// preserve selection across research refresh, and remain keyboard/touch usable.
for (const width of [390]) {
  test(`defense comparison resets selection and mode on detail navigation at ${width}px`, async ({ page }) => {
    const capture = async (target: Page, options: Parameters<Page['screenshot']>[0]) => {
      if (process.env.ORBIT_TEST_SCREENSHOTS !== '1') return
      await target.evaluate(() => window.scrollTo(0, 0))
      await diagnosticScreenshot(target, options)
    }
    const height = 950
    await page.setViewportSize({ width, height })
    const defense = (id: 'RocketLauncher' | 'LightLaser' | 'SmallShieldDome', cost: string[], attack: string): S['CatalogEntry3'] => ({
      key: { kind: 'Defense', id }, enabled: true, mobile: false, requirements: [], body_kinds: ['Planet', 'Moon'],
      technical_data: {
        cost, bonuses: [], storage_capacities: null,
        combat: { attack_ticks: attack, shield_ticks: '2000000', hull_ticks: '20000000', technology_bonus: ['1', '10'], rapid_fire_against: [], rapid_fire_from: [{ unit: { kind: 'Ship', id: 'Bomber' }, factor: '20' }] },
        facts: [
          { label: 'Recovery after combat', value: '7 / 10 chance for each destroyed defense to recover independently; not a guaranteed fraction of losses.', subject: null },
          ...(id === 'SmallShieldDome' ? [{ label: 'Body limit', value: 'One completed or queued dome of this type per planet or moon. Its shield protects itself, not other units.', subject: null }] : []),
        ],
      },
    })
    const options = {
      catalog: [defense('RocketLauncher', ['2000', '0', '0'], '8000000'), defense('LightLaser', ['1500', '500', '0'], '10000000'), defense('SmallShieldDome', ['10000', '10000', '0'], '100000')],
      research: [{ research: 'WeaponsTechnology' as const, level: 3 }, { research: 'ShieldingTechnology' as const, level: 2 }, { research: 'ArmourTechnology' as const, level: 1 }],
    }
    await setup(page, false, undefined, options)
    // Same-app navigation retains the response-gated bootstrap catalog.
    await navigate(page, 'Defense')
    const summary = page.locator('summary').filter({ hasText: 'Compare defenses' })
    await summary.focus()
    await page.keyboard.press('Enter')
    const region = page.getByRole('region', { name: 'Defense comparison table' })
    await expect(region.getByRole('row', { name: 'Attack strength 104 130', exact: true })).toBeVisible()
    await expect(region.getByRole('img', { name: 'Metal', exact: true })).toHaveCount(2)
    await expect(page.getByRole('rowheader', { name: 'Cargo capacity' })).toHaveCount(0)
    await page.getByRole('radio', { name: 'Base stats', exact: true }).check()
    await page.getByRole('checkbox', { name: 'Rocket Launcher', exact: true }).uncheck()
    // The route transition must create the detail's default selection and mode.
    await withFixtureResponse(page, response => response.url().endsWith('/progression-options'), () => page.getByRole('link', { name: 'Build Small Shield Dome', exact: true }).click())
    await summary.click()
    await expect(region.getByRole('columnheader', { name: 'Small Shield Dome', exact: true })).toBeVisible()
    await expect(region.getByRole('columnheader', { name: 'Light Laser', exact: true })).toBeVisible()
    await expect(page.getByRole('radio', { name: 'My current stats', exact: true })).toBeChecked()
    await capture(page, { path: `test-results/defense-detail-current-${width}x${height}.png`, fullPage: true })
  })
}
