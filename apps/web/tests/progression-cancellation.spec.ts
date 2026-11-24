import { routeProgressionOptions } from './fixtures/progression-options'
import { productionFixture } from '../src/test-support/production'
import { confirmCancellation } from './fixtures/confirmation'
import { expect, test, type Page } from './fixtures/test'
import type { components } from '../src/contracts'
import { binding, body, id, refreshGame, shellFixture } from './fixtures/game'
import {
  withBootstrapResponse,
  withProgressionResponse,
} from './fixtures/responses'

type S = components['schemas']
const titles = [
  'Metal Mine',
  'Crystal Mine',
  'Deuterium Synthesizer',
  'Solar Plant',
]
const siblings = ['MetalMine', 'DeuteriumSynthesizer', 'SolarPlant']
const now = Date.now()

function upgradeFor(building: S['BuildingId3']) {
  return (request: S['QuoteRequest3']) =>
    request.type === 'Upgrade' &&
    request.body === body.id &&
    request.building === building
}

async function cancellationFixture(page: Page, lateOptions = false) {
  await page.clock.setFixedTime(now)
  const planet = structuredClone(body)
  planet.amounts = {
    metal: '1000000000',
    crystal: '1000000000',
    deuterium: '1000000000',
  }
  const paid = { metal: '76000000', crystal: '38000000', deuterium: '0' }
  const constructions: S['Construction3'][] = [
    {
      id: id(10),
      body: body.id,
      building: 'CrystalMine',
      target_level: 2,
      due_at: now + 760000,
      paid,
    },
  ]
  const bootstrap = page.waitForResponse((r) =>
    r.url().endsWith('/api/v1/bootstrap'),
  )
  const production = productionFixture(planet)
  production.settings.crystal_mine = 50
  await shellFixture(page, {
    protocol: 4,
    bodies: [planet],
    // Keep refund and one-micro-unit affordability assertions independent of income.
    production: [
      {
        ...production,
        gross_per_hour: { metal: '0', crystal: '0', deuterium: '0' },
      },
    ],
    constructions,
    catalog: [
      {
        key: { kind: 'Building', id: 'DeuteriumTank' },
        enabled: true,
        mobile: false,
        body_kinds: ['Planet'],
        requirements: [
          { type: 'PlayerResearch', research: 'EnergyTechnology', level: 3 },
        ],
      },
    ],
  })
  const baseline: S['BoundView4'] = (await (await bootstrap).json()).result.game
    .snapshot.view
  let revision = '1'
  await page.route('**/overview', (route) =>
    route.fulfill({
      json: {
        ...baseline,
        request_id: route.request().postDataJSON().request_id,
        viewer_revision: revision,
        sampled_at: Date.now(),
        as_of_ms: Date.now(),
        bodies: [planet],
        constructions,
      },
    }),
  )
  const commandGate = Promise.withResolvers<'Committed' | 'Rejected'>()
  const optionsGate = Promise.withResolvers<void>()
  const inspections: {
    building: string
    revision: string
    duringCancellation: boolean
    delivered: boolean
  }[] = []
  let cancelling = false
  await routeProgressionOptions(page, async (route) => {
    const { context, request } = route.request().postDataJSON()
    const building = request.building as keyof typeof planet.levels
    const level = planet.levels[building]!
    const cost =
      building === 'CrystalMine'
        ? paid
        : {
            metal: building.endsWith('Storage') ? '2000000000' : '90000000',
            crystal: '22000000',
            deuterium: '0',
          }
    const blockers: S['ProgressionBlocker'][] = []
    if (constructions.length)
      blockers.push({
        code: 'ActiveConstruction',
        requirement: null,
        required: null,
        actual: null,
        resource: null,
        unit: null,
      })
    if (building === 'DeuteriumTank')
      blockers.push({
        code: 'PrerequisiteMissing',
        requirement: {
          type: 'PlayerResearch',
          research: 'EnergyTechnology',
          level: 3,
        },
        required: '3',
        actual: '0',
        resource: null,
        unit: 'Level',
      })
    const inspection = {
      building,
      revision,
      duringCancellation: cancelling && revision === '1',
      delivered: false,
    }
    inspections.push(inspection)
    // Capture old server facts before holding the response. A newer inspection
    // can complete first when cancellation is confirmed while this is in flight.
    const response: S['BoundProgressionOptions4'] = {
      protocol: 4,
      binding,
      request_id: context.request_id,
      viewer_revision: revision,
      sampled_at: now,
      as_of_ms: now,
      request,
      terms: {
        type: 'Building',
        profile_hash: 'a'.repeat(64),
        body: body.id,
        building,
        action: request.type,
        source_level: level,
        target_level: level + 1,
        paid: cost,
        duration_ms: 76000,
        formula: 'BuildingRedesign2011',
        facilities: [],
        required_energy: '0',
        reserve_fields: 1,
      },
      terms_hash: (revision === '1' ? 'b' : 'c').repeat(64),
      blockers,
      estimates: null,
      building_energy:
        building === 'CrystalMine'
          ? { current_consumption: '11000000', target_consumption: '24200000' }
          : undefined,
    }
    if (lateOptions && inspection.duringCancellation) await optionsGate.promise
    await route.fulfill({ json: response })
    inspection.delivered = true
  })
  await page.route('**/commands', async (route) => {
    const envelope: S['CommandEnvelopeV4'] = route
      .request()
      .postDataJSON().gameplay
    expect(envelope.command).toEqual({
      type: 'CancelConstruction',
      operation: id(10),
    })
    const status = await commandGate.promise
    if (status === 'Committed') {
      constructions.length = 0
      planet.fields_reserved = 0
      for (const name of ['metal', 'crystal', 'deuterium'] as const)
        planet.amounts[name] = (
          BigInt(planet.amounts[name]) + BigInt(paid[name])
        ).toString()
      revision = '2'
    }
    await route.fulfill({
      json: {
        protocol: 4,
        binding,
        command_id: envelope.command_id,
        admitted_at: now,
        executed_at: now,
        status,
        ...(status === 'Committed'
          ? { result_ids: [], minimum_viewer_revision: revision }
          : { code: 'OperationNotActive' }),
      },
    })
  })
  await withProgressionResponse(page, upgradeFor('CrystalMine'), () =>
    withBootstrapResponse(page, () =>
      page.goto(`/u/andromeda/b/${body.id}/resources`),
    ),
  )
  const crystalMine = page.getByRole('link', {
    name: 'Upgrade Crystal Mine',
    exact: true,
  })
  async function expectActiveMinePreview() {
    const progress = crystalMine.getByRole('group', {
      name: 'Construction progress',
    })
    await expect(progress.getByLabel('Target level 2')).toBeVisible()
    await expect(crystalMine.getByText('6', { exact: true })).toBeVisible()
    await expect(crystalMine).toHaveAccessibleDescription(
      /Next level draws 6 more energy/,
    )
    await expect(crystalMine).not.toHaveAccessibleDescription(
      /Next level costs/,
    )
    await expect(crystalMine.getByText(/^(76|38)$/)).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: /^Build Crystal Mine\b/ }),
    ).toHaveCount(0)
  }
  await expectActiveMinePreview()
  // The active mine can inspect energy demand. Locked buildings still skip inspection.
  await expect
    .poll(() =>
      inspections
        .filter((x) => x.delivered)
        .map((x) => x.building)
        .sort(),
    )
    .toEqual([
      'CrystalMine',
      'CrystalStorage',
      'DeuteriumSynthesizer',
      'MetalMine',
      'MetalStorage',
      'SolarPlant',
    ])
  await crystalMine.click()
  const pane = page.getByRole('region', { name: 'Progression quote' })
  const cancel = pane.getByRole('button', {
    name: 'Cancel construction',
    exact: true,
  })
  async function returnToCatalog() {
    await pane.getByRole('link', { name: /^Back to / }).click()
  }
  async function openInspector(title: string) {
    await page
      .getByRole('link', { name: `Upgrade ${title}`, exact: true })
      .click()
    return pane.getByRole('button', { name: 'Confirm upgrade', exact: true })
  }
  async function inspect(title: string) {
    await returnToCatalog()
    return openInspector(title)
  }
  async function startCancellation() {
    cancelling = true
    await cancel.click()
    await confirmCancellation(page)
    await expect(cancel).toBeDisabled()
    await expect(page.locator('[data-catalog-item]')).toHaveCount(0)
    await withProgressionResponse(
      page,
      upgradeFor('MetalMine'),
      returnToCatalog,
    )
    // The energy preview cannot enable quick build while cancellation is pending.
    await expectActiveMinePreview()
    await expect(
      page.getByRole('link', { name: 'Upgrade Metal Mine', exact: true }),
    ).toHaveAccessibleDescription(/Next level costs 90 Metal 22 Crystal/)
    const metalQuickBuild = page.getByRole('button', {
      name: 'Build Metal Mine',
      exact: true,
    })
    await expect(metalQuickBuild).toBeDisabled()
    await expect(metalQuickBuild).toHaveAttribute(
      'title',
      'Construction already in progress',
    )
    await expect(
      page
        .getByRole('button', { name: /^Build / })
        .and(page.locator(':enabled')),
    ).toHaveCount(0)
    for (const [index, title] of titles
      .filter((title) => title !== 'Crystal Mine')
      .entries()) {
      if (index > 0) await returnToCatalog()
      await openInspector(title)
      if (!lateOptions)
        await expect(pane.getByLabel('Action blockers')).toContainText(
          'Active Construction',
        )
    }
    await expect
      .poll(() =>
        siblings.every((building) =>
          inspections.some(
            (x) =>
              x.duringCancellation &&
              x.building === building &&
              (lateOptions || x.delivered),
          ),
        ),
      )
      .toBe(true)
    await inspect('Crystal Mine')
    await expect(cancel).toBeDisabled()
    const upgrade = await inspect('Metal Mine')
    await expect(pane.getByLabel('Action blockers')).toContainText(
      'Active Construction',
    )
    await expect(upgrade).toBeDisabled()
    return upgrade
  }
  return {
    planet,
    inspections,
    startCancellation,
    commandGate,
    optionsGate,
  }
}

// Response order permutations are deterministic in progression-inspection.test.ts.
// Keep one application cancellation-to-next-command wiring journey.
for (const width of [390]) {
  for (const lateOptions of [false]) {
    test(`cancellation restores eligible detail actions at ${width}px with old options delivered ${lateOptions ? 'after' : 'before'} confirmation`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      const fixture = await cancellationFixture(page, lateOptions)
      const { planet, inspections, commandGate, optionsGate } = fixture
      try {
        const upgrade = await fixture.startCancellation()
        await withProgressionResponse(
          page,
          upgradeFor('MetalMine'),
          async () => {
            commandGate.resolve('Committed')
          },
        )
        await expect(upgrade).toBeEnabled()
        optionsGate.resolve()
        await expect
          .poll(() =>
            inspections
              .filter((x) => x.duringCancellation)
              .every((x) => x.delivered),
          )
          .toBe(true)
        // Keep the inspector mounted so a remount cannot supply a new quote.
        const requestCount = inspections.length
        planet.amounts.metal = '89999999'
        await refreshGame(page)
        await expect(upgrade).toBeDisabled()
        planet.amounts.metal = '90000000'
        await refreshGame(page)
        await expect(upgrade).toBeEnabled()
        expect(inspections).toHaveLength(requestCount)
        let started: S['CommandEnvelopeV4']['command'] | null = null
        await page.route('**/commands', async (route) => {
          const envelope = route.request().postDataJSON().gameplay
          started = envelope.command
          await route.fulfill({
            json: {
              protocol: 4,
              binding,
              command_id: envelope.command_id,
              admitted_at: now,
              executed_at: null,
              status: 'Pending',
            },
          })
        })
        await upgrade.click()
        await expect
          .poll(() => started)
          .toEqual({
            type: 'StartUpgrade',
            body: body.id,
            building: 'MetalMine',
            expected_terms_hash: 'c'.repeat(64),
          })
      } finally {
        commandGate.resolve('Rejected')
        optionsGate.resolve()
      }
    })
  }
}
