import { routeProgressionOptions } from './fixtures/progression-options'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { selectBody } from './fixtures/body-selector'
import { test, expect } from './fixtures/test'
import { shellFixture, body, binding, id, refreshGame } from './fixtures/game'
import { readFileSync } from 'node:fs'
import type { components } from '../src/contracts'
import { withBootstrapResponse, withFixtureResponse, withProgressionResponse } from './fixtures/responses'
type S = components['schemas']
const item = { kind: 'Ship', id: 'SolarSatellite' } as const
const catalog = JSON.parse(
  readFileSync(
    new URL('../../../rules/mvp-v1-solar-satellite.json', import.meta.url),
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
  shipyard = 1,
  options: Parameters<typeof shellFixture>[1] = {},
) {
  const planet = {
    ...body,
    amounts: {
      metal: '30000000000',
      crystal: '20000000000',
      deuterium: '10000000000',
    },
    levels: {
      ...body.levels,
      Shipyard: shipyard,
      RoboticsFactory: 2,
      ResearchLab: 2,
    },
    inventories: [{ item, count: '2' }],
  }
  const production: S['ProductionDto'] = {
    body: body.id,
    settings: {
      metal_mine: 100,
      crystal_mine: 100,
      deuterium_synthesizer: 100,
      solar_plant: 100,
      fusion_reactor: 100,
      solar_satellite: 100,
    },
    settings_revision: '0',
    editable: [
      'metal_mine',
      'crystal_mine',
      'deuterium_synthesizer',
      'solar_plant',
      'solar_satellite',
    ],
    gross_per_hour: {
      metal: '63000000',
      crystal: '37000000',
      deuterium: '0',
    },
    fuel_deuterium_per_hour: '0',
    net_deuterium_per_hour: { sign: 'Nonnegative', magnitude: '0' },
    energy_supply: '60000000',
    energy_demand: '22000000',
    utilization: '1000000',
    fuel_utilization: '1000000',
    solar_satellite: { unit_energy: '30000000', energy_supply: '60000000' },
  }
  await shellFixture(page, {
    protocol: 4,
    bodies: [planet],
    catalog: catalog.map((e) =>
      e.key.id === 'SolarSatellite'
        ? {
            ...e,
            ship_statistics: {
              propulsion: null,
              combat: {
                hull_ticks: '20000000',
                attack_ticks: '100000',
                shield_ticks: '100000',
                rapid_fire_against: [],
                rapid_fire_from: [],
              },
            },
          }
        : e,
    ),
    production: [production],
    viewerRevision: () =>
      (BigInt(production.settings_revision) + 1n).toString(),
    research: [
      { research: 'ArmourTechnology', level: 2 },
      { research: 'ImpulseDrive', level: 0 },
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
  await routeProgressionOptions(page, async (route) => {
    const { context, request } = route.request().postDataJSON()
    const satellite =
      request.type === 'Manufacture' && request.item.id === 'SolarSatellite'
    const cost = { metal: '0', crystal: '2000000000', deuterium: '500000000' }
    await route.fulfill({
      json: {
        protocol: 4,
        binding,
        request_id: context.request_id,
        viewer_revision: '1',
        sampled_at: Date.now(),
        as_of_ms: Date.now(),
        request,
        terms: satellite
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
              unit_duration_ms: 144000,
              formula: 'ManufactureClassic',
              facilities: [
                { building: 'Shipyard', level: 1 },
                { building: 'NaniteFactory', level: 0 },
              ],
            }
          : null,
        terms_hash: satellite ? 'b'.repeat(64) : null,
        blockers: !satellite
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
          : shipyard < 1
            ? [
                {
                  code: 'PrerequisiteMissing',
                  requirement: {
                    type: 'BodyBuilding',
                    building: 'Shipyard',
                    level: 1,
                  },
                  required: '1',
                  actual: String(shipyard),
                  resource: null,
                  unit: 'Level',
                },
              ]
            : [],
        estimates: null,
      },
    })
  })
  return production
}

const unitInspection = (selectedBody: string) => (request: S['QuoteRequest3']) =>
  request.type === 'Manufacture' && request.body === selectedBody &&
  request.item.id === item.id && request.quantity === '1'

test('satellites require Shipyard 1 and show stationary statistics and local energy', async ({
  page,
}) => {
  await setup(page, 0)
  await withBootstrapResponse(page, () => page.goto(`/u/andromeda/b/${body.id}/resources`))
  await expect(page.getByRole('heading', { name: 'Resource buildings', exact: true })).toBeVisible()
  await expect(page.locator('main').getByText('Solar Satellite', { exact: true })).toHaveCount(0)
  await withBootstrapResponse(page, () => page.goto(`/u/andromeda/b/${body.id}/shipyard`))
  await page
    .getByRole('link', { name: 'Build Solar Satellite', exact: true })
    .click()
  const pane = page.getByRole('region', { name: 'Progression quote' })
  await expect(
    pane.getByRole('button', { name: 'Build', exact: true }),
  ).toBeDisabled()
  await expect(pane).toContainText('Shipyard')
  await pane.getByText('Technical data', { exact: true }).click()
  await expect(pane).toContainText('Cannot fly or carry cargo')
  await expect(pane).toContainText('Planet energy per satellite')
  await expect(pane).toContainText('30')
  await expect(pane).not.toContainText('Propulsion statistics are unavailable')
})
test('satellites manufacture by quantity but never appear in fleet selection', async ({
  page,
}) => {
  await setup(page)
  const sent: S['Command4'][] = []
  await page.route('**/commands', async (route) => {
    const pair = route.request().postDataJSON()
    sent.push(pair.gameplay.command)
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
  await withBootstrapResponse(page, () => page.goto(`/u/andromeda/b/${body.id}/shipyard`))
  await withProgressionResponse(
    page,
    (request) => request.type === 'Manufacture' && request.body === body.id &&
      request.item.id === item.id && request.quantity === '1',
    () => page.getByRole('link', { name: 'Build Solar Satellite', exact: true }).click(),
  )
  const pane = page.getByRole('region', { name: 'Progression quote' })
  await page.getByLabel('Shipyard quantity').fill('2')
  await expect(
    pane.getByRole('button', { name: 'Crystal details' }),
  ).toContainText('4,000')
  await expect(
    pane.getByRole('button', { name: 'Deuterium details' }),
  ).toContainText('1,000')
  const gain = pane.getByText('Energy added', { exact: true }).locator('..').locator('dd')
  await expect(gain).toHaveText('60')
  await pane.getByRole('button', { name: 'Max Solar Satellite quantity' }).click()
  await expect(page.getByLabel('Shipyard quantity')).toHaveValue('10')
  await expect(gain).toHaveText('300')
  await expect(pane).toContainText('10 × Solar Satellite')
  await expect(pane.getByRole('button', { name: 'Crystal details' })).toContainText('20,000')
  expect(sent).toHaveLength(0)
  await withFixtureResponse(
    page,
    (response) => new URL(response.url()).pathname.endsWith('/commands') &&
      response.request().postDataJSON().gameplay?.command?.type === 'StartManufacture',
    () => pane.getByRole('button', { name: 'Build', exact: true }).click(),
  )
  expect(sent).toMatchObject([{
    type: 'StartManufacture',
    body: body.id,
    item,
    quantity: '10',
  }])
  await withBootstrapResponse(page, () => page.goto(`/u/andromeda/b/${body.id}/dispatch`))
  await expect(
    page.getByRole('radio', { checked: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('textbox', { name: /Solar Satellite.*available/ }),
  ).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Add all ships', exact: true })).toBeDisabled()
})
test('satellite production link opens the selected body’s settings and Back shows the saved output', async ({
  page,
}) => {
  const production = await setup(page)
  production.settings.solar_satellite = 90
  production.solar_satellite!.energy_supply = '54000000'
  production.energy_supply = '54000000'
  let sent: unknown = null
  await page.route('**/commands', async (route) => {
    const pair = route.request().postDataJSON()
    sent = pair.gameplay.command
    production.settings = pair.gameplay.command.settings
    production.settings_revision = (
      BigInt(production.settings_revision) + 1n
    ).toString()
    production.solar_satellite!.energy_supply = (
      (60_000_000n * BigInt(production.settings.solar_satellite)) /
      100n
    ).toString()
    production.energy_supply = production.solar_satellite!.energy_supply
    await route.fulfill({
      json: {
        protocol: 4,
        binding,
        command_id: pair.gameplay.command_id,
        admitted_at: Date.now(),
        executed_at: Date.now(),
        status: 'Committed',
        result_ids: [],
        minimum_viewer_revision: (
          BigInt(production.settings_revision) + 1n
        ).toString(),
      },
    })
  })
  const bodyPath = `/u/andromeda/b/${body.id}`
  const orderPath = `${bodyPath}/shipyard/solar-satellite`
  await withProgressionResponse(page, unitInspection(body.id), () =>
    withBootstrapResponse(page, () => page.goto(orderPath)),
  )
  const order = page.getByRole('region', { name: 'New order', exact: true })
  const link = order.getByRole('link', { name: '90% production. Open Resource settings' })
  await expect(link).toHaveAttribute('href', `${bodyPath}/resource-settings`)
  await link.click()
  await expect(page).toHaveURL(url => url.pathname === `${bodyPath}/resource-settings`)
  const row = page.getByRole('row').filter({
    has: page.getByRole('rowheader', {
      name: 'Solar Satellite',
      exact: true,
    }),
  })
  await expect(row).toContainText('2')
  await expect(row).toContainText('54')
  await expect(row).toContainText('30')
  const slider = row.getByRole('slider')
  await slider.focus()
  await expect(slider).toHaveValue('90')
  await withFixtureResponse(page, response =>
    new URL(response.url()).pathname.endsWith('/commands') &&
    response.request().postDataJSON().gameplay?.command?.type === 'SetProduction',
    () => slider.press('End'),
  )
  expect(sent).toMatchObject({
    type: 'SetProduction',
    body: body.id,
    settings: { solar_satellite: 100 },
  })
  await expect(slider).toHaveValue('100')
  await expect(row).toContainText('60 supplied')
  await expect(page.getByRole('region', { name: 'Production controls' }).getByRole('status')).toHaveText('All changes saved automatically.')
  await withProgressionResponse(page, unitInspection(body.id), () => page.goBack())
  await expect(page).toHaveURL(url => url.pathname === orderPath)
  await expect(order.getByText('Energy added', { exact: true }).locator('..').locator('dd')).toHaveText('30')
  await expect(order.getByRole('link', { name: /production/i })).toHaveCount(0)
})

for (const width of [320]) {
  test(`satellite ordering shows authoritative planet output without technical expansion at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    const production = await setup(page)
    await withProgressionResponse(page, unitInspection(body.id), () =>
      withBootstrapResponse(page, () => page.goto(`/u/andromeda/b/${body.id}/shipyard/solar-satellite`)),
    )
    const order = page.getByRole('region', { name: 'New order', exact: true })
    const perUnit = order.locator('dl > div').filter({ has: page.getByText('Planet energy per satellite', { exact: true }) })
    await expect(perUnit).toContainText('30')
    const gain = order.getByText('Energy added', { exact: true }).locator('..').locator('dd')
    await expect(gain).toHaveText('30')
    await expect(page.locator('details').filter({ has: page.getByText('Technical data', { exact: true }) })).not.toHaveAttribute('open', '')
    production.settings.solar_satellite = 50
    production.solar_satellite!.energy_supply = '30000000'
    production.settings_revision = '1'
    await withFixtureResponse(page, response => new URL(response.url()).pathname.endsWith('/overview'), () => refreshGame(page))
    await expect(gain).toHaveText('(50% production) 15')
    await expect(perUnit).toContainText('30')
    await diagnosticScreenshot(order, { path: `test-results/satellite-order-${width}.png` })
  })
}

test('satellite ordering updates across planets, zero stationed satellites and unavailable production', async ({ page }) => {
  const second = { ...body, id: id(6), coordinates: { galaxy: 1, system: 371, position: 13 }, inventories: [] }
  const production = await setup(page, 1, { bodies: [{ ...body, inventories: [] }, second] })
  production.solar_satellite!.energy_supply = '0'
  production.settings.solar_satellite = 0
  await withProgressionResponse(page, unitInspection(body.id), () =>
    withBootstrapResponse(page, () => page.goto(`/u/andromeda/b/${body.id}/shipyard/solar-satellite`)),
  )
  const order = page.getByRole('region', { name: 'New order', exact: true })
  await expect(order).toContainText('Planet energy per satellite30')
  const gain = order.getByText('Energy added', { exact: true }).locator('..').locator('dd')
  await expect(gain).toHaveText('(0% production) 0')
  await withProgressionResponse(
    page,
    unitInspection(second.id),
    () => selectBody(page, second.id),
  )
  await expect(order).toContainText('Satellite energy data unavailable for this planet.')
  await expect(order.getByText('Planet energy per satellite', { exact: true })).toHaveCount(0)
  production.body = second.id
  production.solar_satellite = { unit_energy: '47000000', energy_supply: '0' }
  production.settings.solar_satellite = 50
  production.settings_revision = '1'
  await withFixtureResponse(page, response => new URL(response.url()).pathname.endsWith('/overview'), () => refreshGame(page))
  await expect(order).toContainText('Planet energy per satellite47')
  await expect(gain).toHaveText('(50% production) 23.5')
  await expect(gain.getByRole('link')).toHaveAttribute('href', `/u/andromeda/b/${second.id}/resource-settings`)
  delete production.solar_satellite
  production.settings_revision = '2'
  await withFixtureResponse(page, response => new URL(response.url()).pathname.endsWith('/overview'), () => refreshGame(page))
  await expect(order).toContainText('Satellite energy data unavailable for this planet.')
})
