import { openProductionSettings } from './fixtures/production-settings'
import { test, expect } from './fixtures/test'
import { shellFixture, body, binding, id, refreshGame } from './fixtures/game'
import { readFileSync } from 'node:fs'
import type { components } from '../src/contracts'
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
    production: [
      {
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
      },
    ],
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
  await page.route('**/progression-options', async (route) => {
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
}

test('satellites require Shipyard 1 and show stationary statistics and local energy', async ({
  page,
}) => {
  await setup(page, 0)
  await page.goto(`/u/andromeda/b/${body.id}/shipyard`)
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
  await expect(pane).toContainText('Energy per satellite on this planet')
  await expect(pane).toContainText('30')
  await expect(pane).not.toContainText('Propulsion statistics are unavailable')
})
test('satellites manufacture by quantity but never appear in fleet selection', async ({
  page,
}) => {
  await setup(page)
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
    .getByRole('link', { name: 'Build Solar Satellite', exact: true })
    .click()
  const pane = page.getByRole('region', { name: 'Progression quote' })
  await page.getByLabel('Shipyard quantity').fill('2')
  await expect(
    pane.getByRole('button', { name: 'Crystal details' }),
  ).toContainText('4,000')
  await expect(
    pane.getByRole('button', { name: 'Deuterium details' }),
  ).toContainText('1,000')
  await pane.getByRole('button', { name: 'Build', exact: true }).click()
  await expect
    .poll(() => sent)
    .toMatchObject({
      type: 'StartManufacture',
      body: body.id,
      item,
      quantity: '2',
    })
  await page.goto(`/u/andromeda/b/${body.id}/dispatch`)
  await expect(
    page.getByRole('combobox', { name: 'Mission', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('textbox', { name: /Solar Satellite.*available/ }),
  ).toHaveCount(0)
})
test('production controls show satellite quantity and submit group throttling', async ({
  page,
}) => {
  await setup(page)
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
        result_ids: [],
        minimum_viewer_revision: '1',
      },
    })
  })
  await page.goto(`/u/andromeda/b/${body.id}/resources`)
  await openProductionSettings(page)
  const row = page.getByRole('row').filter({
    has: page.getByRole('rowheader', {
      name: 'Solar Satellite',
      exact: true,
    }),
  })
  await expect(row).toContainText('2')
  await expect(row).toContainText('60')
  await expect(row).toContainText('30')
  await row.getByRole('combobox').selectOption('50')
  await expect
    .poll(() => sent)
    .toMatchObject({
      type: 'SetProduction',
      body: body.id,
      settings: { solar_satellite: 50 },
    })
})
