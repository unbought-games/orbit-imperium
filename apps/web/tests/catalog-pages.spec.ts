import { captureCatalog } from './fixtures/catalog-capture'
import { test, expect, type Locator, type Page } from '@playwright/test'
import { shellFixture, body, binding, refreshGame } from './fixtures/game'
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
  await page.goto(`/u/andromeda/research?body=${body.id}`)
  const progress = page
    .getByRole('button', { name: 'Research Energy Technology', exact: true })
    .getByRole('group', { name: 'Research progress' })
  await expect(progress).toContainText(/1m \d+s/)
  await expect(progress.getByLabel('Target level 2')).toBeVisible()
  await expect(
    page.getByRole('group', { name: 'Research progress' }),
  ).toHaveCount(1)
  await page
    .getByRole('button', { name: 'Research Energy Technology', exact: true })
    .click()
  const pane = page.getByRole('region', { name: 'Progression quote' })
  await expect(pane).toContainText('60 metal')
  await expect(pane.getByText(/Full refund before completion:/)).toHaveCount(1)
  await pane
    .getByRole('button', { name: 'Cancel research', exact: true })
    .click()
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
async function setup(page: Page, blocked = false, unitCost?: S['Resources']) {
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
  await shellFixture(page, {
    bodies: [planet],
    catalog,
    research: [
      { research: 'EnergyTechnology', level: 1 },
      { research: 'CombustionDrive', level: 0 },
    ],
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
            host: body.id,
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
              body: body.id,
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
              body: body.id,
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

test('facility upgrade arrow respects server blockers and submits directly when eligible', async ({
  page,
}) => {
  const { sent, planet, blockers } = await setup(page, true)
  await navigate(page, 'Facilities')
  await page
    .getByRole('button', { name: 'Upgrade Robotics Factory', exact: true })
    .click()
  await expect(page.getByLabel('Action blockers')).toContainText(
    'No Free Field',
  )
  const quick = page.getByRole('button', {
    name: 'Start upgrade Robotics Factory',
    exact: true,
  })
  await expect(quick).toHaveCount(0)
  await page.getByRole('button', { name: 'Dismiss quote' }).click()
  blockers.length = 0
  planet.fields++
  await refreshGame(page)
  await expect(quick).toBeVisible()
  await quick.focus()
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
  ).toHaveCount(0)
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
    await page.getByRole('button', { name: tile, exact: true }).click()
    const pane = page.getByRole('region', { name: 'Progression quote' })
    await pane.getByRole('button', { name: action, exact: true }).click()
    await expect(pane).toBeVisible()
    const work = pane.getByRole('region', { name: region, exact: true })
    await expect(work).toContainText('Confirming')
    await expect(work.getByRole('button', { name: /Cancel/ })).toBeDisabled()
    await expect(work.getByRole('heading')).toBeFocused()
    const progress = page
      .getByRole('button', { name: tile, exact: true })
      .getByRole('group', {
        name:
          pageName === 'Research'
            ? 'Research progress'
            : 'Construction progress',
      })
    await expect(progress).toContainText('Confirming')
    expect(writes.size).toBe(1)
    release()
    await expect(work).toHaveCount(0)
    await expect(progress).toHaveCount(0)
    await expect(pane).toBeVisible()
    await expect(
      pane.getByRole('button', { name: action, exact: true }),
    ).toBeEnabled()
    await pane.getByRole('button', { name: 'Dismiss quote' }).click()
    await expect(pane).toBeHidden()
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
    await page.getByRole('button', { name: tile, exact: true }).click()
    const confirm = page.getByRole('button', { name: action, exact: true })
    await expect(confirm).toBeEnabled()
    planet.amounts.deuterium = '0'
    await refreshGame(page)
    planet.amounts.metal = '59999999'
    await refreshGame(page)
    await expect(confirm).toBeDisabled()
    await expect(page.getByLabel('Action blockers')).toContainText('metal')
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
  const tile = page.getByRole('button', {
    name: 'Upgrade Robotics Factory',
    exact: true,
  })
  await expect(tile).toHaveAttribute('title', /Not enough resources/)
  await expect(tile).toBeEnabled()
  await tile.click()
  await expect(page.getByLabel('Action blockers')).toContainText('metal')
  planet.amounts.metal = '60000000'
  await refreshGame(page)
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
  // Selection may move into place, but prices and blockers never fade with art.
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
  await expect(pane).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)')
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
    .getByRole('button', { name: 'Upgrade Robotics Factory', exact: true })
    .click()
  await expectUndistortedArt(
    page.getByRole('region', { name: 'Progression quote' }),
  )
  await page.screenshot({ path: 'test-results/catalog-detail-art.png' })
})

test('object stages preserve source proportions at desktop and phone widths', async ({
  page,
}) => {
  await setup(page)
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(`/u/andromeda/b/${body.id}/facilities`)
    await page.getByText('Facilities colony', { exact: true }).click()
    const scene = page.getByRole('region', { name: 'Facilities objects' })
    await expect(scene).toBeVisible()
    await expectUndistortedArt(scene.locator('..'))
    await page.screenshot({ path: `test-results/catalog-scene-${width}.png` })
  }
})

test('facilities and research share inline details and technology prerequisites', async ({
  page,
}) => {
  const { sent } = await setup(page)
  await navigate(page, 'Facilities')
  await page
    .getByRole('button', { name: 'Upgrade Robotics Factory', exact: true })
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
  const tile = page.getByRole('button', {
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
  await details.getByRole('button', { name: 'Dismiss quote' }).click()
  await expect(tile).toBeFocused()
})

test('manufacturing updates totals locally and Build validates without dismissing ships or defenses', async ({
  page,
}) => {
  const { sent, inspections } = await setup(page)
  await navigate(page, 'Shipyard')
  await expect(
    page.getByRole('button', { name: 'Build Deathstar', exact: true }),
  ).toBeDisabled()
  await page
    .getByRole('button', { name: 'Build Small Cargo', exact: true })
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
    .getByRole('button', { name: 'Build Rocket Launcher', exact: true })
    .click()
  await page.getByLabel('Defenses quantity').fill('0')

  await expect(page.getByRole('alert')).toContainText('positive whole quantity')
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
      .getByRole('button', { name: 'Build Small Cargo', exact: true })
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
    else await page.getByRole('button', { name: 'Dismiss quote' }).click()
    if (action === 'reopen')
      await page
        .getByRole('button', { name: 'Build Small Cargo', exact: true })
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
    .getByRole('button', { name: 'Build Small Cargo', exact: true })
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
  test(`${destination} keeps details open and shows the order in the shared queue while submitting`, async ({
    page,
  }) => {
    await setup(page)
    await navigate(page, destination)
    await page.getByRole('button', { name: tile, exact: true }).click()
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
    ).toContainText('Confirming')
    release()
    await expect(build).toBeEnabled()
    await expect(pane).toBeVisible()
  })
}

test('catalogs fit narrow screens and enlarged text without losing controls', async ({
  page,
}) => {
  await setup(page)
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
        ? `/u/andromeda/research?body=${body.id}`
        : `/u/andromeda/b/${body.id}/${path}`,
    )
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await page.getByRole('button', { name: tile, exact: true }).click()
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
        await panel.getByRole('button', { name: 'Dismiss quote' }).click()
        await expect(panel).toBeHidden()
      }
    }
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.evaluate(() => (document.documentElement.style.fontSize = '200%'))
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
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
    .getByRole('button', { name: 'Build Small Cargo', exact: true })
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
  await page.getByRole('button', { name: 'Dismiss quote' }).click()
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
    await page.screenshot({
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
    await page.getByRole('button', { name: 'Build Small Cargo', exact: true }).click()
    const pane = page.getByRole('region', { name: 'Progression quote' })
    await expectLegibleInspector(pane)
    await expect(pane.getByLabel('Unit inventory')).toContainText('9007199254740993')
    const metal = pane.getByRole('row').filter({ has: page.getByRole('button', { name: 'Metal details' }) })
    await expect(metal.locator('td').nth(0).getByText('60', { exact: true })).toBeVisible()
    await expect(metal.locator('td').nth(1).getByText('0', { exact: true })).toBeVisible()
    await expect(pane.getByRole('button', { name: 'Build', exact: true })).toBeEnabled()
    await expect(pane.getByRole('button', { name: 'Dismiss quote' })).toHaveText('Back')
    await expect(pane.getByRole('button', { name: 'Build', exact: true })).toHaveText('Order 1 Small Cargo')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await captureCatalog(page, `test-results/progression-ships-selected-${width}.png`)
    await page.screenshot({ path: `test-results/progression-ships-selected-${width}-viewport.png`, animations: 'disabled' })
    await pane.getByRole('button', { name: 'Build', exact: true }).click({ trial: true })
    await page.screenshot({ path: `test-results/progression-ships-decision-${width}-viewport.png`, animations: 'disabled' })
  }
})

test('facility and research object stages remain usable when artwork fails', async ({ page }) => {
  await page.route('**/art/**', route => route.abort())
  const { sent } = await setup(page)
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(`/u/andromeda/b/${body.id}/facilities`)
    await page.getByText('Facilities colony', { exact: true }).click()
    const marker = page.getByRole('button', { name: 'Inspect Robotics Factory', exact: true })
    await marker.click()
    const pane = page.getByRole('region', { name: 'Progression quote' })
    await expect(pane.getByRole('button', { name: 'Confirm upgrade', exact: true })).toBeEnabled()
    await page.keyboard.press('Escape')
    await expect(marker).toBeFocused()
    await expect(pane).toBeHidden()
  }
  expect(sent).toEqual([])
})

test('selected facilities research and defense show reviewable decisions at all target widths', async ({ page }) => {
  await setup(page, true)
  for (const [path, tile] of [['facilities', 'Upgrade Robotics Factory'], ['research', 'Research Combustion Drive'], ['defense', 'Build Rocket Launcher']]) {
    await page.goto(path === 'research' ? `/u/andromeda/research?body=${body.id}` : `/u/andromeda/b/${body.id}/${path}`)
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 })
      await page.getByRole('button', { name: tile, exact: true }).click()
      const pane = page.getByRole('region', { name: 'Progression quote' })
      await expect(pane.getByLabel('Action blockers')).toContainText('No Free Field')
      await expectLegibleInspector(pane)
      await expect(pane.getByRole('button', { name: path === 'facilities' ? 'Confirm upgrade' : path === 'research' ? 'Confirm research' : 'Build', exact: true })).toBeDisabled()
      await captureCatalog(page, `test-results/progression-${path}-blocked-${width}.png`)
      await pane.getByRole('button', { name: 'Dismiss quote' }).click()
      await expect(pane).toBeHidden()
    }
  }
})

test('active facility remains cancellable without a fresh quote at each target width', async ({ page }) => {
  await shellFixture(page, {
    catalog,
    constructions: [{ id: '00000000-0000-4000-8000-000000000020', body: body.id, building: 'RoboticsFactory', target_level: 1, paid: { metal: '60000000', crystal: '15000000', deuterium: '0' }, due_at: Date.now() + 76000 }],
  })
  await page.route('**/progression-options', route => route.abort())
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.goto(`/u/andromeda/b/${body.id}/facilities`)
    await page.getByRole('button', { name: 'Upgrade Robotics Factory', exact: true }).click()
    const pane = page.getByRole('region', { name: 'Progression quote' })
    await expect(pane.getByRole('button', { name: 'Cancel construction', exact: true })).toBeEnabled()
    await expect(pane).toContainText('60 metal')
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
      .getByRole('button', { name: 'Build Small Cargo', exact: true })
      .click()
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
    await page.screenshot({
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
  await page.goto(`/u/andromeda/research?body=${body.id}`)
  await page.getByRole('button', { name: 'Research Impulse Drive', exact: true }).click()
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
  await page.goto(`/u/andromeda/research?body=${body.id}`)
  await page.getByRole('button', { name: 'Research Astrophysics', exact: true }).click()
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
