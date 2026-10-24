import { test, expect } from './fixtures/test'
import { shellFixture, body, binding, id } from './fixtures/game'
import { readFileSync } from 'node:fs'
import type { components } from '../src/contracts'
type S = components['schemas']
const item = { kind: 'Ship', id: 'Cruiser' } as const
const catalog = JSON.parse(
  readFileSync(
    new URL('../../../rules/mvp-v1-slice-11.json', import.meta.url),
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
  { impulse = 4, ion = 2, shipyard = 5, enabled = true } = {},
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
      ResearchLab: 4,
    },
    inventories: [{ item, count: '2' }],
  }
  await shellFixture(page, {
    protocol: 4,
    bodies: [planet],
    catalog: catalog.map((e) =>
      e.key.id === 'Cruiser' ? { ...e, enabled } : e,
    ),
    research: [
      { research: 'IonTechnology', level: ion },
      { research: 'ImpulseDrive', level: impulse },
      { research: 'EnergyTechnology', level: 1 },
    ],
    extraCapabilities: ['Attack'],
    missions: {
      fleets: [],
      incoming: [],
      score_value_micro: '0',
      fleet_slots: '1',
    },
  })
  await page.route('**/progression-options', async (route) => {
    const { context, request } = route.request().postDataJSON()
    const cruiser =
      enabled && request.type === 'Manufacture' && request.item.id === 'Cruiser'
    const missing =
      shipyard < 5
        ? {
            requirement: {
              type: 'BodyBuilding',
              building: 'Shipyard',
              level: 5,
            },
            actual: shipyard,
          }
        : ion < 2
          ? {
              requirement: {
                type: 'PlayerResearch',
                research: 'IonTechnology',
                level: 2,
              },
              actual: ion,
            }
          : impulse < 4
            ? {
                requirement: {
                  type: 'PlayerResearch',
                  research: 'ImpulseDrive',
                  level: 4,
                },
                actual: impulse,
              }
            : null
    const cost = {
      metal: '20000000000',
      crystal: '7000000000',
      deuterium: '2000000000',
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
        terms: cruiser
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
              unit_duration_ms: 6480000,
              formula: 'ManufactureClassic',
              facilities: [
                { building: 'Shipyard', level: 5 },
                { building: 'NaniteFactory', level: 0 },
              ],
            }
          : null,
        terms_hash: cruiser ? 'b'.repeat(64) : null,
        blockers: !cruiser
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
  ['Shipyard', { shipyard: 4 }],
  ['Ion Technology', { ion: 1 }],
  ['Impulse Drive', { impulse: 3 }],
] as const) {
  test(`Cruiser exposes its missing ${label} prerequisite`, async ({
    page,
  }) => {
    await setup(page, levels)
    await page.goto(`/u/andromeda/b/${body.id}/shipyard/cruiser`)
    const pane = page.getByRole('region', { name: 'Progression quote' })
    await expect(
      pane.getByRole('button', { name: 'Build', exact: true }),
    ).toBeDisabled()
    await expect(pane.getByLabel('Action blockers')).toContainText(label)
  })
}

test('Cruiser stays unavailable before its universe enables it', async ({
  page,
}) => {
  await setup(page, { enabled: false })
  await page.goto(`/u/andromeda/b/${body.id}/shipyard/cruiser`)
  const pane = page.getByRole('region', { name: 'Progression quote' })
  await expect(pane).toContainText('Unavailable in this universe.')
  await expect(
    pane.getByRole('button', { name: 'Build', exact: true }),
  ).toBeDisabled()
})

for (const width of [390, 1440]) {
  test(`Cruiser submits the selected build quantity at ${width}px`, async ({
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
    await page.getByRole('link', { name: 'Build Cruiser', exact: true }).click()
    await expect(pane).toContainText('A fast impulse-powered combat ship')
    await expect(pane.locator('img').first()).toHaveAttribute('src', /cruiser/)
    await page.getByLabel('Shipyard quantity').fill('2')
    await expect(
      pane.getByRole('button', { name: 'Metal details' }),
    ).toContainText('40,000')
    await expect(
      pane.getByRole('button', { name: 'Crystal details' }),
    ).toContainText('14,000')
    await expect(
      pane.getByRole('button', { name: 'Deuterium details' }),
    ).toContainText('4,000')
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
    await expect(result).toContainText('Last submitted: 2 × Cruiser')
    await expect(result).toContainText('Order confirmed')
  })
}

test('Cruisers can be selected, quoted and launched in an attack fleet', async ({
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
              speeds: [['Cruiser', '27000']],
              duration_ms: 360000,
              fuel: '20000000',
              capacity: '1600000000',
              maximum_payload: '1580000000',
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
    .selectOption('Attack')
  await page.getByLabel('Position', { exact: true }).fill('8')
  await page.getByRole('textbox', { name: 'Cruiser · 2 available' }).fill('2')
  await page.getByRole('button', { name: 'Review fleet', exact: true }).click()
  const quote = page.getByRole('region', { name: 'Fleet quote' })
  await expect(quote).toContainText('2 Cruiser')
  await quote.getByRole('button', { name: /Send/ }).click()
  await expect
    .poll(() => sent)
    .toMatchObject({
      type: 'World',
      action: {
        type: 'LaunchFleet',
        intent: {
          mission: 'Attack',
          ships: [{ owner: binding.player, ship_type: 'Cruiser', count: '2' }],
        },
      },
    })
})
