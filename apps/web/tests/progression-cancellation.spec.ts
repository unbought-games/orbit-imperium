import { expect, test, type Page } from '@playwright/test'
import type { components } from '../src/contracts'
import { binding, body, id, refreshGame, shellFixture } from './fixtures/game'

type S = components['schemas']
const titles = [
  'Metal Mine',
  'Crystal Mine',
  'Deuterium Synthesizer',
  'Solar Plant',
]
const siblings = ['MetalMine', 'DeuteriumSynthesizer', 'SolarPlant']
const now = Date.now()

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
  await shellFixture(page, {
    protocol: 4,
    bodies: [planet],
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
  await page.route('**/progression-options', async (route) => {
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
      terms_hash: 'b'.repeat(64),
      blockers,
      estimates: null,
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
  await page.goto(`/u/${binding.universe}/b/${body.id}/resources`)
  // The six inactive building tiles each load cost inputs before cancellation.
  await expect.poll(() => inspections.filter((x) => x.delivered).length).toBe(6)
  await page
    .getByRole('button', { name: 'Upgrade Crystal Mine', exact: true })
    .click()
  const pane = page.getByRole('region', { name: 'Progression quote' })
  const cancel = pane.getByRole('button', {
    name: 'Cancel construction',
    exact: true,
  })
  const quick = (title: string) =>
    page.getByRole('button', { name: `Start upgrade ${title}`, exact: true })
  async function startCancellation() {
    cancelling = true
    await cancel.click()
    await expect(cancel).toBeDisabled()
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
    // Unlike its siblings, the canceled tile must wait for confirmed progress to clear.
    expect(
      inspections.some(
        (x) => x.duringCancellation && x.building === 'CrystalMine',
      ),
    ).toBe(false)
    await expect(
      page.getByRole('button', { name: /^Start upgrade / }),
    ).toHaveCount(0)
  }
  return {
    planet,
    inspections,
    pane,
    cancel,
    quick,
    startCancellation,
    commandGate,
    optionsGate,
  }
}

for (const width of [390, 1440]) {
  for (const lateOptions of [false, true]) {
    test(`cancellation restores eligible arrows at ${width}px with old options delivered ${lateOptions ? 'after' : 'before'} confirmation`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      const fixture = await cancellationFixture(page, lateOptions)
      const {
        planet,
        inspections,
        pane,
        cancel,
        quick,
        commandGate,
        optionsGate,
      } = fixture
      try {
        await fixture.startCancellation()
        commandGate.resolve('Committed')
        await expect(cancel).toHaveCount(0)
        await pane.getByRole('button', { name: 'Dismiss quote' }).click()
        for (const title of titles) await expect(quick(title)).toBeVisible()
        optionsGate.resolve()
        await expect
          .poll(() =>
            inspections
              .filter((x) => x.duringCancellation)
              .every((x) => x.delivered),
          )
          .toBe(true)
        // Consume late responses and another snapshot without losing the fresh eligibility.
        await refreshGame(page)
        for (const title of titles) await expect(quick(title)).toBeVisible()
        await expect(quick('Metal Storage')).toHaveCount(0)
        await expect(quick('Deuterium Tank')).toHaveCount(0)
        await expect(quick('Fusion Reactor')).toHaveCount(0)
        const requestCount = inspections.length
        planet.amounts.metal = '89999999'
        await refreshGame(page)
        await expect(quick('Metal Mine')).toHaveCount(0)
        planet.amounts.metal = '90000000'
        await refreshGame(page)
        await expect(quick('Metal Mine')).toBeVisible()
        expect(inspections).toHaveLength(requestCount)
        await expect(quick('Deuterium Tank')).toHaveCount(0)
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
        await quick('Metal Mine').click()
        await expect
          .poll(() => started)
          .toEqual({
            type: 'StartUpgrade',
            body: body.id,
            building: 'MetalMine',
            expected_terms_hash: 'b'.repeat(64),
          })
      } finally {
        commandGate.resolve('Rejected')
        optionsGate.resolve()
      }
    })
  }
}

test('rejected cancellation keeps construction active and every upgrade blocked', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 })
  const fixture = await cancellationFixture(page)
  try {
    await fixture.startCancellation()
    fixture.commandGate.resolve('Rejected')
    await expect(fixture.cancel).toBeEnabled()
    await expect(
      fixture.pane.getByRole('region', { name: 'Active construction' }),
    ).toContainText('Upgrading Crystal Mine')
    await refreshGame(page)
    await expect(
      page.getByRole('button', { name: /^Start upgrade / }),
    ).toHaveCount(0)
    await expect(
      page
        .getByRole('button', { name: 'Upgrade Crystal Mine', exact: true })
        .getByLabel('Construction progress'),
    ).toBeVisible()
  } finally {
    fixture.commandGate.resolve('Rejected')
    fixture.optionsGate.resolve()
  }
})
