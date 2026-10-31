import { routeProgressionOptions } from './fixtures/progression-options'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import type { Page } from '@playwright/test'
import { setDestination } from './fixtures/coordinates'
import { test, expect } from './fixtures/test'
import { shellFixture, body, binding, id } from './fixtures/game'
import { readFileSync } from 'node:fs'
import type { components } from '../src/contracts'
type S = components['schemas']
async function capture(
  page: Page,
  options: Parameters<typeof diagnosticScreenshot>[1],
) {
  await page.locator('main img').evaluateAll((images) => {
    for (const image of images) (image as HTMLImageElement).loading = 'eager'
  })
  await page
    .locator('main img')
    .evaluateAll((images) =>
      Promise.all(images.map((image) => (image as HTMLImageElement).decode())),
    )
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await diagnosticScreenshot(page, options)
}
const item = { kind: 'Ship', id: 'Battleship' } as const
const catalog = JSON.parse(
  readFileSync(
    new URL('../../../rules/mvp-v1-slice-11.json', import.meta.url),
    'utf8',
  ),
).catalog as S['CatalogEntry3'][]
const definition = JSON.parse(
  readFileSync('rules/content/battleship.json', 'utf8'),
)
const battleship = catalog.find((e) => e.key.id === 'Battleship')!
battleship.enabled = true
battleship.requirements = definition.requirements
battleship.ship_statistics = {
  cost: [
    String(definition.cost.metal),
    String(definition.cost.crystal),
    String(definition.cost.deuterium),
  ],
  propulsion: {
    drive: 'HyperspaceDrive',
    drive_coefficient: ['3', '10'],
    base_speed: '10000',
    cargo_capacity: '1500',
    fuel_consumption: '500',
    impulse_upgrade: null,
  },
  combat: {
    technology_bonus: ['1', '10'],
    attack_ticks: '100000000',
    shield_ticks: '20000000',
    hull_ticks: '600000000',
    rapid_fire_against: definition.rapid_fire.map(
      (r: { target: S['ItemKey3']; factor: number }) => ({
        unit: r.target,
        factor: String(r.factor),
      }),
    ),
    rapid_fire_from: [
      { unit: { kind: 'Ship', id: 'Battlecruiser' }, factor: '7' },
    ],
  },
}
for (const [id, file] of [
  ['HyperspaceDrive', 'hyperspace-drive'],
  ['HyperspaceTechnology', 'hyperspace-technology'],
]) {
  const entry = catalog.find((e) => e.key.id === id)!
  entry.enabled = true
  entry.requirements = JSON.parse(
    readFileSync(`rules/content/${file}.json`, 'utf8'),
  ).requirements
}
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
  { hyperspace = 4, shipyard = 7, enabled = true } = {},
) {
  const planet = {
    ...body,
    amounts: {
      metal: '1000000000000',
      crystal: '1000000000000',
      deuterium: '1000000000000',
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
      e.key.id === 'Battleship' ? { ...e, enabled } : e,
    ),
    research: [
      { research: 'HyperspaceDrive', level: hyperspace },
      { research: 'EnergyTechnology', level: 1 },
      { research: 'WeaponsTechnology', level: 0 },
      { research: 'ShieldingTechnology', level: 0 },
      { research: 'ArmourTechnology', level: 0 },
    ],
    extraCapabilities: ['Attack'],
    missions: {
      fleets: [],
      incoming: [],
      score_value_micro: '0',
      fleet_slots: '1',
    },
  })
  await routeProgressionOptions(page, async (route) => {
    const { context, request } = route.request().postDataJSON()
    const battleship =
      enabled &&
      request.type === 'Manufacture' &&
      request.item.id === 'Battleship'
    const missing =
      shipyard < 7
        ? {
            requirement: {
              type: 'BodyBuilding',
              building: 'Shipyard',
              level: 7,
            },
            actual: shipyard,
          }
        : hyperspace < 4
          ? {
              requirement: {
                type: 'PlayerResearch',
                research: 'HyperspaceDrive',
                level: 4,
              },
              actual: hyperspace,
            }
          : null
    const cost = {
      metal: '45000000000',
      crystal: '15000000000',
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
        terms: battleship
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
              unit_duration_ms: 2160000,
              formula: 'ManufactureClassic',
              facilities: [
                { building: 'Shipyard', level: 7 },
                { building: 'NaniteFactory', level: 0 },
              ],
            }
          : null,
        terms_hash: battleship ? 'b'.repeat(64) : null,
        blockers: !battleship
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

for (const width of [390, 1440]) {
  for (const [label, levels] of [
    ['Shipyard', { shipyard: 6 }],
    ['Hyperspace Drive', { hyperspace: 3 }],
  ] as const) {
    test(`Battleship exposes its missing ${label} prerequisite at ${width}px`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 })
      await setup(page, levels)
      await page.goto(`/u/andromeda/b/${body.id}/shipyard/battleship`)
      const pane = page.getByRole('region', { name: 'Progression quote' })
      await expect(
        pane.getByRole('button', { name: 'Build', exact: true }),
      ).toBeDisabled()
      await expect(pane.getByLabel('Action blockers')).toContainText(label)
      await capture(page, {
        path: testInfo.outputPath(
          `battleship-locked-${label}-${width}x900.png`,
        ),
        fullPage: true,
      })
    })
  }
}

test('Battleship stays unavailable before its universe enables it', async ({
  page,
}) => {
  await setup(page, { enabled: false })
  await page.goto(`/u/andromeda/b/${body.id}/shipyard/battleship`)
  const pane = page.getByRole('region', { name: 'Progression quote' })
  await expect(pane).toContainText('Unavailable in this universe.')
  await expect(
    pane.getByRole('button', { name: 'Build', exact: true }),
  ).toBeDisabled()
})

for (const width of [390, 1440]) {
  test(`Battleship submits the selected build quantity at ${width}px`, async ({
    page,
  }, testInfo) => {
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
    await expect(
      page.getByRole('link', { name: 'Build Battleship', exact: true }),
    ).toBeVisible()
    await capture(page, {
      path: testInfo.outputPath(`shipyard-catalog-${width}x900.png`),
      fullPage: true,
    })
    await page
      .getByRole('link', { name: 'Build Battleship', exact: true })
      .click()
    await expect(pane).toContainText('A hyperspace-powered warship')
    await expect(pane.locator('img').first()).toHaveAttribute(
      'src',
      /battleship/,
    )
    await pane.getByText('Technical data', { exact: true }).click()
    const stats = pane.getByRole('region', {
      name: 'Ship technical statistics',
    })
    await expect(stats).toContainText('10,000')
    await expect(stats).toContainText('6,000')
    await expect(stats).toContainText('Hyperspace Drive')
    await expect(stats).toContainText('Solar Satellite')
    await expect(stats).not.toContainText('Light Laser')
    await expect(stats).not.toContainText('profile changes')
    await page.getByLabel('Shipyard quantity').fill('2')
    await expect(
      pane.getByRole('button', { name: 'Metal details' }),
    ).toContainText('90,000')
    await expect(
      pane.getByRole('button', { name: 'Crystal details' }),
    ).toContainText('30,000')
    await expect(
      pane.getByRole('button', { name: 'Deuterium details' }),
    ).toHaveCount(0)
    await capture(page, {
      path: testInfo.outputPath(`battleship-detail-${width}x900.png`),
      fullPage: true,
    })
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
    await expect(result).toContainText('Last submitted: 2 × Battleship')
    await expect(result).toContainText('Order confirmed')
    await capture(page, {
      path: testInfo.outputPath(`battleship-confirmed-${width}x900.png`),
      fullPage: true,
    })
    await page.goto(`/u/andromeda/b/${body.id}/shipyard`)
    await page.locator('summary').filter({ hasText: 'Compare ships' }).click()
    for (const name of ['Light Fighter', 'Heavy Fighter']) {
      await page.getByRole('checkbox', { name, exact: true }).uncheck()
    }
    await page
      .getByRole('checkbox', { name: 'Battleship', exact: true })
      .check()
    const comparison = page.getByRole('table', {
      name: 'Current player ship statistics · per ship',
    })
    await expect(comparison).toContainText('22,000')
    await expect(comparison).toContainText('1,500')
    await expect(comparison).toContainText('Hyperspace Drive')
    await comparison.scrollIntoViewIfNeeded()
    await diagnosticScreenshot(page, {
      path: testInfo.outputPath(`battleship-comparison-${width}x900.png`),
      fullPage: false,
    })
  })
}

for (const width of [390, 1440]) {
  test(`Battleships can be selected, quoted and launched at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
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
                speeds: [['Battleship', '22000']],
                duration_ms: 360000,
                fuel: '20000000',
                capacity: '3000000000',
                maximum_payload: '2980000000',
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
      .getByRole('textbox', { name: 'Battleship · 2 available' })
      .fill('2')
    await page
      .getByRole('button', { name: 'Review fleet', exact: true })
      .click()
    const quote = page.getByRole('region', { name: 'Fleet quote' })
    await expect(
      quote
        .getByRole('list', { name: 'Ship composition' })
        .getByRole('listitem'),
    ).toHaveText(['Battleship 2'])
    await capture(page, {
      path: testInfo.outputPath(`battleship-dispatch-${width}x900.png`),
      fullPage: true,
    })
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
              { owner: binding.player, ship_type: 'Battleship', count: '2' },
            ],
          },
        },
      })
  })
}
