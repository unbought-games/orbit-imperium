import {
  withBootstrapResponse,
  withFixtureResponse,
  withProgressionResponse,
} from './fixtures/responses'
import { routeProgressionOptions } from './fixtures/progression-options'
import { productionFixture } from '../src/test-support/production'
import { navigate } from './fixtures/navigation'
import { selectBody } from './fixtures/body-selector'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { test, expect, type Page } from './fixtures/test'
import {
  installGameFixture,
  shellFixture,
  body,
  binding,
  id,
} from './fixtures/game'
import { universeSlug } from '../src/client-model/universe-name'
import type { components } from '../src/contracts'
type S = components['schemas']
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
async function installCatalogFixture(
  page: Page,
  blocked = false,
  unitCost?: S['Resources'],
  options: Parameters<typeof shellFixture>[1] = {},
) {
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
    production: (options.bodies ?? [planet]).map((planet) => ({
      ...productionFixture(planet),
      gross_per_hour: { metal: '0', crystal: '0', deuterium: '0' },
    })),
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
    const paid = unitCost ?? {
      metal: '60000000',
      crystal: '15000000',
      deuterium: '0',
    }
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

async function setup(
  page: Page,
  blocked = false,
  unitCost?: S['Resources'],
  options: Parameters<typeof shellFixture>[1] = {},
) {
  const fixture = await installCatalogFixture(page, blocked, unitCost, options)
  await withFixtureResponse(
    page,
    (response) => new URL(response.url()).pathname === '/api/v1/bootstrap',
    () =>
      page.goto(
        `/u/${universeSlug(options.universeName ?? 'Andromeda')}/b/${body.id}/overview`,
      ),
  )
  await expect(page.locator('main h1')).toContainText('Empire —')
  return fixture
}

test('Defense keeps the item route while submitting and exposes the order on the catalog at 1440px', async ({
  page,
}) => {
  const width = 1440
  const destination = 'Defense'
  const tile = 'Build Rocket Launcher'
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
  const pane = page.getByRole('region', { name: 'Progression quote' })
  try {
    await build.click()
    await expect(build).toBeDisabled()
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
  } finally {
    release()
  }
  await expect(build).toBeEnabled()
  await expect(pane).toBeVisible()
})

test('catalogs fit narrow screens and enlarged text without losing controls', async ({
  page,
}) => {
  await installCatalogFixture(page)
  // Building and manufacturing use distinct detail controls. Resize the mounted
  // surface instead of replaying the same navigation at every width.
  for (const [path, tab, tile, work] of [
    ['facilities', 'Facilities', 'Upgrade Robotics Factory', 'Buildings'],
    ['shipyard', 'Shipyard', 'Build Light Fighter', 'Shipyard & defense'],
  ]) {
    await withBootstrapResponse(page, () =>
      page.goto(`/u/andromeda/b/${body.id}/${path}`),
    )
    const item = page.getByRole('link', { name: tile, exact: true })
    const queue = page.getByRole('region', { name: work, exact: true })
    const heading = page
      .getByRole('region')
      .filter({ has: item })
      .last()
      .getByRole('heading', { level: 2 })
      .first()
    await expect(item).toBeVisible()
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      const navigation =
        width >= 1024
          ? page.getByRole('complementary', { name: 'Game navigation' })
          : page.getByRole('navigation', { name: 'Develop navigation' })
      await expect(
        navigation.getByRole('link', { name: tab, exact: true }),
      ).toHaveAttribute('aria-current', 'page')
      await expect(page.locator('main h1')).toHaveText(tab)
      await expect(
        page
          .locator('main > header')
          .getByRole('heading', { name: tab, exact: true }),
      ).toHaveCount(0)
      await expect(page.locator('main summary')).toHaveText(
        path === 'shipyard' ? ['Compare ships'] : [],
      )
      const masthead =
        width >= 1024
          ? page.getByRole('group', { name: 'Planet and resources' })
          : navigation
      await expect(heading).toBeVisible()
      await expect(queue).toBeVisible()
      const measured = await page.evaluate(
        ([nav, panel, title]) => {
          const n = nav!.getBoundingClientRect(),
            q = panel!.getBoundingClientRect(),
            h = title!.getBoundingClientRect()
          return { workGap: q.top - n.bottom, catalogGap: h.top - q.bottom }
        },
        [
          await masthead.elementHandle(),
          await queue.elementHandle(),
          await heading.elementHandle(),
        ],
      )
      expect(measured.catalogGap).toBeGreaterThanOrEqual(0)
      expect(measured.catalogGap).toBeLessThanOrEqual(20)
      if (path === 'shipyard') {
        expect(measured.workGap).toBeGreaterThanOrEqual(0)
        expect(measured.workGap).toBeLessThanOrEqual(20)
      }
    }
    await page.setViewportSize({ width: 390, height: 844 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await item.click()
    const panel = page.getByRole('region', { name: 'Progression quote' })
    await expect(panel).toBeVisible()
    await panel
      .getByRole('button', { name: 'Technology tree', exact: true })
      .click()
    const tree = page.getByRole('dialog')
    await expect(tree).toBeVisible()
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
    }
    await page.setViewportSize({ width: 390, height: 844 })
    await page.evaluate(
      () => (document.documentElement.style.fontSize = '200%'),
    )
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await page.keyboard.press('Escape')
    await expect(panel).toBeVisible()
    await page.setViewportSize({ width: 390, height: 844 })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await panel.getByRole('link', { name: /^Back to / }).click()
    await expect(item).toBeFocused()
    await page.evaluate(() =>
      document.documentElement.style.removeProperty('font-size'),
    )
    await page.emulateMedia({ reducedMotion: 'no-preference' })
  }
})

test('planet changes retain the item, reset edits, and link across prerequisites in the selected context', async ({
  page,
}) => {
  const other = {
    ...structuredClone(body),
    id: id(6),
    coordinates: { galaxy: 1, system: 10, position: 4 },
  }
  const entries = catalog.map((entry) =>
    entry.key.id === 'SmallCargo'
      ? {
          ...entry,
          requirements: [
            {
              type: 'PlayerResearch' as const,
              research: 'CombustionDrive' as const,
              level: 1,
            },
            {
              type: 'BodyBuilding' as const,
              building: 'Shipyard' as const,
              level: 2,
            },
          ],
        }
      : entry,
  )
  const { sent, inspections } = await setup(page, false, undefined, {
    bodies: [body, other],
    catalog: entries,
  })
  await withProgressionResponse(
    page,
    (r) =>
      r.type === 'Manufacture' &&
      r.body === body.id &&
      r.item.id === 'SmallCargo',
    () => page.goto(`/u/andromeda/b/${body.id}/shipyard/small-cargo`),
  )
  await page.getByLabel('Shipyard quantity').fill('7')
  await withProgressionResponse(
    page,
    (r) =>
      r.type === 'Manufacture' &&
      r.body === other.id &&
      r.item.id === 'SmallCargo',
    () => selectBody(page, other.id),
  )
  await expect(page).toHaveURL(
    `/u/andromeda/b/${other.id}/shipyard/small-cargo`,
  )
  await expect(page.getByLabel('Shipyard quantity')).toHaveValue('1')
  await expect
    .poll(() =>
      inspections.some((r) => r.type === 'Manufacture' && r.body === other.id),
    )
    .toBe(true)
  await page
    .getByRole('button', { name: 'Technology tree', exact: true })
    .click()
  const dialog = page.getByRole('dialog', { name: 'Technology — Small Cargo' })
  const drive = dialog.getByRole('link', {
    name: 'Combustion Drive',
    exact: true,
  })
  await expect(drive).toHaveAttribute(
    'href',
    `/u/andromeda/b/${other.id}/research/combustion-drive`,
  )
  await drive.click()
  await expect(page).toHaveURL(
    `/u/andromeda/b/${other.id}/research/combustion-drive`,
  )
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect
    .poll(() =>
      inspections.some((r) => r.type === 'Research' && r.host === other.id),
    )
    .toBe(true)
  expect(sent).toEqual([])
  await page
    .getByRole('button', { name: 'Confirm research', exact: true })
    .click()
  await expect.poll(() => sent.length).toBe(1)
  expect(sent[0].command).toMatchObject({
    type: 'StartResearch',
    research: 'CombustionDrive',
    host: other.id,
  })
  await page.goBack()
  await expect(page).toHaveURL(
    `/u/andromeda/b/${other.id}/shipyard/small-cargo`,
  )
  // Returning to the funding planet's item is still a real item page after
  // reload, not a dismissible dialog or a list with the old quantity selected.
  await page.setViewportSize({ width: 390, height: 900 })
  const itemPath = `/u/andromeda/b/${other.id}/shipyard/small-cargo`
  const listPath = `/u/andromeda/b/${other.id}/shipyard`
  const item = page.getByRole('region', { name: 'Progression quote' })
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(itemPath)
  await expect(item).toBeVisible()
  await withProgressionResponse(
    page,
    (r) =>
      r.type === 'Manufacture' &&
      r.body === other.id &&
      r.item.id === 'SmallCargo',
    () => page.reload(),
  )
  await expect(item).toBeFocused()
  await expect(item).toHaveCSS('outline-style', 'none')
  await expect(page.locator('[data-catalog-item]')).toHaveCount(0)
  const back = item.getByRole('link', { name: 'Back to Shipyard', exact: true })
  await expect(back).toHaveAttribute('href', listPath)
  await back.click()
  await expect(page).toHaveURL(listPath)
  await expect(
    page.getByRole('link', { name: 'Build Small Cargo', exact: true }),
  ).toBeFocused()
  await page.goBack()
  await expect(page).toHaveURL(itemPath)
  await expect(item).toBeVisible()
  await page.goForward()
  await expect(page).toHaveURL(listPath)
  expect(sent).toHaveLength(1)
})
