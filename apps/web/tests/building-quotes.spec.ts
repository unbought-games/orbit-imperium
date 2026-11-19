import {
  withFixtureResponse,
  withProgressionResponse,
} from './fixtures/responses'
import { routeProgressionOptions } from './fixtures/progression-options'
import { productionFixture } from '../src/test-support/production'
import { selectBody } from './fixtures/body-selector'
import { expect, test, type Page } from './fixtures/test'
import type { components } from '../src/contracts'
import { binding, body, id, installGameFixture } from './fixtures/game'

type S = components['schemas']
const now = Date.now()

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
  let revision = 1
  await installGameFixture(page, {
    bodies: planets,
    // Balance changes in these tests are explicit, including one-micro-unit shortages.
    production: planets.map((planet) => ({
      ...productionFixture(planet),
      gross_per_hour: { metal: '0', crystal: '0', deuterium: '0' },
    })),
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
      blockers: [],
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
    await route.fulfill({ json: quote })
  })
  await page.route('**/commands', async (route) => {
    const envelope: S['CommandEnvelopeV3'] = route.request().postDataJSON()
    sent.push(envelope)
    if (envelope.command.type !== 'StartUpgrade')
      throw Error('Expected a selected-body upgrade')
    const command = envelope.command
    constructions.push({
      id: id(90),
      body: envelope.command.body,
      building: envelope.command.building,
      target_level:
        planets.find((p) => p.id === command.body)!.levels[command.building]! +
        1,
      due_at: now + 60000,
      paid: { metal: '60000000', crystal: '15000000', deuterium: '0' },
    })
    revision++
    await route.fulfill({
      json: {
        protocol: 3,
        binding,
        command_id: envelope.command_id,
        admitted_at: now,
        executed_at: now,
        status: 'Committed',
        result_ids: [id(90)],
        minimum_viewer_revision: String(revision),
      },
    })
  })
  return { planets, sent }
}

// Delayed completion orders are deterministic progression-inspection tests.
// This journey owns selected-body routing and the submitted command identity.
test('quick build submits for the selected planet after catalog navigation', async ({
  page,
}) => {
  const fixture = await quickBuildFixture(page)
  const [home, colony] = fixture.planets
  home.fields_reserved = 0
  colony.levels.CrystalMine = 2
  colony.fields_used = 4
  colony.fields = 218
  colony.fields_reserved = 0
  await openQuickBuildCatalog(page)
  const catalog = page.getByRole('region', { name: 'Resource buildings' })
  await expect(
    catalog.getByRole('button', { name: '3 of 163 fields used', exact: true }),
  ).toHaveText('3/163')
  await withProgressionResponse(
    page,
    (request) =>
      'body' in request &&
      request.body === id(6) &&
      'building' in request &&
      request.building === 'MetalMine',
    () => selectBody(page, id(6)),
  )
  await expect(
    catalog.getByRole('button', { name: '4 of 218 fields used', exact: true }),
  ).toHaveText('4/218')
  const build = page.getByRole('button', {
    name: 'Build Metal Mine level 2',
    exact: true,
  })
  await expect(build).toBeEnabled()
  await withFixtureResponse(
    page,
    (r) =>
      r.request().method() === 'POST' &&
      new URL(r.url()).pathname.endsWith('/commands') &&
      r.request().postDataJSON().command?.body === colony.id,
    () => build.click(),
  )
  await expect.poll(() => fixture.sent.length).toBe(1)
  expect(fixture.sent[0].command).toMatchObject({ body: id(6) })
  await expect(page).toHaveURL(new RegExp(`/b/${id(6)}/resources$`))
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
    (request) => 'building' in request && request.building === building,
    () => page.goto(`/u/andromeda/b/${body.id}/${catalog}`),
  )
}
