import { routeProgressionOptions } from './fixtures/progression-options'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { test, expect } from './fixtures/test'
import { shellFixture, body, binding } from './fixtures/game'
import { readFileSync } from 'node:fs'
import type { components } from '../src/contracts'
import { withBootstrapResponse } from './fixtures/responses'
type S = components['schemas']
const item = { kind: 'Ship', id: 'Destroyer' } as const
const catalog = JSON.parse(
  readFileSync(
    new URL('../../../rules/mvp-v1-slice-11.json', import.meta.url),
    'utf8',
  ),
).catalog as S['CatalogEntry3'][]
const definition = JSON.parse(
  readFileSync('rules/content/destroyer.json', 'utf8'),
)
const destroyer = catalog.find((e) => e.key.id === 'Destroyer')!
destroyer.enabled = true
destroyer.requirements = definition.requirements
destroyer.ship_statistics = {
  cost: [
    String(definition.cost.metal),
    String(definition.cost.crystal),
    String(definition.cost.deuterium),
  ],
  propulsion: {
    drive: 'HyperspaceDrive',
    drive_coefficient: ['3', '10'],
    base_speed: '5000',
    cargo_capacity: '2000',
    fuel_consumption: '1000',
    impulse_upgrade: null,
  },
  combat: {
    technology_bonus: ['1', '10'],
    attack_ticks: '200000000',
    shield_ticks: '50000000',
    hull_ticks: '1100000000',
    rapid_fire_against: definition.rapid_fire.map(
      (r: { target: S['ItemKey3']; factor: number }) => ({
        unit: r.target,
        factor: String(r.factor),
      }),
    ),
    rapid_fire_from: [],
  },
}
for (const [id, file] of [
  ['HyperspaceTechnology', 'hyperspace-technology'],
  ['HyperspaceDrive', 'hyperspace-drive'],
]) {
  const entry = catalog.find((e) => e.key.id === id)!
  entry.enabled = true
  entry.requirements = JSON.parse(
    readFileSync(`rules/content/${file}.json`, 'utf8'),
  ).requirements
}
for (const [id, file] of [
  ['Battleship', 'battleship'],
  ['Battlecruiser', 'battlecruiser'],
] as const) {
  const entry = catalog.find((e) => e.key.id === id)!
  const content = JSON.parse(readFileSync(`rules/content/${file}.json`, 'utf8'))
  entry.enabled = true
  entry.requirements = content.requirements
}
async function setup(
  page: Parameters<typeof shellFixture>[0],
  { drive = 6, technology = 5, shipyard = 9, enabled = true } = {},
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
      ResearchLab: 7,
    },
    inventories: [{ item, count: '2' }],
  }
  await shellFixture(page, {
    protocol: 4,
    bodies: [planet],
    catalog: catalog.map((e) =>
      e.key.id === 'Destroyer' ? { ...e, enabled } : e,
    ),
    research: [
      { research: 'HyperspaceTechnology', level: technology },
      { research: 'HyperspaceDrive', level: drive },
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
    const destroyer =
      enabled &&
      request.type === 'Manufacture' &&
      request.item.id === 'Destroyer'
    const missing =
      shipyard < 9
        ? {
            requirement: {
              type: 'BodyBuilding',
              building: 'Shipyard',
              level: 9,
            },
            actual: shipyard,
          }
        : technology < 5
          ? {
              requirement: {
                type: 'PlayerResearch',
                research: 'HyperspaceTechnology',
                level: 5,
              },
              actual: technology,
            }
          : drive < 6
            ? {
                requirement: {
                  type: 'PlayerResearch',
                  research: 'HyperspaceDrive',
                  level: 6,
                },
                actual: drive,
              }
            : null
    const cost = {
      metal: '60000000000',
      crystal: '50000000000',
      deuterium: '15000000000',
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
        terms: destroyer
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
              unit_duration_ms: 3168000,
              formula: 'ManufactureClassic',
              facilities: [
                { building: 'Shipyard', level: 9 },
                { building: 'NaniteFactory', level: 0 },
              ],
            }
          : null,
        terms_hash: destroyer ? 'b'.repeat(64) : null,
        blockers: !destroyer
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
  test(`Destroyer native Hyperspace profile is explained and compared at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    await setup(page)
    await withBootstrapResponse(page, () =>
      page.goto(`/u/andromeda/b/${body.id}/shipyard/destroyer`),
    )
    const pane = page.getByRole('region', { name: 'Progression quote' })
    await pane.getByText('Technical data', { exact: true }).click()
    const stats = pane.getByRole('region', {
      name: 'Ship technical statistics',
    })
    await expect(stats).toContainText('Hyperspace Drive')
    await expect(stats).not.toContainText('At Hyperspace Drive level')
    await expect(stats).toContainText('5,000')
    if (process.env.ORBIT_TEST_SCREENSHOTS === '1') {
      await page
        .locator('main img')
        .evaluateAll((images) =>
          Promise.all(
            images.map((image) => (image as HTMLImageElement).decode()),
          ),
        )
      await page.evaluate(() =>
        window.scrollTo({ top: 0, behavior: 'instant' }),
      )
      await expect.poll(() => page.evaluate(() => scrollY)).toBe(0)
      await diagnosticScreenshot(page, {
        path: testInfo.outputPath(`destroyer-statistics-${width}x900.png`),
        fullPage: true,
      })
    }
    await withBootstrapResponse(page, () =>
      page.goto(`/u/andromeda/b/${body.id}/shipyard`),
    )
    await page.locator('summary').filter({ hasText: 'Compare ships' }).click()
    await page
      .getByRole('checkbox', { name: 'Light Fighter', exact: true })
      .uncheck()
    await page
      .getByRole('checkbox', { name: 'Heavy Fighter', exact: true })
      .uncheck()
    await page.getByRole('checkbox', { name: 'Destroyer', exact: true }).check()
    const table = page.getByRole('table', {
      name: 'Current player ship statistics · per ship',
    })
    const column = table.getByRole('columnheader', {
      name: 'Destroyer',
      exact: true,
    })
    await expect(column).toBeVisible()
    await expect(table).toContainText('14,000')
    await expect(table).toContainText('Hyperspace Drive')
    await table.scrollIntoViewIfNeeded()
    await diagnosticScreenshot(page, {
      path: testInfo.outputPath(`destroyer-comparison-${width}x900.png`),
      fullPage: false,
    })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  })
}
