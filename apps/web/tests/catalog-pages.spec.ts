import { selectBody } from './fixtures/body-selector'
import { attachFailureScreenshots, diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { confirmCancellation } from './fixtures/confirmation'
import { captureCatalog } from './fixtures/catalog-capture'
import { readFileSync } from 'node:fs'
import { test, expect, type Locator, type Page } from './fixtures/test'
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
  await page.route('**/progression-options', (route) => route.abort())
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
  await page.goto(`/u/andromeda/b/${body.id}/research`)
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
  await confirmCancellation(page)
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
    key: { kind: 'Ship', id: 'Deathstar' },
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
    catalog,
    research: [
      { research: 'EnergyTechnology', level: 1 },
      { research: 'CombustionDrive', level: 0 },
    ],
    ...options,
  })
  await page.route('**/progression-options', async (route) => {
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
  await page.goto(`/u/${universeSlug(options.universeName ?? 'Andromeda')}/b/${body.id}/overview`)
  await expect(page.locator('main h1')).toContainText('Empire —')
  return fixture
}

test('facility rows have no upgrade action and require confirmation on the detail page', async ({
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
    name: 'Start upgrade Robotics Factory',
    exact: true,
  })
  await expect(quick).toHaveCount(0)
  await page.getByRole('link', { name: /^Back to / }).click()
  blockers.length = 0
  planet.fields++
  await refreshGame(page)
  await expect(quick).toHaveCount(0)
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

for (const [pageName, tile, action] of [
  ['Facilities', 'Upgrade Robotics Factory', 'Confirm upgrade'],
  ['Research', 'Research Combustion Drive', 'Confirm research'],
  ['Shipyard', 'Build Small Cargo', 'Build'],
  ['Defense', 'Build Rocket Launcher', 'Build'],
]) {
  test(`${pageName} confirmation follows spending and income without reopening`, async ({
    page,
  }) => {
    const { planet } = await setup(page)
    await navigate(page, pageName)
    await page.getByRole('link', { name: tile, exact: true }).click()
    const confirm = page.getByRole('button', { name: action, exact: true })
    await expect(confirm).toBeEnabled()
    planet.amounts.deuterium = '0'
    await refreshGame(page)
    planet.amounts.metal = '59999999'
    await refreshGame(page)
    await expect(confirm).toBeDisabled()
    await expect(page.getByLabel('Missing resources').getByRole('img', { name: 'metal', exact: true })).toBeVisible()
    planet.amounts.metal = '60000000'
    await refreshGame(page)
    await expect(confirm).toBeEnabled()
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

const navigate = async (page: Page, name: string) => {
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Navigation' })
    .getByRole('link', { name, exact: true })
    .click()
}

async function expectLegibleInspector(pane: Locator) {
  // Details appear in place immediately, with prices and blockers fully visible.
  await expect(pane).toHaveCSS('opacity', '1')
  const dimmed = await pane.locator('h2, table, [aria-label="Action blockers"]').evaluateAll(nodes => {
    const ancestors = []
    for (const node of nodes) {
      for (let current: Element | null = node; current; current = current.parentElement) {
        const style = getComputedStyle(current)
        if (Number(style.opacity) < 1 || style.filter !== 'none') ancestors.push(current.tagName)
      }
    }
    return ancestors
  })
  expect(dimmed).toEqual([])
  await expect(pane).toHaveCSS('transform', 'none')
  await expect(pane).toHaveCSS('animation-name', 'none')
  await expect(pane).toHaveCSS('transition-duration', '0s')
  await expectUndistortedArt(pane)
}

async function expectUndistortedArt(scope: Locator) {
  const scales = await scope
    .locator('img, [style*="background-image"], svg image')
    .evaluateAll(async (nodes) =>
      Promise.all(
        nodes.map(async (node) => {
          if (node instanceof HTMLImageElement) {
            await node.decode()
            const style = getComputedStyle(node)
            const rect = node.getBoundingClientRect()
            if (style.objectFit === 'contain' || style.objectFit === 'cover') {
              return { x: 1, y: 1 }
            }
            return { x: rect.width / node.naturalWidth, y: rect.height / node.naturalHeight }
          }
          const image = new Image()
          const svg = node instanceof SVGImageElement ? node : null
          const style = getComputedStyle(node)
          image.src = svg?.href.baseVal ?? style.backgroundImage.slice(5, -2)
          await image.decode()
          if (svg) {
            const matrix = svg.getScreenCTM()!
            return {
              x: (matrix.a * svg.width.baseVal.value) / image.naturalWidth,
              y: (matrix.d * svg.height.baseVal.value) / image.naturalHeight,
            }
          }
          const [width, height] = style.backgroundSize
            .split(' ')
            .map(parseFloat)
          const rect = node.getBoundingClientRect()
          return {
            x: (rect.width * width) / 100 / image.naturalWidth,
            y: (rect.height * height) / 100 / image.naturalHeight,
          }
        }),
      ),
    )
  expect(scales.length).toBeGreaterThan(0)
  for (const scale of scales) expect(scale.x).toBeCloseTo(scale.y, 4)
}

test('catalog detail artwork preserves source proportions in a tall panel', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1440, height: 900 })
  await setup(page)
  await navigate(page, 'Facilities')
  await page
    .getByRole('link', { name: 'Upgrade Robotics Factory', exact: true })
    .click()
  await expectUndistortedArt(
    page.getByRole('region', { name: 'Progression quote' }),
  )
  await diagnosticScreenshot(page, { path: 'test-results/catalog-detail-art.png' })
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
      await expect(page.getByRole('link', { name: tab, exact: true })).toHaveAttribute('aria-current', 'page')
      await expect(page.locator('main h1')).toHaveText(tab)
      // Work summaries can have their own headings; the repeated page header is gone.
      await expect(page.locator('main > header').getByRole('heading', { name: tab, exact: true })).toHaveCount(0)
      await expect(page.locator('main details')).toHaveCount(0)
      await expect(page.locator('main summary')).toHaveCount(0)
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
        const queueBounds = (await queue.boundingBox())!
        const tabs = (await page.getByRole('navigation', { name: 'Build navigation' }).boundingBox())!
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

test('manufacturing updates totals locally and Build validates without dismissing ships or defenses', async ({
  page,
}) => {
  const { sent, inspections } = await setup(page)
  await navigate(page, 'Shipyard')
  await expect(
    page.getByRole('link', { name: 'Build Deathstar', exact: true }),
  ).toHaveAttribute('title', 'Deathstar · unavailable in this universe')
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
  await expect(pane).toContainText('Enter a quantity to see the total cost.')
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

for (const action of ['edit', 'dismiss', 'reopen']) {
  test(`manufacturing ignores delayed validation after ${action}`, async ({
    page,
  }) => {
    const { sent } = await setup(page)
    await navigate(page, 'Shipyard')
    await page
      .getByRole('link', { name: 'Build Small Cargo', exact: true })
      .click()
    const build = page.getByRole('button', { name: 'Build', exact: true })
    await expect(build).toBeEnabled()
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let finished!: () => void
    const responded = new Promise<void>((resolve) => {
      finished = resolve
    })
    await page.route(
      '**/progression-options',
      async (route) => {
        await gate
        await route.fallback()
        finished()
      },
      { times: 1 },
    )
    await build.click()
    await expect(build).toBeDisabled()
    if (action === 'edit') await page.getByLabel('Shipyard quantity').fill('4')
    else await page.getByRole('link', { name: /^Back to / }).click()
    if (action === 'reopen')
      await page
        .getByRole('link', { name: 'Build Small Cargo', exact: true })
        .click()
    release()
    await responded
    if (action === 'edit' || action === 'reopen') {
      await expect(build).toBeEnabled()
      await expect(
        page.getByRole('region', { name: 'Progression quote' }),
      ).toContainText(`${action === 'edit' ? '4' : '1'} × Small Cargo`)
    } else
      await expect(
        page.getByRole('region', { name: 'Progression quote' }),
      ).toHaveCount(0)
    expect(sent).toEqual([])
  })
}

test('manufacturing does not submit when server costs differ from the displayed order', async ({
  page,
}) => {
  const { sent } = await setup(page)
  await navigate(page, 'Shipyard')
  await page
    .getByRole('link', { name: 'Build Small Cargo', exact: true })
    .click()
  const build = page.getByRole('button', { name: 'Build', exact: true })
  await expect(build).toBeEnabled()
  await page.route('**/progression-options', async (route) => {
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
        terms_hash: 'c'.repeat(64),
        blockers: [],
        estimates: null,
        terms: {
          type: 'Manufacture',
          profile_hash: 'a'.repeat(64),
          body: body.id,
          item: request.item,
          quantity: request.quantity,
          unit_cost: { metal: '70000000', crystal: '15000000', deuterium: '0' },
          paid: { metal: '70000000', crystal: '15000000', deuterium: '0' },
          unit_duration_ms: 30000,
          formula: 'ManufactureClassic',
          facilities: [],
        },
      },
    })
  })
  await build.click()
  await expect(
    page
      .getByRole('region', { name: 'Progression quote' })
      .getByRole('button', { name: 'Metal details' }),
  ).toContainText('70')
  await expect(build).toBeEnabled()
  await expect(page.getByRole('alert')).toContainText(
    'Cost or build time changed',
  )
  expect(sent).toEqual([])
})

for (const [destination, tile] of [
  ['Shipyard', 'Build Small Cargo'],
  ['Defense', 'Build Rocket Launcher'],
]) {
  test(`${destination} keeps the item route while submitting and exposes the order on the catalog`, async ({
    page,
  }) => {
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
    await expect(page.getByRole('list', { name: 'Manufacturing queue' })).toHaveCount(0)
    await pane.getByRole('link', { name: /^Back to / }).click()
    await expect(
      page.getByRole('list', { name: 'Manufacturing queue' }),
    ).toContainText('Confirming')
    await page.getByRole('link', { name: tile, exact: true }).click()
    release()
    await expect(build).toBeEnabled()
    await expect(pane).toBeVisible()
  })
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
    await page.goto(
      path === 'research'
        ? `/u/andromeda/b/${body.id}/research`
        : `/u/andromeda/b/${body.id}/${path}`,
    )
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

test('changing manufacturing quantity while unit terms load uses the latest quantity', async ({
  page,
}) => {
  await setup(page)
  let release!: () => void
  let arrived!: () => void
  const reached = new Promise<void>((resolve) => {
    arrived = resolve
  })
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(
    '**/progression-options',
    async (route) => {
      arrived()
      await gate
      await route.fallback()
    },
    { times: 1 },
  )
  await navigate(page, 'Shipyard')
  await page
    .getByRole('link', { name: 'Build Small Cargo', exact: true })
    .click()
  await reached
  await page.getByLabel('Shipyard quantity').fill('4')
  await expect(
    page.getByRole('button', { name: 'Build', exact: true }),
  ).toBeDisabled()
  release()

  await expect(
    page.getByRole('region', { name: 'Progression quote' }),
  ).toContainText('4 × Small Cargo')
  await page.getByRole('link', { name: /^Back to / }).click()
  await expect(
    page.getByRole('region', { name: 'Progression quote' }),
  ).toHaveCount(0)
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
test('selected unit decisions floor balances and retain large inventory on phones', async ({ page }) => {
  const { planet } = await setup(page)
  planet.inventories = [{ item: { kind: 'Ship', id: 'SmallCargo' }, count: '9007199254740993' }]
  planet.amounts.metal = '60000001'
  await refreshGame(page)
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto(`/u/andromeda/b/${body.id}/shipyard`)
    await page.getByRole('link', { name: 'Build Small Cargo', exact: true }).click()
    const pane = page.getByRole('region', { name: 'Progression quote' })
    await expectLegibleInspector(pane)
    await expect(pane.getByLabel('Unit inventory')).toContainText('9,007,199,254,740,993')
    await pane.getByText('Requirements & order terms', { exact: true }).click()
    const metal = pane.getByRole('row').filter({ has: page.getByRole('button', { name: 'Metal details' }) })
    await expect(metal.locator('td').nth(0).getByText('60', { exact: true })).toBeVisible()
    await expect(metal.locator('td').nth(1).getByText('0', { exact: true })).toBeVisible()
    await expect(pane.getByRole('button', { name: 'Build', exact: true })).toBeEnabled()
    const back = pane.getByRole('link', { name: 'Back to Shipyard', exact: true })
    await expect(back).toHaveText('')
    await expect(back.locator('svg')).toBeVisible()
    const backBox = await back.boundingBox()
    expect(backBox?.width).toBeGreaterThanOrEqual(44)
    expect(backBox?.height).toBeGreaterThanOrEqual(44)
    expect(await back.evaluate((element) => getComputedStyle(element, '::before').width)).toBe('36px')
    await expect(pane.getByRole('button', { name: 'Build', exact: true })).toHaveText('Order 1 Small Cargo')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await captureCatalog(page, `test-results/progression-ships-selected-${width}.png`)
    await diagnosticScreenshot(page, { path: `test-results/progression-ships-selected-${width}-viewport.png`, animations: 'disabled' })
    await pane.getByRole('button', { name: 'Build', exact: true }).click({ trial: true })
    await diagnosticScreenshot(page, { path: `test-results/progression-ships-decision-${width}-viewport.png`, animations: 'disabled' })
  }
})

test('facility catalog details remain usable when artwork fails', async ({ page }) => {
  await page.route('**/art/**', route => route.abort())
  const { sent } = await setup(page)
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(`/u/andromeda/b/${body.id}/facilities`)
    const marker = page.getByRole('link', { name: 'Upgrade Robotics Factory', exact: true })
    await marker.click()
    const pane = page.getByRole('region', { name: 'Progression quote' })
    await expect(pane.getByRole('button', { name: 'Confirm upgrade', exact: true })).toBeEnabled()
    await page.getByRole('link', { name: 'Back to Facilities' }).click()
    await expect(marker).toBeFocused()
    await expect(pane).toBeHidden()
  }
  expect(sent).toEqual([])
})

test('selected facilities research and defense show reviewable decisions at all target widths', async ({ page }) => {
  await installCatalogFixture(page, true)
  for (const [path, tile] of [['facilities', 'Upgrade Robotics Factory'], ['research', 'Research Combustion Drive'], ['defense', 'Build Rocket Launcher']]) {
    await page.goto(path === 'research' ? `/u/andromeda/b/${body.id}/research` : `/u/andromeda/b/${body.id}/${path}`)
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.getByRole('link', { name: tile, exact: true }).click()
      const pane = page.getByRole('region', { name: 'Progression quote' })
      await expect(pane.getByLabel('Action blockers')).toContainText('No Free Field')
      await expectLegibleInspector(pane)
      await expect(pane.getByRole('button', { name: path === 'facilities' ? 'Confirm upgrade' : path === 'research' ? 'Confirm research' : 'Build', exact: true })).toBeDisabled()
      await captureCatalog(page, `test-results/progression-${path}-blocked-${width}.png`)
      await pane.getByRole('link', { name: /^Back to / }).click()
      await expect(pane).toBeHidden()
    }
  }
})

test('active facility remains cancellable without a fresh quote at each target width', async ({ page }) => {
  await installGameFixture(page, {
    catalog,
    constructions: [{ id: '00000000-0000-4000-8000-000000000020', body: body.id, building: 'RoboticsFactory', target_level: 1, paid: { metal: '60000000', crystal: '15000000', deuterium: '0' }, due_at: Date.now() + 76000 }],
  })
  await page.route('**/progression-options', route => route.abort())
  await page.goto(`/u/andromeda/b/${body.id}/facilities`)
  await page.getByRole('link', { name: 'Upgrade Robotics Factory', exact: true }).click()
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    const pane = page.getByRole('region', { name: 'Progression quote' })
    await expect(pane.getByRole('button', { name: 'Cancel construction', exact: true })).toBeEnabled()
    await expect(pane.getByRole('group', { name: 'Cancellation refund', exact: true })).toContainText('60')
    await expectLegibleInspector(pane)
    await captureCatalog(page, `test-results/progression-facilities-active-${width}.png`)
  }
})

test('narrow spending ledgers keep whole large balances intact with visible labels', async ({
  page,
}) => {
  const { planet } = await setup(page, false, { metal: '9007199254740993', crystal: '15000000', deuterium: '0' })
  planet.amounts.metal = '9007199254740993'
  planet.amounts.crystal = '9007199254740993'
  await refreshGame(page)
  for (const [width, textSize, wideFont] of [[320, 100, false], [390, 100, false], [320, 200, false], [320, 200, true]] as const) {
    await page.setViewportSize({ width, height: 844 })
    await page.goto(`/u/andromeda/b/${body.id}/shipyard`)
    if (textSize === 200) await page.addStyleTag({ content: 'html { font-size: 200% !important }' })
    // Also exercise wider glyphs on hosts whose default system font is narrow.
    if (wideFont) await page.addStyleTag({ content: 'html { font-family: monospace !important }' })
    await page
      .getByRole('link', { name: 'Build Small Cargo', exact: true })
      .click()
    await page.getByText('Requirements & order terms', { exact: true }).click()
    const table = page
      .getByRole('region', { name: 'Progression quote' })
      .getByRole('table')
    await expect(
      table.getByText('Available', { exact: true }).last(),
    ).toBeVisible()
    const crystal = table.getByRole('row').filter({ has: page.getByRole('button', { name: 'Crystal details' }) })
    const values = [
      table.getByRole('button', { name: 'Metal details' }).getByText('9,007,199,254', { exact: true }),
      crystal.getByText('9,007,199,254', { exact: true }),
      crystal.getByText('9,007,199,239', { exact: true }),
    ]
    for (const value of values) {
      await expect(value).toBeVisible()
      const rects = await value.evaluate((element) => {
        const range = document.createRange()
        range.selectNodeContents(element)
        return [...range.getClientRects()].map(({ left, right }) => ({ left, right }))
      })
      expect(rects, `Exact balance at ${width}px / ${textSize}% / wide font ${wideFont}`).toHaveLength(1)
      expect(rects[0]!.left).toBeGreaterThanOrEqual(0)
      expect(rects[0]!.right).toBeLessThanOrEqual(width)
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width)
    await diagnosticScreenshot(page, {
      path: `test-results/final-integration/exact-large-cost-${width}-${textSize}${wideFont ? '-wide-font' : ''}.png`,
      fullPage: true,
      animations: 'disabled',
    })
  }
})

test('activated Impulse Drive uses server gates, supports level four, and shows its technology tree', async ({ page }) => {
  const impulse: S['CatalogEntry3'] = {
    key: { kind: 'Research', id: 'ImpulseDrive' },
    requirements: [
      { type: 'BodyBuilding', building: 'ResearchLab', level: 2 },
      { type: 'PlayerResearch', research: 'EnergyTechnology', level: 1 },
    ],
    enabled: true, mobile: false, body_kinds: ['Planet'],
  }
  const planet = structuredClone(body)
  planet.levels.ResearchLab = 2
  planet.amounts = { metal: '100000000000', crystal: '100000000000', deuterium: '100000000000' }
  await shellFixture(page, {
    bodies: [planet], catalog: [...catalog, impulse],
    research: [{ research: 'ImpulseDrive', level: 3 }, { research: 'EnergyTechnology', level: 1 }],
  })
  let sent: unknown
  await page.route('**/progression-options', async route => {
    const { context, request } = route.request().postDataJSON()
    expect(request).toEqual({ type: 'Research', host: body.id, research: 'ImpulseDrive' })
    await route.fulfill({ json: {
      protocol: 3, binding, request_id: context.request_id, viewer_revision: '1',
      sampled_at: Date.now(), as_of_ms: Date.now(), request,
      terms: { type: 'Research', profile_hash: 'a'.repeat(64), host: body.id, research: 'ImpulseDrive', source_level: 3, target_level: 4,
        paid: { metal: '16000000000', crystal: '32000000000', deuterium: '4800000000' },
        duration_ms: 11520000, formula: 'ResearchClassic', labs: [{ body: body.id, level: 2 }], effective_lab: '2', required_energy: '0' },
      terms_hash: 'b'.repeat(64), blockers: [], estimates: null,
    } })
  })
  await page.route('**/commands', async route => {
    const envelope = route.request().postDataJSON()
    sent = envelope.command
    await route.fulfill({ json: { protocol: 3, binding, command_id: envelope.command_id,
      admitted_at: Date.now(), executed_at: Date.now(), status: 'Committed', result_ids: [], minimum_viewer_revision: '1' } })
  })
  await page.goto(`/u/andromeda/b/${body.id}/research`)
  await page.getByRole('link', { name: 'Research Impulse Drive', exact: true }).click()
  const pane = page.getByRole('region', { name: 'Progression quote' })
  await expect(pane).toContainText('16,000')
  await pane.getByRole('button', { name: 'Technology tree', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Research Lab')
  await expect(dialog).toContainText('2 / 2 · Met')
  await expect(dialog).toContainText('Energy Technology')
  await expect(dialog).toContainText('1 / 1 · Met')
  await dialog.getByRole('tab', { name: 'Techinfo', exact: true }).click()
  await expect(dialog).toContainText('20% per level')
  await expect(dialog).toContainText('level 5')
  await dialog.getByRole('button', { name: 'Close technology' }).click()
  await pane.getByRole('button', { name: 'Confirm research', exact: true }).click()
  await expect.poll(() => sent).toEqual({ type: 'StartResearch', host: body.id, research: 'ImpulseDrive', expected_terms_hash: 'b'.repeat(64) })
})

test('activated Astrophysics shows three gates, exact rounded costs, and deferred missions', async ({ page }) => {
  const astrophysics: S['CatalogEntry3'] = {
    key: { kind: 'Research', id: 'Astrophysics' },
    requirements: [
      { type: 'BodyBuilding', building: 'ResearchLab', level: 3 },
      { type: 'PlayerResearch', research: 'EspionageTechnology', level: 4 },
      { type: 'PlayerResearch', research: 'ImpulseDrive', level: 3 },
    ],
    enabled: true, mobile: false, body_kinds: ['Planet'],
  }
  const dependencies: S['CatalogEntry3'][] = ['ImpulseDrive', 'EspionageTechnology'].map(id => ({
    key: { kind: 'Research', id: id as 'ImpulseDrive' | 'EspionageTechnology' },
    requirements: [], enabled: true, mobile: false, body_kinds: ['Planet'],
  }))
  const planet = structuredClone(body)
  planet.levels.ResearchLab = 3
  planet.amounts = { metal: '100000000000', crystal: '100000000000', deuterium: '100000000000' }
  await shellFixture(page, {
    bodies: [planet], catalog: [...catalog, ...dependencies, astrophysics],
    research: [{ research: 'Astrophysics', level: 4 }, { research: 'ImpulseDrive', level: 3 }, { research: 'EspionageTechnology', level: 4 }],
  })
  let sent: unknown
  await page.route('**/progression-options', async route => {
    const { context, request } = route.request().postDataJSON()
    expect(request).toEqual({ type: 'Research', host: body.id, research: 'Astrophysics' })
    await route.fulfill({ json: {
      protocol: 3, binding, request_id: context.request_id, viewer_revision: '1',
      sampled_at: Date.now(), as_of_ms: Date.now(), request,
      terms: { type: 'Research', profile_hash: 'a'.repeat(64), host: body.id, research: 'Astrophysics', source_level: 4, target_level: 5,
        paid: { metal: '37500000000', crystal: '75000000000', deuterium: '37500000000' },
        duration_ms: 20250000, formula: 'ResearchAstrophysics', labs: [{ body: body.id, level: 3 }], effective_lab: '3', required_energy: '0' },
      terms_hash: 'b'.repeat(64), blockers: [], estimates: null,
    } })
  })
  await page.route('**/commands', async route => {
    const envelope = route.request().postDataJSON()
    sent = envelope.command
    await route.fulfill({ json: { protocol: 3, binding, command_id: envelope.command_id,
      admitted_at: Date.now(), executed_at: Date.now(), status: 'Committed', result_ids: [], minimum_viewer_revision: '1' } })
  })
  await page.goto(`/u/andromeda/b/${body.id}/research`)
  await page.getByRole('link', { name: 'Research Astrophysics', exact: true }).click()
  const pane = page.getByRole('region', { name: 'Progression quote' })
  await expect(pane).toContainText('37,500')
  await expect(pane).toContainText('75,000')
  await pane.getByRole('button', { name: 'Technology tree', exact: true }).click()
  const dialog = page.getByRole('dialog')
  for (const name of ['Research Lab', 'Espionage Technology', 'Impulse Drive']) await expect(dialog).toContainText(name)
  await expect(dialog).toContainText('4 / 4 · Met')
  await expect(dialog).toContainText('3 / 3 · Met')
  await dialog.getByRole('tab', { name: 'Techinfo', exact: true }).click()
  await expect(dialog).toContainText('Positions 4–12 unlock at level 1')
  await expect(dialog).toContainText('Colonization requires this universe’s enabled Colony Ship and mission. Expeditions are unavailable.')
  await dialog.getByRole('button', { name: 'Close technology' }).click()
  await pane.getByRole('button', { name: 'Confirm research', exact: true }).click()
  await expect.poll(() => sent).toEqual({ type: 'StartResearch', host: body.id, research: 'Astrophysics', expected_terms_hash: 'b'.repeat(64) })
})

const laserCatalog: S['CatalogEntry3'][] = JSON.parse(readFileSync('rules/mvp-v1-slice-8.json', 'utf8')).catalog

test('Laser Technology shows its requirements, artwork and research action', async ({ page }) => {
  const { sent, planet } = await setup(page, false, { metal: '200000000', crystal: '100000000', deuterium: '0' }, {
    catalog: laserCatalog,
    research: [{ research: 'EnergyTechnology', level: 2 }, { research: 'LaserTechnology', level: 0 }],
  })
  planet.levels.ResearchLab = 1
  await refreshGame(page)
  await navigate(page, 'Research')
  await page.getByRole('link', { name: 'Research Laser Technology', exact: true }).click()
  const pane = page.getByRole('region', { name: 'Progression quote' })
  await expect(pane).toContainText('Weapon damage is improved by Weapons Technology.')
  await pane.getByRole('button', { name: 'Technology tree', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Research Lab')
  await expect(dialog).toContainText('1 / 1 · Met')
  await expect(dialog).toContainText('Energy Technology')
  await expect(dialog).toContainText('2 / 2 · Met')
  await dialog.getByRole('button', { name: 'Close technology' }).click()
  await expect(pane.getByRole('button', { name: 'Metal details' })).toContainText('200')
  await expect(pane.getByRole('button', { name: 'Crystal details' })).toContainText('100')
  await expect(pane.locator('img').first()).toBeVisible()
  await pane.getByRole('button', { name: 'Confirm research', exact: true }).click()
  await expect.poll(() => sent.length).toBe(1)
  expect(sent[0].command).toMatchObject({ type: 'StartResearch', research: 'LaserTechnology', host: body.id })
})

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

for (const width of [390, 1440]) {
  test.describe(`catalog focus at ${width}px`, () => {
    test.use({ viewport: { width, height: 844 }, hasTouch: true, isMobile: width === 390 })

    test('detail containers stay unoutlined while controls retain keyboard focus', async ({ page, browserName }) => {
      await setup(page)
      await page.goto(`/u/andromeda/b/${body.id}/shipyard`)
      const tile = page.getByRole('link', { name: 'Build Small Cargo', exact: true })
      if (width === 390) await tile.tap()
      else await tile.click()
      const panel = page.getByRole('region', { name: 'Progression quote' })
      await expect(panel).toBeFocused()
      await expect(panel).toHaveCSS('outline-style', 'none')
      await page.reload()
      await expect(panel).toBeFocused()
      await expect(panel).toHaveCSS('outline-style', 'none')
      await diagnosticScreenshot(page, { path: `test-results/catalog-focus-reload-${width}.png` })

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
      await expect(back).toHaveCSS('outline-style', 'solid')
      // Traverse real controls from the programmatic reading-order anchor.
      const quantity = panel.getByLabel('Shipyard quantity')
      let visitedQuantity = false
      for (let i = 0; i < 20 && !(await tree.evaluate(element => element === document.activeElement)); i++) {
        await page.keyboard.press(tabKey)
        if (await quantity.evaluate(element => element === document.activeElement)) {
          visitedQuantity = true
          await expect(quantity).toHaveCSS('outline-style', 'solid')
        }
      }
      expect(visitedQuantity).toBe(true)
      await expect(tree).toBeFocused()
      await expect(tree).toHaveCSS('outline-style', 'solid')
      await page.keyboard.press('Enter')
      await expect(page.getByRole('dialog', { name: 'Technology — Small Cargo', exact: true })).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(tree).toBeFocused()
      await expect(tree).toHaveCSS('outline-style', 'solid')
      await expect(panel).toHaveCSS('outline-style', 'none')
      await diagnosticScreenshot(page, { path: `test-results/catalog-focus-keyboard-${width}.png` })
    })
  })

  test(`catalog deep links survive refresh and history without Escape dismissal at ${width}px`, async ({ page }) => {
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
      await page.reload()
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
  await page.goto(`/u/andromeda/b/${body.id}/shipyard/small-cargo`)
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
    await page.goto(path)
    await expect(page.getByRole('heading', { name: 'Destination unavailable' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Progression quote' })).toHaveCount(0)
    await expect(page).toHaveURL(path)
  }
  await page.goto(`/u/andromeda/b/${body.id}/shipyard/deathstar`)
  const detail = page.getByRole('region', { name: 'Progression quote' })
  await expect(detail).toContainText('Unavailable in this universe.')
  await expect(detail.getByRole('button', { name: 'Build', exact: true })).toBeDisabled()
  expect(inspections.some(r => r.type === 'Manufacture' && r.item.id === 'Deathstar')).toBe(false)
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
  await page.goto(`/u/andromeda/b/${body.id}/facilities`)
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
  await tab.goto(detail)
  const panel = tab.getByRole('region', { name: 'Progression quote' })
  await expect(panel.getByRole('heading', { name: 'Metal Mine', exact: true })).toBeVisible()
  await expect(panel.getByRole('link', { name: 'Back to Resources' })).toHaveAttribute('href', parent)
  expect(sent).toEqual([])
  expect(popupFixture.sent).toEqual([])
  await tab.close()
})

const ionCatalog: S['CatalogEntry3'][] = JSON.parse(readFileSync('rules/mvp-v1-slice-9.json', 'utf8')).catalog

test('Ion Technology shows prerequisite progress, existing artwork, costs and submits research', async ({ page }) => {
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
  await expect(pane).toContainText('Ion provides no direct combat bonus or demolition discount.')
  await pane.getByRole('button', { name: 'Technology tree', exact: true }).click()
  const dialog = page.getByRole('dialog')
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
    await expect(tree).toHaveCSS('outline-style', 'solid')
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
  await expect(page.getByRole('button', { name: /^Start upgrade / })).toHaveCount(0)
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
      await page.goto(`/u/andromeda/b/${body.id}/${route}`)
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

for (const width of [320, 390, 1440]) {
  for (const [pageName, itemName, quantityLabel] of [
    ['Defense', 'Rocket Launcher', 'Defenses quantity'],
    ['Shipyard', 'Small Cargo', 'Shipyard quantity'],
  ] as const) {
    test(`${pageName} confirms the paid order separately from next-order affordability at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      const manufacturing: S['ManufacturingBatchDto'][] = []
      const { planet } = await setup(page, false, { metal: '2000000000', crystal: '0', deuterium: '0' }, { manufacturing })
      planet.amounts.metal = '12226000000'
      await refreshGame(page)
      let submitted = 0
      await page.route('**/commands', async route => {
        const envelope = route.request().postDataJSON()
        submitted++
        planet.amounts.metal = (BigInt(planet.amounts.metal) - BigInt(envelope.command.quantity) * 2000000000n).toString()
        manufacturing.push({
          id: envelope.command_id, body: body.id, item: envelope.command.item, quantity: envelope.command.quantity,
          completed_prefix: '0', remaining: envelope.command.quantity,
          paid: { metal: (BigInt(envelope.command.quantity) * 2000000000n).toString(), crystal: '0', deuterium: '0' },
          accepted_at: Date.now(), first_start_at: Date.now(), next_due_at: Date.now() + 30000,
          final_due_at: Date.now() + 30000 * Number(envelope.command.quantity), unit_duration_ms: 30000, state: 'Producing', can_cancel: false,
        })
        await route.fulfill({ json: {
          protocol: 3, binding, command_id: envelope.command_id,
          admitted_at: Date.now(), executed_at: Date.now(), status: 'Committed', result_ids: [], minimum_viewer_revision: '1',
        } })
      })
      await navigate(page, pageName)
      await page.getByRole('link', { name: `Build ${itemName}`, exact: true }).click()
      await page.getByLabel(quantityLabel).fill('4')
      const build = page.getByRole('button', { name: 'Build', exact: true })
      await expect(build).toBeEnabled()
      await build.click()
      const result = page.getByRole('group', { name: 'Latest action result', exact: true })
      await expect(result).toContainText(`Last submitted: 4 × ${itemName}`)
      await expect(result).toContainText('Order confirmed. Costs shown are for a new order.')
      await expect(page.getByRole('status').filter({ hasText: `4 × ${itemName}: Order confirmed.` })).toHaveCount(1)
      await expect(page.getByLabel(quantityLabel)).toHaveValue('0')
      await expect(page.getByRole('alert')).toHaveCount(0)
      await expect(build).toBeDisabled()
      // A new unaffordable order is independent of the confirmed order.
      await page.getByLabel(quantityLabel).fill('4')
      await expect(page.getByLabel('Missing resources')).toBeVisible()
      await expect(page.getByText('New order cost', { exact: true })).toBeVisible()
      await expect(build).toBeDisabled()
      expect(submitted).toBe(1)
      await result.scrollIntoViewIfNeeded()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await diagnosticScreenshot(page, { path: `test-results/action-confirmation-${pageName}-${width}.png`, fullPage: true })
      // Editing the next order never changes the acknowledged quantity.
      await page.getByLabel(quantityLabel).fill('1')
      await expect(result).toContainText(`4 × ${itemName}`)
      await expect(build).toBeEnabled()
      await build.click()
      await expect(result).toContainText(`Last submitted: 1 × ${itemName}`)
      await expect(result).toContainText('Order confirmed.')
      await expect(page.getByLabel(quantityLabel)).toHaveValue('0')
      await expect(build).toBeDisabled()
      expect(submitted).toBe(2)
      await page.getByRole('link', { name: /^Back to / }).click()
      await page.getByRole('link', { name: `Build ${itemName}`, exact: true }).click()
      await expect(result).toContainText(`Last submitted: 1 × ${itemName}`)
    })
  }
}

for (const edit of [false, true]) {
  test(`delayed manufacturing success ${edit ? 'preserves the next quantity' : 'resets the submitted quantity'}`, async ({ page }) => {
    await setup(page)
    let release!: () => void
    const held = new Promise<void>(resolve => { release = resolve })
    await page.route('**/commands', async route => {
      await held
      await route.fallback()
    })
    await navigate(page, 'Shipyard')
    await page.getByRole('link', { name: 'Build Small Cargo', exact: true }).click()
    const quantity = page.getByLabel('Shipyard quantity')
    const result = page.getByRole('group', { name: 'Latest action result', exact: true })
    await quantity.fill('4')
    try {
      await page.getByRole('button', { name: 'Build', exact: true }).click()
      await expect(result).toContainText('Submitting action.')
      await expect(quantity).toHaveValue('4')
      if (edit) await quantity.fill('2')
    } finally {
      release()
    }
    await expect(result).toContainText('Order confirmed.')
    await expect(result).toContainText('Last submitted: 4 × Small Cargo')
    await expect(quantity).toHaveValue(edit ? '2' : '0')
  })
}

for (const [outcome, width] of [['Pending', 320], ['Rejected', 390], ['uncertain', 1440]] as const) {
  test(`manufacturing shows submitting and ${outcome} beside the order without false success at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await setup(page)
    let submitted = 0
    let release!: () => void
    const held = new Promise<void>(resolve => { release = resolve })
    await page.route('**/commands', async route => {
      const envelope = route.request().postDataJSON()
      submitted++
      await held
      if (outcome === 'uncertain') return route.abort('failed')
      await route.fulfill({ json: {
        protocol: 3, binding, command_id: envelope.command_id,
        admitted_at: Date.now(), executed_at: outcome === 'Pending' ? null : Date.now(), status: outcome,
        ...(outcome === 'Rejected' ? { code: 'InsufficientResources' } : {}),
      } })
    })
    await navigate(page, 'Defense')
    await page.getByRole('link', { name: 'Build Rocket Launcher', exact: true }).click()
    await page.getByLabel('Defenses quantity').fill('4')
    const build = page.getByRole('button', { name: 'Build', exact: true })
    const result = page.getByRole('group', { name: 'Latest action result', exact: true })
    await expect(build).toBeEnabled()
    const initialHeight = (await build.boundingBox())!.height
    try {
      await build.click()
      await expect(result).toContainText('Submitting action.')
      await expect(build).toHaveText('Confirming')
      expect((await build.boundingBox())!.height).toBe(initialHeight)
      await expect(result).not.toContainText('confirmed')
      await expect(page.getByLabel('Defenses quantity')).toHaveValue('4')
      await expect(build).toBeDisabled()
      // The ledger updates before persistence and network delivery finish.
      await expect.poll(() => submitted).toBe(1)
      // A rapid second activation must not send another command.
      await build.evaluate((button: HTMLButtonElement) => button.click())
      expect(submitted).toBe(1)
    } finally {
      // Never leave an intercepted response held when an assertion fails.
      release()
    }
    await expect(result).toContainText(outcome === 'Pending'
      ? 'Order accepted; awaiting the game result.'
      : outcome === 'Rejected' ? 'Action rejected: Insufficient Resources' : 'Response uncertain. Your action is saved.')
    await expect(result).not.toContainText('confirmed')
    await expect(page.getByLabel('Defenses quantity')).toHaveValue('4')
    if (outcome === 'Rejected') await expect(build).toBeEnabled()
    else await expect(build).toBeDisabled()
    if (outcome === 'uncertain') {
      await page.route('**/commands/*?epoch=*', route => route.fulfill({ json: {
        protocol: 3, binding, command_id: new URL(route.request().url()).pathname.split('/').at(-1),
        admitted_at: Date.now(), executed_at: Date.now(), status: 'Committed', result_ids: [], minimum_viewer_revision: '1',
      } }))
      await result.getByRole('button', { name: 'Resolve saved command' }).click()
      await expect(result).toContainText('Order confirmed.')
      await expect(page.getByLabel('Defenses quantity')).toHaveValue('0')
    }
    expect(submitted).toBe(1)
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

const ionCannonCatalog: S['CatalogEntry3'][] = JSON.parse(readFileSync('rules/mvp-v1-slice-10.json', 'utf8')).catalog

for (const width of [390, 1440]) {
  test(`Ion Cannon shows gates, artwork and inventory and orders the exact batch at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    const { sent, planet } = await setup(page, false, { metal: '2000000000', crystal: '6000000000', deuterium: '0' }, {
      catalog: ionCannonCatalog,
      research: [{ research: 'IonTechnology', level: 4 }],
    })
    planet.levels.Shipyard = 4
    planet.amounts = { metal: '100000000000', crystal: '100000000000', deuterium: '0' }
    planet.inventories.push({ item: { kind: 'Defense', id: 'IonCannon' }, count: '7' })
    await refreshGame(page)
    await navigate(page, 'Defense')
    const tile = page.getByRole('link', { name: 'Build Ion Cannon', exact: true })
    await expect(tile).toContainText('7')
    await tile.click()
    const pane = page.getByRole('region', { name: 'Progression quote' })
    await expect(pane).toContainText('A stationary cannon with strong shields')
    const art = pane.locator('img').first()
    await expect(art).toHaveAttribute('src', /ion-cannon/)
    await expect.poll(() => art.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true)
    await pane.getByRole('button', { name: 'Technology tree', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText('Shipyard')
    await expect(dialog).toContainText('Ion Technology')
    await expect(dialog.getByText('4 / 4 · Met', { exact: true })).toHaveCount(2)
    await dialog.getByRole('button', { name: 'Close technology' }).click()
    await pane.getByLabel('Defenses quantity').fill('3')
    const cost = pane.getByRole('group', { name: 'Required resources', exact: true }).first()
    await expect(cost.getByRole('button', { name: 'Metal details' })).toContainText('6,000')
    await expect(cost.getByRole('button', { name: 'Crystal details' })).toContainText('18,000')
    await expect(pane.getByRole('button', { name: 'Build', exact: true })).toBeEnabled()
    await pane.getByRole('button', { name: 'Build', exact: true }).click()
    await expect.poll(() => sent.length).toBe(1)
    expect(sent[0].command).toEqual({
      type: 'StartManufacture', body: body.id, item: { kind: 'Defense', id: 'IonCannon' }, quantity: '3', expected_terms_hash: 'b'.repeat(64),
    })
    planet.inventories.find(x => x.item.id === 'IonCannon')!.count = '10'
    await refreshGame(page)
    await pane.getByRole('link', { name: 'Back to Defense', exact: true }).click()
    await expect(tile).toContainText('10')
    expect(sent).toHaveLength(1)
  })
}

for (const gate of ['Shipyard', 'IonTechnology', 'disabled'] as const) {
  test(`Ion Cannon cannot be ordered with ${gate} unavailable`, async ({ page }) => {
    const catalog = structuredClone(ionCannonCatalog)
    if (gate === 'disabled') catalog.find(e => e.key.id === 'IonCannon')!.enabled = false
    const research = [{ research: 'IonTechnology' as const, level: gate === 'IonTechnology' ? 3 : 4 }]
    const { sent, planet, blockers } = await setup(page, false, { metal: '2000000000', crystal: '6000000000', deuterium: '0' }, { catalog, research })
    planet.levels.Shipyard = gate === 'Shipyard' ? 3 : 4
    blockers.push({ code: gate === 'disabled' ? 'UnavailableContent' : 'PrerequisiteMissing', requirement: null, required: null, actual: null, resource: null, unit: null })
    await refreshGame(page)
    await page.goto(`/u/andromeda/b/${body.id}/defense/ion-cannon`)
    const pane = page.getByRole('region', { name: 'Progression quote' })
    if (gate === 'disabled') {
      await expect(pane).toContainText('Unavailable in this universe.')
    } else {
      await pane.getByRole('button', { name: 'Technology tree', exact: true }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toContainText('3 / 4')
      await dialog.getByRole('button', { name: 'Close technology' }).click()
    }
    await expect(pane.getByRole('button', { name: 'Build', exact: true })).toBeDisabled()
    expect(sent).toEqual([])
  })
}

for (const { width, protocol } of [{ width: 390, protocol: 4 as const }, { width: 1280, protocol: 3 as const }]) {
  test(`ship technical statistics show authoritative base values at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    const stats: S['ShipStatistics3'] = {
      propulsion: {
        cargo_capacity: '7654', base_speed: '4321', fuel_consumption: '17',
        drive: 'CombustionDrive',
        impulse_upgrade: { minimum_level: 8, base_speed: '9876', fuel_consumption: '33' },
      },
      combat: { attack_ticks: '1234000', shield_ticks: '5678000', hull_ticks: '80000000', rapid_fire_against: [{ unit: { kind: 'Ship', id: 'EspionageProbe' }, factor: '5' }], rapid_fire_from: [] },
    }
    await installCatalogFixture(page, false, undefined, {
      catalog: catalog.map(entry => entry.key.id === 'SmallCargo' ? { ...entry, ship_statistics: stats } : entry),
      research: [{ research: 'CombustionDrive', level: 10 }],
      protocol,
    })
    await page.goto(`/u/andromeda/b/${body.id}/shipyard/small-cargo`)
    await page.getByText('Technical data', { exact: true }).click()
    const detail = page.getByRole('region', { name: 'Ship technical statistics' })
    const assertStats = async (section: Locator) => {
      for (const [name, value] of [['Cargo capacity', '7,654'], ['Base speed', '4,321'], ['Base fuel consumption', '17'], ['Attack strength', '12.34'], ['Shield strength', '56.78'], ['Hull strength', '800']]) {
        await expect(section.locator('dl > div').filter({ has: page.getByText(name, { exact: true }) }).locator('dd')).toHaveText(value)
      }
      await expect(section).toContainText('Base values per ship, before research bonuses.')
      await expect(section).toContainText('At Impulse Drive level 8')
      await expect(section).toContainText('Espionage Probe × 5')
      await expect(section).toContainText('Rapid fire fromNone')
      await expect(section).toContainText('9,876')
      await expect(section.locator('dl').getByLabel('Deuterium', { exact: true })).toBeVisible()
    }
    await assertStats(detail)
    await expect.poll(() => detail.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    await detail.getByRole('heading', { name: 'Ship technical statistics' }).click()
    await detail.scrollIntoViewIfNeeded()
    await diagnosticScreenshot(page, { path: `test-results/ship-statistics-detail-${width}.png` })
    await page.getByRole('button', { name: 'Technology tree', exact: true }).click()
    await page.getByRole('tab', { name: 'Techinfo', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Technology — Small Cargo' })
    await dialog.getByText('Technical data', { exact: true }).click()
    await assertStats(dialog.getByRole('region', { name: 'Ship technical statistics' }))
    await expect.poll(() => dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    await diagnosticScreenshot(page, { path: `test-results/ship-statistics-techinfo-${width}.png` })
  })
}

test('older protocol ship details explicitly show unavailable technical statistics', async ({ page }) => {
  await installCatalogFixture(page)
  await page.goto(`/u/andromeda/b/${body.id}/shipyard/small-cargo`)
  await page.getByText('Technical data', { exact: true }).click()
  await expect(page.getByRole('region', { name: 'Ship technical statistics' })).toContainText('Technical statistics are unavailable')
  await page.getByRole('button', { name: 'Technology tree', exact: true }).click()
  await page.getByRole('tab', { name: 'Techinfo', exact: true }).click()
  await page.getByRole('dialog').getByText('Technical data', { exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('region', { name: 'Ship technical statistics' })).toContainText('Technical statistics are unavailable')
})

for (const width of [390, 1280]) {
  test(`building research and defense technical data stays secondary and keyboard accessible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    const empty: S['TechnicalData3'] = { facts: [], bonuses: [], combat: null, storage_capacities: null }
    const technicalCatalog = catalog.map(entry => ({
      ...entry,
      ...(entry.key.id === 'RoboticsFactory' ? { technical_data: { ...empty, facts: [{ label: 'Construction time', value: 'The raw construction duration is divided by (1 + Robotics Factory level).', subject: null }] } } : {}),
      ...(entry.key.id === 'CombustionDrive' ? { technical_data: { ...empty, bonuses: [{ label: 'Base speed', fraction: ['3', '20'], subject: { kind: 'Ship', id: 'SmallCargo' }, condition: 'Replaced when Impulse Drive reaches level 8.' }] } } : {}),
      ...(entry.key.id === 'RocketLauncher' ? { technical_data: { ...empty, combat: { attack_ticks: '8000000', shield_ticks: '2000000', hull_ticks: '20000000', rapid_fire_against: [], rapid_fire_from: [{ unit: { kind: 'Ship', id: 'Cruiser' }, factor: '10' }] }, facts: [{ label: 'Recovery after combat', value: '7 / 10 chance for each destroyed defense to recover independently.', subject: null }] } } : {}),
      ...(entry.key.id === 'SmallCargo' ? { requirements: [{ type: 'PlayerResearch', research: 'CombustionDrive', level: 6 }] } : {}),
    })) as S['CatalogEntry3'][]
    await installCatalogFixture(page, false, undefined, { catalog: technicalCatalog })
    for (const [route, text, name] of [
      ['facilities/robotics-factory', 'The raw construction duration', 'Robotics Factory'],
      ['research/combustion-drive', '+15% of base', 'Combustion Drive'],
      ['defense/rocket-launcher', 'Base values per defense', 'Rocket Launcher'],
    ]) {
      await page.goto(`/u/andromeda/b/${body.id}/${route}`)
      const disclosure = page.locator('details').filter({ has: page.locator('summary').filter({ hasText: /^Technical data$/ }) })
      const summary = disclosure.locator('summary')
      await expect(summary).toBeVisible()
      await expect(disclosure).not.toHaveAttribute('open', '')
      await expect(disclosure.getByText(text, { exact: false })).toBeHidden()
      await summary.focus()
      await page.keyboard.press('Enter')
      await expect(disclosure).toHaveAttribute('open', '')
      await expect(disclosure).toContainText(text)
      if (route.startsWith('research')) {
        await expect(disclosure).toContainText('Replaced when Impulse Drive reaches level 8')
        await expect(disclosure).toContainText('Level 6')
        await expect(disclosure.getByRole('link', { name: 'Small Cargo', exact: true })).toBeVisible()
        await expect(disclosure).not.toContainText('Deathstar')
      }
      await expect.poll(() => disclosure.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
      await summary.scrollIntoViewIfNeeded()
      await diagnosticScreenshot(page, { path: `test-results/technical-${route.split('/')[0]}-${width}.png` })
      await summary.focus()
      await page.keyboard.press('Space')
      await expect(disclosure).not.toHaveAttribute('open', '')
      await page.getByRole('button', { name: 'Technology tree', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: `Technology — ${name}` })
      await dialog.getByRole('tab', { name: 'Techinfo', exact: true }).click()
      const modalData = dialog.locator('details')
      await expect(modalData).not.toHaveAttribute('open', '')
      await modalData.locator('summary').click()
      await expect(modalData).toContainText(text)
      await expect.poll(() => dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
      await dialog.getByRole('button', { name: 'Close technology', exact: true }).click()
    }
  })
}
