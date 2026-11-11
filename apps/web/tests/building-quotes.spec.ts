import { withBootstrapResponse, withProgressionResponse } from './fixtures/responses'
import { routeProgressionOptions } from './fixtures/progression-options'
import { productionFixture } from '../src/test-support/production'
import { selectBody } from './fixtures/body-selector'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { expect, test, type Page } from './fixtures/test'
import type { components } from '../src/contracts'
import {
  binding,
  body,
  id,
  shellFixture,
  installGameFixture,
  refreshGame,
} from './fixtures/game'

type S = components['schemas']
const now = Date.now()

async function buildingFixture(page: Page, active = false, activeBuilding: S['BuildingId3'] = 'CrystalMine') {
  await page.clock.install({ time: now })
  const planet = structuredClone(body)
  planet.amounts = {
    metal: '1000000000',
    crystal: '1000000000',
    deuterium: '182999999',
  }
  const constructions: S['Construction3'][] = active
    ? [
        {
          id: id(10),
          body: body.id,
          building: activeBuilding,
          target_level: planet.levels[activeBuilding]! + 1,
          due_at: now + 60000,
          paid: { metal: '76000000', crystal: '38000000', deuterium: '0' },
        },
      ]
    : []
  const bootstrap = page.waitForResponse((r) =>
    r.url().endsWith('/api/v1/bootstrap'),
  )
  await shellFixture(page, {
    protocol: 4,
    bodies: [planet],
    constructions,
    catalog: [
      ...['MetalStorage', 'CrystalMine', 'MetalMine'].map((id) => ({
        key: { kind: 'Building' as const, id: id as S['BuildingId3'] },
        enabled: true,
        mobile: false,
        body_kinds: ['Planet' as const],
        requirements: [],
      })),
      {
        key: { kind: 'Building', id: 'ResearchLab' },
        enabled: true,
        mobile: false,
        body_kinds: ['Planet'],
        requirements: [],
      },
    ],
  })
  const baseline: S['BoundView4'] = (await (await bootstrap).json()).result.game
    .snapshot.view
  let completed = false
  let reads = 0
  await page.route('**/overview', (route) => {
    reads++
    return route.fulfill({
      json: {
        ...baseline,
        request_id: route.request().postDataJSON().request_id,
        sampled_at: completed
          ? baseline.sampled_at + 60000
          : baseline.sampled_at,
        as_of_ms: completed ? baseline.sampled_at + 60000 : baseline.sampled_at,
        viewer_revision: completed ? '2' : '1',
        bodies: [planet],
        constructions,
      },
    })
  })
  await routeProgressionOptions(page, (route) => {
    const { context, request } = route.request().postDataJSON()
    const building = request.building as S['BuildingId3']
    const source = planet.levels[building]!
    const response: S['BoundProgressionOptions4'] = {
      protocol: 4,
      binding,
      request_id: context.request_id,
      viewer_revision: completed ? '2' : '1',
      sampled_at: now,
      as_of_ms: now,
      request,
      terms_hash: 'b'.repeat(64),
      estimates: null,
      blockers: constructions.length
        ? [
            {
              code: 'ActiveConstruction',
              requirement: null,
              required: null,
              actual: null,
              resource: null,
              unit: null,
            },
          ]
        : [],
      terms: {
        type: 'Building',
        profile_hash: baseline.profile_hash,
        body: planet.id,
        building,
        action: request.type,
        source_level: source,
        target_level: source + (request.type === 'Demolition' ? -1 : 1),
        paid: {
          metal: '200000000',
          crystal: '400000000',
          deuterium: building === 'ResearchLab' ? '200000000' : '0',
        },
        duration_ms: 57000,
        formula: 'BuildingRedesign2011',
        facilities: [],
        required_energy: '0',
        reserve_fields: 1,
      },
      building_benefit:
        building === 'MetalStorage'
          ? {
              kind: 'MetalCapacity',
              current: '10000000000',
              target: '20000000000',
            }
          : building === 'CrystalMine'
            ? {
                kind: 'CrystalPerHour',
                current: '22000000',
                target: request.type === 'Demolition' ? '0' : '48400000',
              }
            : undefined,
      building_energy: {
        current_consumption: building === 'CrystalMine' ? '11000000' : '0',
        target_consumption:
          building === 'CrystalMine'
            ? request.type === 'Demolition'
              ? '0'
              : '24200000'
            : '0',
      },
    }
    return route.fulfill({ json: response })
  })
  return {
    reads: () => reads,
    complete: () => {
      completed = true
      constructions.length = 0
      planet.levels.CrystalMine = 2
      planet.fields_reserved = 0
    },
  }
}

async function quickBuildFixture(page: Page) {
  await page.clock.install({ time: now })
  const planets = [
    structuredClone(body),
    {
      ...structuredClone(body),
      id: id(6),
      coordinates: { galaxy: 1, system: 2, position: 3 },
    },
  ]
  const constructions: S['Construction3'][] = []
  const sent: S['CommandEnvelopeV3'][] = []
  const blockers: S['BoundProgressionOptions3']['blockers'] = []
  let revision = 1
  let optionsGate: Promise<void> | null = null
  let commandGate: Promise<void> | null = null
  let rejected = false
  let failOptions = false
  let queries = 0
  await installGameFixture(page, {
    bodies: planets,
    // Balance changes in these tests are explicit, including one-micro-unit shortages.
    production: planets.map(planet => ({ ...productionFixture(planet), gross_per_hour: { metal: '0', crystal: '0', deuterium: '0' } })),
    constructions,
    viewerRevision: () => String(revision),
    sampledAt: now,
    catalog: [
      'MetalMine',
      'CrystalMine',
      'DeuteriumSynthesizer',
      'RoboticsFactory',
    ].map((building) => ({
      key: { kind: 'Building', id: building as S['BuildingId3'] },
      enabled: true,
      mobile: false,
      body_kinds: ['Planet'],
      requirements: [],
    })),
  })
  await routeProgressionOptions(page, async (route) => {
    const { context, request } = route.request().postDataJSON()
    queries++
    const planet = planets.find((planet) => planet.id === request.body)!
    const source =
      planet.levels[request.building as keyof typeof planet.levels]!
    const quote: S['BoundProgressionOptions3'] = {
      protocol: 3,
      binding,
      request_id: context.request_id,
      viewer_revision: String(revision),
      sampled_at: now,
      as_of_ms: now,
      request,
      terms_hash: 'b'.repeat(64),
      estimates: null,
      blockers: structuredClone(blockers),
      terms: {
        type: 'Building',
        profile_hash: 'a'.repeat(64),
        body: planet.id,
        building: request.building,
        action: 'Upgrade',
        source_level: source,
        target_level: source + 1,
        paid: { metal: '60000000', crystal: '15000000', deuterium: '0' },
        duration_ms: 60000,
        formula: 'BuildingRedesign2011',
        facilities: [],
        required_energy: '0',
        reserve_fields: 1,
      },
    }
    if (optionsGate) await optionsGate
    if (failOptions) return route.abort()
    await route.fulfill({ json: quote })
  })
  await page.route('**/commands', async (route) => {
    const envelope: S['CommandEnvelopeV3'] = route.request().postDataJSON()
    sent.push(envelope)
    if (commandGate) await commandGate
    if (!rejected && envelope.command.type === 'StartUpgrade') {
      constructions.push({
        id: id(90),
        body: envelope.command.body,
        building: envelope.command.building,
        target_level:
          planets.find((p) => p.id === envelope.command.body)!.levels[
            envelope.command.building
          ]! + 1,
        due_at: now + 60000,
        paid: { metal: '60000000', crystal: '15000000', deuterium: '0' },
      })
      revision++
    }
    await route.fulfill({
      json: {
        protocol: 3,
        binding,
        command_id: envelope.command_id,
        admitted_at: now,
        executed_at: now,
        ...(rejected
          ? { status: 'Rejected', code: 'InsufficientResources' }
          : {
              status: 'Committed',
              result_ids: [id(90)],
              minimum_viewer_revision: String(revision),
            }),
      },
    })
  })
  return {
    planets,
    constructions,
    sent,
    blockers,
    queries: () => queries,
    gateOptions: (gate: Promise<void> | null) => {
      optionsGate = gate
    },
    gateCommand: (gate: Promise<void> | null) => {
      commandGate = gate
    },
    reject: () => {
      rejected = true
    },
    failOptions: (fail: boolean) => {
      failOptions = fail
    },
    refresh: async () => {
      revision++
      await refreshGame(page)
    },
  }
}

for (const [catalog, building] of [
  ['resources', 'Metal Mine'],
  ['facilities', 'Robotics Factory'],
] as const) {
  test(`quick build submits once from ${catalog} and retains progress and row navigation`, async ({
    page,
  }) => {
    const fixture = await quickBuildFixture(page)
    await page.clock.pauseAt(now + 1000)
    let release!: () => void
    fixture.gateCommand(
      new Promise<void>((resolve) => {
        release = resolve
      }),
    )
    try {
      await openQuickBuildCatalog(page, catalog, building.replaceAll(' ', '') as S['BuildingId3'])
      const build = page.getByRole('button', {
        name: new RegExp(`^Build ${building} level`),
      })
      await expect(build).toBeEnabled()
      // Deliberately dispatch two activations within one browser task.
      await build.evaluate((button) => {
        ;(button as HTMLButtonElement).click()
        ;(button as HTMLButtonElement).click()
      })
      await expect.poll(() => fixture.sent.length).toBe(1)
      expect(fixture.sent[0].command).toMatchObject({
        type: 'StartUpgrade',
        body: body.id,
        building: building.replaceAll(' ', ''),
        expected_terms_hash: 'b'.repeat(64),
      })
      await expect(page).toHaveURL(new RegExp(`/${catalog}$`))
      const row = page.getByRole('link', {
        name: `Upgrade ${building}`,
        exact: true,
      })
      await expect(row.getByLabel('Construction progress')).toContainText(
        'Confirming',
      )
      await expect(build).toHaveCount(0)
      const control = page.getByRole('group', {
        name: `${building} quick build`,
      })
      await page.clock.runFor(250)
      await expect(
        control.getByRole('img', { name: 'Build requested; confirming' }),
      ).toHaveCSS('opacity', '1')
      for (const width of [390, 1440]) {
        await page.setViewportSize({
          width,
          height: width === 390 ? 844 : 1000,
        })
        await expect(control).toHaveAttribute('data-phase', 'check')
        await diagnosticScreenshot(page, {
          path: `test-results/${catalog}-quick-build-check-${width}.png`,
        })
      }
      release()
      await expect(
        page
          .getByRole('button', { name: 'Cancel construction', exact: true })
          .first(),
      ).toBeEnabled()
      await page.clock.runFor(3000)
      await expect(control).toHaveAttribute('data-phase', 'countdown')
      await expect(control.getByLabel(`${building} time remaining`)).toHaveCSS(
        'opacity',
        '1',
      )
      for (const width of [390, 1440]) {
        await page.setViewportSize({
          width,
          height: width === 390 ? 844 : 1000,
        })
        await diagnosticScreenshot(page, {
          path: `test-results/${catalog}-quick-build-countdown-${width}.png`,
        })
      }
      await row.click()
      await expect(
        page.getByRole('region', { name: 'Active construction' }),
      ).toBeVisible()
      expect(fixture.sent).toHaveLength(1)
    } finally {
      release()
    }
  })
}

for (const width of [390, 1440]) {
test(`quick build follows live affordability without requerying and confirmed completion at ${width}px`, async ({
  page,
}) => {
  await page.setViewportSize({ width, height: 900 })
  const fixture = await quickBuildFixture(page)
  const batches: unknown[][] = []
  const singles: string[] = []
  page.on('request', (request) => {
    if (request.url().endsWith('/progression-options/bulk')) batches.push(request.postDataJSON().requests)
    if (request.url().endsWith('/progression-options')) singles.push(request.url())
  })
  fixture.planets[0].amounts.metal = '59999999'
  await openQuickBuildCatalog(page)
  const build = page.getByRole('button', {
    name: 'Build Metal Mine level 2',
    exact: true,
  })
  await expect(build).toBeDisabled()
  await expect(build).toHaveAccessibleDescription('Build requirements not met')
  await build.evaluate((button) => (button as HTMLButtonElement).click())
  await expect(page).toHaveURL(/\/resources$/)
  expect(fixture.sent).toHaveLength(0)
  expect(batches).toHaveLength(1)
  expect(singles).toHaveLength(0)
  const before = fixture.queries()
  fixture.planets[0].amounts.metal = '60000000'
  await fixture.refresh()
  await expect(build).toBeEnabled()
  expect(fixture.queries()).toBe(before)
  fixture.planets[0].amounts.metal = '0'
  await fixture.refresh()
  await expect(build).toBeDisabled()
  fixture.planets[0].amounts.metal = '1000000000'
  fixture.constructions.push({
    id: id(90),
    body: body.id,
    building: 'CrystalMine',
    target_level: 2,
    due_at: now + 60000,
    paid: { metal: '0', crystal: '0', deuterium: '0' },
  })
  await fixture.refresh()
  await expect(
    page.getByRole('button', { name: 'Build Metal Mine', exact: true }),
  ).toBeDisabled()
  const beforeCompletion = batches.length
  await diagnosticScreenshot(page, { path: `test-results/bulk-resources-active-${width}x900.png` })
  fixture.constructions.length = 0
  fixture.planets[0].levels.CrystalMine = 2
  await fixture.refresh()
  await expect(build).toBeEnabled()
  await expect(
    page.getByRole('button', {
      name: 'Build Crystal Mine level 3',
      exact: true,
    }),
  ).toBeEnabled()
  expect(fixture.sent).toHaveLength(0)
  expect(batches).toHaveLength(beforeCompletion + 1)
  expect(singles).toHaveLength(0)
  expect(new Set(batches.at(-1)!.map((r) => JSON.stringify(r))).size).toBe(batches.at(-1)!.length)
  await diagnosticScreenshot(page, { path: `test-results/bulk-resources-completed-${width}x900.png` })
})
}

// Delayed completion orders are deterministic progression-inspection tests.
// This journey owns selected-body routing and the submitted command identity.
test('quick build submits for the selected planet after catalog navigation', async ({ page }) => {
  const fixture = await quickBuildFixture(page)
  await openQuickBuildCatalog(page)
  await withProgressionResponse(page,
    request => 'body' in request && request.body === id(6) && 'building' in request && request.building === 'MetalMine',
    () => selectBody(page, id(6)),
  )
  const build = page.getByRole('button', { name: 'Build Metal Mine level 2', exact: true })
  await expect(build).toBeEnabled()
  await build.click()
  await expect.poll(() => fixture.sent.length).toBe(1)
  expect(fixture.sent[0].command).toMatchObject({ body: id(6) })
  await expect(page).toHaveURL(new RegExp(`/b/${id(6)}/resources$`))
})

test('quick build stays disabled on inspection failure and keeps server rejection visible', async ({
  page,
}) => {
  const fixture = await quickBuildFixture(page)
  fixture.failOptions(true)
  fixture.reject()
  await withBootstrapResponse(page, () => page.goto(`/u/andromeda/b/${body.id}/resources`))
  const build = page.getByRole('button', {
    name: 'Build Metal Mine',
    exact: true,
  })
  await expect(build).toBeDisabled()
  await expect(build).toHaveAccessibleDescription(
    'Unable to inspect this action. Check your connection and try again.',
  )
  await build.evaluate((button) => (button as HTMLButtonElement).click())
  expect(fixture.sent).toHaveLength(0)
  await page
    .getByRole('link', { name: 'Upgrade Metal Mine', exact: true })
    .click()
  const retry = page.getByRole('button', { name: 'Retry', exact: true })
  await expect(retry).toBeEnabled()
  fixture.failOptions(false)
  await retry.click()
  await expect(
    page.getByRole('button', { name: 'Confirm upgrade' }),
  ).toBeEnabled()
  await page.getByRole('link', { name: /^Back to / }).click()
  await page.getByRole('button', { name: 'Build Metal Mine level 2' }).click()
  await expect(
    page.getByTestId('game-error-banner').getByRole('group', { name: 'Order status' }),
  ).toContainText(/resources/i)
  await expect(
    page.getByRole('button', { name: 'Build Metal Mine level 2' }),
  ).toBeEnabled()
  await expect(page).toHaveURL(/\/resources$/)
  expect(fixture.sent).toHaveLength(1)
})

// These tests exercise touch/keyboard activation, not initial network latency.
// Wait for the actual catalog response before asserting the hydrated control.
async function openQuickBuildCatalog(
  page: Page,
  catalog: 'resources' | 'facilities' = 'resources',
  building: S['BuildingId3'] = 'MetalMine',
) {
  await withProgressionResponse(
    page,
    request => 'building' in request && request.building === building,
    () => page.goto(`/u/andromeda/b/${body.id}/${catalog}`),
  )
}

test.describe('touch quick build', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } })
  test('tap the row for details and its ghost button to build', async ({
    page,
  }) => {
    const fixture = await quickBuildFixture(page)
    await openQuickBuildCatalog(page)
    const build = page.getByRole('button', { name: 'Build Metal Mine level 2' })
    await expect(build).toBeEnabled()
    await page
      .getByRole('link', { name: 'Upgrade Metal Mine', exact: true })
      .tap()
    await expect(
      page.getByRole('button', { name: 'Confirm upgrade' }),
    ).toBeEnabled()
    expect(fixture.sent).toHaveLength(0)
    await page.getByRole('link', { name: /^Back to / }).tap()
    await expect(build).toBeEnabled()
    await build.tap()
    await expect.poll(() => fixture.sent.length).toBe(1)
    await expect(page).toHaveURL(/\/resources$/)
  })
})

test('keyboard activation builds from the catalog', async ({ page }) => {
  const fixture = await quickBuildFixture(page)
  await openQuickBuildCatalog(page)
  const build = page.getByRole('button', { name: 'Build Metal Mine level 2' })
  await expect(build).toBeEnabled()
  await build.focus()
  await page.keyboard.press('Enter')
  await expect.poll(() => fixture.sent.length).toBe(1)
  await expect(page).toHaveURL(/\/resources$/)
})

test('active facility inspection follows its actual target after direct navigation', async ({ page }) => {
  await buildingFixture(page, true, 'ResearchLab')
  const inspection = page.waitForRequest(request => request.url().endsWith('/progression-options') && request.postDataJSON().request.building === 'ResearchLab')
  await page.goto(`/u/andromeda/b/${body.id}/facilities/research-lab`)
  expect((await inspection).postDataJSON().request.type).toBe('Upgrade')
  const active = page.getByRole('region', { name: 'Active construction', exact: true })
  await expect(active.getByRole('heading')).toHaveText('Upgrading to level 1')
  await expect(active.getByRole('button', { name: 'Cancel construction', exact: true })).toBeEnabled()
  await expect(active.getByText('Completion forecast unavailable.', { exact: true })).toHaveCount(0)
})
