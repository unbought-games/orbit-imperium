import { selectBody } from './fixtures/body-selector'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { setDestination } from './fixtures/coordinates'
import { test, expect } from './fixtures/test'
import { shellFixture, body, binding, id, refreshGame } from './fixtures/game'
import { readFileSync } from 'node:fs'
import type { components } from '../src/contracts'
type S = components['schemas']
const item = { kind: 'Ship', id: 'HeavyFighter' } as const
const catalog = JSON.parse(
  readFileSync(
    new URL('../../../rules/mvp-v1-slice-7.json', import.meta.url),
    'utf8',
  ),
).catalog as S['CatalogEntry3'][]
const bound = (request_id: string, data: unknown) => ({
  protocol: 4,
  binding,
  request_id,
  viewer_revision: '1',
  sampled_at: Date.now(),
  as_of_ms: Date.now(),
  data,
})

async function setup(
  page: Parameters<typeof shellFixture>[0],
  impulse = 2,
  options: Parameters<typeof shellFixture>[1] = {},
) {
  const planet = {
    ...body,
    amounts: {
      metal: '30000000000',
      crystal: '20000000000',
      deuterium: '10000000000',
    },
    levels: { ...body.levels, Shipyard: 3, RoboticsFactory: 2, ResearchLab: 2 },
    inventories: [{ item, count: '2' }],
  }
  await shellFixture(page, {
    protocol: 4,
    bodies: [planet],
    catalog,
    research: [
      { research: 'ArmourTechnology', level: 2 },
      { research: 'ImpulseDrive', level: impulse },
      { research: 'EnergyTechnology', level: 1 },
    ],
    extraCapabilities: ['Attack'],
    ...options,
    missions: {
      fleets: [],
      incoming: [],
      score_value_micro: '0',
      fleet_slots: '1',
    },
  })
  await page.route('**/progression-options', async (route) => {
    const { context, request } = route.request().postDataJSON()
    const heavy =
      request.type === 'Manufacture' && request.item.id === 'HeavyFighter'
    const cost = { metal: '6000000000', crystal: '4000000000', deuterium: '0' }
    await route.fulfill({
      json: {
        protocol: 4,
        binding,
        request_id: context.request_id,
        viewer_revision: '1',
        sampled_at: Date.now(),
        as_of_ms: Date.now(),
        request,
        terms: heavy
          ? {
              type: 'Manufacture',
              profile_hash: 'a'.repeat(64),
              body: request.body,
              item,
              quantity: request.quantity,
              unit_cost: cost,
              paid: Object.fromEntries(
                Object.entries(cost).map(([k, v]) => [
                  k,
                  (BigInt(v) * BigInt(request.quantity)).toString(),
                ]),
              ),
              unit_duration_ms: 3600000,
              formula: 'ManufactureClassic',
              facilities: [
                { building: 'Shipyard', level: 3 },
                { building: 'NaniteFactory', level: 0 },
              ],
            }
          : null,
        terms_hash: heavy ? 'b'.repeat(64) : null,
        blockers: !heavy
          ? [
              {
                code: 'UnavailableContent',
                requirement: null,
                required: null,
                actual: null,
                resource: null,
                unit: null,
              },
            ]
          : impulse < 2
            ? [
                {
                  code: 'PrerequisiteMissing',
                  requirement: {
                    type: 'PlayerResearch',
                    research: 'ImpulseDrive',
                    level: 2,
                  },
                  required: '2',
                  actual: String(impulse),
                  resource: null,
                  unit: 'Level',
                },
              ]
            : [],
        estimates: null,
      },
    })
  })
}

test('Heavy Fighter exposes its missing Impulse Drive prerequisite', async ({
  page,
}) => {
  await setup(page, 1)
  await page.goto(`/u/andromeda/b/${body.id}/shipyard`)
  await page
    .getByRole('link', { name: 'Build Heavy Fighter', exact: true })
    .click()
  const pane = page.getByRole('region', { name: 'Progression quote' })
  await expect(pane).toContainText('Impulse Drive')
  await expect(
    pane.getByRole('button', { name: 'Build', exact: true }),
  ).toBeDisabled()
  await expect(pane.getByLabel('Action blockers')).toContainText(
    'Impulse Drive',
  )
})

test('Heavy Fighter submits the selected build quantity', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await setup(page)
  const pane = page.getByRole('region', { name: 'Progression quote' })
  let sent: unknown = null
  await page.route('**/commands', async (route) => {
    const pair = route.request().postDataJSON()
    sent = pair.gameplay.command
    await route.fulfill({
      json: {
        protocol: 4,
        binding,
        command_id: pair.gameplay.command_id,
        admitted_at: Date.now(),
        executed_at: Date.now(),
        status: 'Committed',
        result_ids: [id(80)],
        minimum_viewer_revision: '1',
      },
    })
  })
  await page.goto(`/u/andromeda/b/${body.id}/shipyard`)
  await page
    .getByRole('link', { name: 'Build Heavy Fighter', exact: true })
    .click()
  await expect(pane).toContainText('An impulse-powered combat ship')
  await expect(pane.locator('img').first()).toHaveAttribute(
    'src',
    /heavy-fighter/,
  )
  await page.getByLabel('Shipyard quantity').fill('2')
  await expect(
    pane.getByRole('button', { name: 'Metal details' }),
  ).toContainText('12,000')
  await expect(
    pane.getByRole('button', { name: 'Crystal details' }),
  ).toContainText('8,000')
  await pane.getByRole('button', { name: 'Build', exact: true }).click()
  await expect
    .poll(() => sent)
    .toMatchObject({
      type: 'StartManufacture',
      body: body.id,
      item,
      quantity: '2',
    })
  const toast = page.getByLabel('Recent game events').getByRole('button', { name: /Shipyard order accepted/ })
  await expect(toast).toContainText('12,000')
  await expect(toast).toContainText('8,000')
  await expect(page.getByTestId('command-orb')).toHaveAttribute('data-tone', 'green')
  await diagnosticScreenshot(page, { path: 'test-results/live-hud/shipyard-390x844.png' })
})

test('Heavy Fighters can be selected, quoted and launched in an attack fleet', async ({
  page,
}) => {
  await setup(page)
  const target = {
    type: 'Body',
    id: id(90),
    expected_kind: 'Planet',
    expected_owner: id(91),
  }
  await page.route('**/world', async (route) => {
    const request = route.request().postDataJSON()
    await route.fulfill({
      json: bound(
        request.context.request_id,
        request.type === 'ResolveDestination'
          ? target
          : {
              intent: request.intent,
              profile_hash: 'a'.repeat(64),
              terms_hash: 'b'.repeat(64),
              distance: 1005,
              speeds: [['HeavyFighter', '14000']],
              duration_ms: 360000,
              fuel: '20000000',
              capacity: '200000000',
              maximum_payload: '180000000',
              slot_limit: '1',
            },
      ),
    })
  })
  let sent: unknown = null
  await page.route('**/commands', async (route) => {
    const pair = route.request().postDataJSON()
    sent = pair.gameplay.command
    await route.fulfill({
      json: {
        protocol: 4,
        binding,
        command_id: pair.gameplay.command_id,
        admitted_at: Date.now(),
        executed_at: Date.now(),
        status: 'Committed',
        result_ids: [id(80)],
        minimum_viewer_revision: '1',
      },
    })
  })
  await page.goto(`/u/andromeda/b/${body.id}/dispatch`)
  await page
    .getByRole('radio', { name: 'Attack', exact: true }).check()
  await setDestination(page, { position: '8' })
  await page
    .getByRole('textbox', { name: 'Heavy Fighter · 2 available' })
    .fill('2')
  await page.getByRole('button', { name: 'Review fleet', exact: true }).click()
  const quote = page.getByRole('region', { name: 'Fleet quote' })
  await expect(quote.getByRole('list', { name: 'Ship composition' }).getByRole('listitem')).toHaveText(['Heavy Fighter 2'])
  await quote.getByRole('button', { name: /^Attack with / }).click()
  await expect
    .poll(() => sent)
    .toMatchObject({
      type: 'World',
      action: {
        type: 'LaunchFleet',
        intent: {
          mission: 'Attack',
          ships: [
            { owner: binding.player, ship_type: 'HeavyFighter', count: '2' },
          ],
        },
      },
    })
})

for (const width of [390, 1440]) {
  test(`manufacturing crosses the live affordability threshold at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    const now = Date.now()
    await page.clock.install({ time: now })
    await page.clock.pauseAt(now)
    const planet = structuredClone(body)
    planet.amounts = {
      metal: '17999000000',
      crystal: '12000000000',
      deuterium: '0',
    }
    planet.capacity = {
      metal: '30000000000',
      crystal: '30000000000',
      deuterium: '0',
    }
    await setup(page, 2, {
      bodies: [planet],
      sampledAt: now,
      production: [
        {
          body: body.id,
          settings_revision: '1',
          editable: ['metal_mine'],
          settings: {
            metal_mine: 100,
            crystal_mine: 100,
            deuterium_synthesizer: 100,
            solar_plant: 100,
            fusion_reactor: 100,
            solar_satellite: 100,
          },
          gross_per_hour: { metal: '3600000000', crystal: '0', deuterium: '0' },
          fuel_deuterium_per_hour: '0',
          net_deuterium_per_hour: { sign: 'Nonnegative', magnitude: '0' },
          energy_supply: '100',
          energy_demand: '0',
          utilization: '1000000',
          fuel_utilization: '1000000',
        },
      ],
    })
    let sent = 0
    await page.route('**/commands', async (route) => {
      const pair = route.request().postDataJSON()
      sent++
      await route.fulfill({
        json: {
          protocol: 4,
          binding,
          command_id: pair.gameplay.command_id,
          admitted_at: now + 1000,
          executed_at: now + 1000,
          status: 'Committed',
          result_ids: [id(80)],
          minimum_viewer_revision: '1',
        },
      })
    })
    await page.goto(`/u/andromeda/b/${body.id}/shipyard/heavy-fighter`)
    const pane = page.getByRole('region', { name: 'Progression quote' })
    const build = pane.getByRole('button', { name: 'Build', exact: true })
    await page.getByLabel('Shipyard quantity').fill('3')
    await expect(build).toBeDisabled()
    await expect(pane.getByLabel('Missing resources')).toContainText(
      /Missing\s*1/,
    )
    await pane.getByLabel('Missing resources').scrollIntoViewIfNeeded()
    await diagnosticScreenshot(page, {
      path: `test-results/manufacturing-shortfall-${width}.png`,
    })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    // No overview refresh: the stored balance remains below the three-unit cost.
    await page.clock.runFor(1000)
    await expect(build).toBeEnabled()
    await expect(pane.getByLabel('Missing resources')).toHaveCount(0)
    await build.click()
    await expect.poll(() => sent).toBe(1)
    await expect(pane.getByLabel('Latest action result')).toContainText(
      'Order confirmed',
    )
    await expect(page.getByLabel('Shipyard quantity')).toHaveValue('0')
    await page.getByLabel('Shipyard quantity').fill('3')
    await expect(build).toBeDisabled()
    await expect(pane.getByLabel('Latest action result')).toContainText(
      '3 × Heavy Fighter',
    )
    await expect(pane).not.toContainText(
      'Unable to build: Insufficient Resources',
    )
  })
}

test('concurrent spending during validation recovers without a stale affordability error', async ({
  page,
}) => {
  const planet = structuredClone(body)
  planet.amounts = {
    metal: '18000000000',
    crystal: '12000000000',
    deuterium: '0',
  }
  await setup(page, 2, { bodies: [planet] })
  await page.goto(`/u/andromeda/b/${body.id}/shipyard/heavy-fighter`)
  const pane = page.getByRole('region', { name: 'Progression quote' })
  const build = pane.getByRole('button', { name: 'Build', exact: true })
  await page.getByLabel('Shipyard quantity').fill('3')
  await expect(build).toBeEnabled()
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let requested = false
  await page.route('**/progression-options', async (route) => {
    requested = true
    await gate
    await route.fallback()
  })
  try {
    await build.click()
    await expect.poll(() => requested).toBe(true)
    planet.amounts.metal = '17999999999'
    await refreshGame(page)
    await expect(pane.getByLabel('Missing resources')).toContainText(
      /Missing\s*1/,
    )
    release()
    await expect(build).not.toHaveText('Confirming')
    await expect(build).toBeDisabled()
    planet.amounts.metal = '18000000000'
    await refreshGame(page)
    await expect(build).toBeEnabled()
    await expect(pane).not.toContainText(
      'Unable to build: Insufficient Resources',
    )
    await page.getByLabel('Shipyard quantity').fill('4')
    await expect(build).toBeDisabled()
    await page.getByLabel('Shipyard quantity').fill('2')
    await expect(build).toBeEnabled()
    await expect(pane.getByLabel('Missing resources')).toHaveCount(0)
  } finally {
    release()
  }
})

test('manufacturing affordability follows the selected planet', async ({
  page,
}) => {
  const rich = structuredClone(body)
  rich.amounts = {
    metal: '18000000000',
    crystal: '12000000000',
    deuterium: '0',
  }
  const poor = {
    ...structuredClone(rich),
    id: id(6),
    coordinates: { galaxy: 1, system: 2, position: 3 },
    amounts: { ...rich.amounts, metal: '17999999999' },
  }
  await setup(page, 2, { bodies: [rich, poor] })
  await page.goto(`/u/andromeda/b/${body.id}/shipyard/heavy-fighter`)
  const pane = page.getByRole('region', { name: 'Progression quote' })
  const build = pane.getByRole('button', { name: 'Build', exact: true })
  await page.getByLabel('Shipyard quantity').fill('3')
  await expect(build).toBeEnabled()
  await selectBody(page, poor.id)
  await page.getByLabel('Shipyard quantity').fill('3')
  await expect(build).toBeDisabled()
  await expect(pane.getByLabel('Missing resources')).toContainText(
    /Missing\s*1/,
  )
  await selectBody(page, rich.id)
  await page.getByLabel('Shipyard quantity').fill('3')
  await expect(build).toBeEnabled()
  await expect(pane.getByLabel('Missing resources')).toHaveCount(0)
})
