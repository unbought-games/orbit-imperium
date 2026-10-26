import { setDestination } from './fixtures/coordinates'
import { test, expect } from './fixtures/test'
import { shellFixture, body, binding, id } from './fixtures/game'
import { readFileSync } from 'node:fs'
import type { components } from '../src/contracts'
type S = components['schemas']
const item = { kind: 'Ship', id: 'LargeCargo' } as const
const catalog = JSON.parse(
  readFileSync(
    new URL('../../../rules/mvp-v1-slice-13.json', import.meta.url),
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
  { combustion = 6, shipyard = 4, enabled = true } = {},
) {
  const planet = {
    ...body,
    amounts: {
      metal: '100000000000',
      crystal: '20000000000',
      deuterium: '10000000000',
    },
    levels: {
      ...body.levels,
      Shipyard: shipyard,
      RoboticsFactory: 2,
      ResearchLab: 1,
    },
    inventories: [{ item, count: '2' }],
  }
  await shellFixture(page, {
    protocol: 4,
    bodies: [planet],
    catalog: catalog.map((e) =>
      e.key.id === 'LargeCargo'
        ? {
            ...e,
            enabled,
            ship_statistics: {
              propulsion: {
                cargo_capacity: '25000',
                base_speed: '7500',
                fuel_consumption: '50',
                drive: 'CombustionDrive' as const,
                impulse_upgrade: null,
              },
              combat: {
                attack_ticks: '500000',
                shield_ticks: '2500000',
                hull_ticks: '120000000',
                rapid_fire_against: [
                  {
                    unit: {
                      kind: 'Ship' as const,
                      id: 'EspionageProbe' as const,
                    },
                    factor: '5',
                  },
                ],
                rapid_fire_from: [],
              },
            },
          }
        : e,
    ),
    research: [
      { research: 'CombustionDrive', level: combustion },
      { research: 'EnergyTechnology', level: 1 },
    ],
    extraCapabilities: ['Transport'],
    missions: {
      fleets: [],
      incoming: [],
      score_value_micro: '0',
      fleet_slots: '1',
    },
  })
  await page.route('**/progression-options', async (route) => {
    const { context, request } = route.request().postDataJSON()
    const largeCargo =
      enabled &&
      request.type === 'Manufacture' &&
      request.item.id === 'LargeCargo'
    const missing =
      shipyard < 4
        ? {
            requirement: {
              type: 'BodyBuilding',
              building: 'Shipyard',
              level: 4,
            },
            actual: shipyard,
          }
        : combustion < 6
          ? {
              requirement: {
                type: 'PlayerResearch',
                research: 'CombustionDrive',
                level: 6,
              },
              actual: combustion,
            }
          : null
    const cost = {
      metal: '6000000000',
      crystal: '6000000000',
      deuterium: '0',
    }
    await route.fulfill({
      json: {
        protocol: 4,
        binding,
        request_id: context.request_id,
        viewer_revision: '1',
        sampled_at: Date.now(),
        as_of_ms: Date.now(),
        request,
        terms: largeCargo
          ? {
              type: 'Manufacture',
              profile_hash: 'a'.repeat(64),
              body: body.id,
              item,
              quantity: request.quantity,
              unit_cost: cost,
              paid: Object.fromEntries(
                Object.entries(cost).map(([k, v]) => [
                  k,
                  (BigInt(v) * BigInt(request.quantity)).toString(),
                ]),
              ),
              unit_duration_ms: 3456000,
              formula: 'ManufactureClassic',
              facilities: [
                { building: 'Shipyard', level: 4 },
                { building: 'NaniteFactory', level: 0 },
              ],
            }
          : null,
        terms_hash: largeCargo ? 'b'.repeat(64) : null,
        blockers: !largeCargo
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
          : missing
            ? [
                {
                  code: 'PrerequisiteMissing',
                  requirement: missing.requirement,
                  required: String(missing.requirement.level),
                  actual: String(missing.actual),
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

for (const [label, levels] of [
  ['Shipyard', { shipyard: 3 }],
  ['Combustion Drive', { combustion: 5 }],
] as const) {
  test(`Large Cargo exposes its missing ${label} prerequisite`, async ({
    page,
  }) => {
    await setup(page, levels)
    await page.goto(`/u/andromeda/b/${body.id}/shipyard/large-cargo`)
    const pane = page.getByRole('region', { name: 'Progression quote' })
    await expect(
      pane.getByRole('button', { name: 'Build', exact: true }),
    ).toBeDisabled()
    await expect(pane.getByLabel('Action blockers')).toContainText(label)
  })
}

test('Large Cargo stays unavailable before its universe enables it', async ({
  page,
}) => {
  await setup(page, { enabled: false })
  await page.goto(`/u/andromeda/b/${body.id}/shipyard/large-cargo`)
  const pane = page.getByRole('region', { name: 'Progression quote' })
  await expect(pane).toContainText('Unavailable in this universe.')
  await expect(
    pane.getByRole('button', { name: 'Build', exact: true }),
  ).toBeDisabled()
})

for (const width of [390, 1440]) {
  test(`Large Cargo submits the selected build quantity at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
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
      .getByRole('link', { name: 'Build Large Cargo', exact: true })
      .click()
    await expect(pane).toContainText('A bulk transport')
    await expect(pane.locator('img').first()).toHaveAttribute(
      'src',
      /large-cargo/,
    )
    await pane.getByText('Technical data', { exact: true }).click()
    const statistics = pane.getByRole('region', {
      name: 'Ship technical statistics',
    })
    for (const [label, value] of [
      ['Cargo capacity', '25,000'],
      ['Base speed', '7,500'],
      ['Base fuel consumption', '50'],
      ['Attack strength', '5'],
      ['Shield strength', '25'],
      ['Hull strength', '1,200'],
    ]) {
      await expect(
        statistics
          .locator('dl > div')
          .filter({ has: page.getByText(label, { exact: true }) }),
      ).toContainText(value)
    }
    await expect(statistics).toContainText('Combustion Drive')
    await expect(statistics).toContainText('Espionage Probe')
    await page.getByLabel('Shipyard quantity').fill('2')
    await expect(
      pane.getByRole('button', { name: 'Metal details' }),
    ).toContainText('12,000')
    await expect(
      pane.getByRole('button', { name: 'Crystal details' }),
    ).toContainText('12,000')
    await pane.getByRole('button', { name: 'Build', exact: true }).click()
    await expect
      .poll(() => sent)
      .toMatchObject({
        type: 'StartManufacture',
        body: body.id,
        item,
        quantity: '2',
      })
    const result = pane.getByRole('group', { name: 'Latest action result' })
    await expect(result).toContainText('Last submitted: 2 × Large Cargo')
    await expect(result).toContainText('Order confirmed')
  })
}

test('Large Cargos can be selected, quoted and launched in a transport fleet', async ({
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
              speeds: [['LargeCargo', '12000']],
              duration_ms: 360000,
              fuel: '20000000',
              capacity: '50000000000',
              maximum_payload: '49980000000',
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
    .getByRole('combobox', { name: 'Mission', exact: true })
    .selectOption('Transport')
  await setDestination(page, { position: '8' })
  await page
    .getByRole('textbox', { name: 'Large Cargo · 2 available' })
    .fill('2')
  await page.getByRole('button', { name: 'Review fleet', exact: true }).click()
  const quote = page.getByRole('region', { name: 'Fleet quote' })
  await expect(quote.getByRole('list', { name: 'Ship composition' }).getByRole('listitem')).toHaveText(['Large Cargo 2'])
  await quote.getByRole('button', { name: /^Transport to / }).click()
  await expect
    .poll(() => sent)
    .toMatchObject({
      type: 'World',
      action: {
        type: 'LaunchFleet',
        intent: {
          mission: 'Transport',
          ships: [
            { owner: binding.player, ship_type: 'LargeCargo', count: '2' },
          ],
        },
      },
    })
})
