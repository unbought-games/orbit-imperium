import { routeProgressionOptions } from './fixtures/progression-options'
import { test, expect } from './fixtures/test'
import { shellFixture, body, binding, id } from './fixtures/game'
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
