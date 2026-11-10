import { routeProgressionOptions } from './fixtures/progression-options'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { test, expect } from './fixtures/test'
import { shellFixture, body, binding } from './fixtures/game'
import { readFileSync } from 'node:fs'
import type { components } from '../src/contracts'
import { withBootstrapResponse } from './fixtures/responses'
type S = components['schemas']
const item = { kind: 'Ship', id: 'Bomber' } as const
const catalog = JSON.parse(
  readFileSync(
    new URL('../../../rules/mvp-v1-slice-11.json', import.meta.url),
    'utf8',
  ),
).catalog as S['CatalogEntry3'][]
const definition = JSON.parse(readFileSync('rules/content/bomber.json', 'utf8'))
const bomber = catalog.find((e) => e.key.id === 'Bomber')!
bomber.enabled = true
bomber.requirements = definition.requirements
bomber.ship_statistics = {
  cost: [
    String(definition.cost.metal),
    String(definition.cost.crystal),
    String(definition.cost.deuterium),
  ],
  propulsion: {
    drive: 'ImpulseDrive',
    drive_coefficient: ['1', '5'],
    base_speed: '4000',
    cargo_capacity: '500',
    fuel_consumption: '1000',
    impulse_upgrade: null,
  },
  combat: {
    technology_bonus: ['1', '10'],
    attack_ticks: '100000000',
    shield_ticks: '50000000',
    hull_ticks: '750000000',
    rapid_fire_against: definition.rapid_fire.map(
      (r: { target: S['ItemKey3']; factor: number }) => ({
        unit: r.target,
        factor: String(r.factor),
      }),
    ),
    rapid_fire_from: [],
  },
}
catalog.find((e) => e.key.id === 'PlasmaTechnology')!.enabled = true
async function setup(
  page: Parameters<typeof shellFixture>[0],
  {
    impulse = 6,
    plasma = 5,
    shipyard = 8,
    enabled = true,
    hyperspace = 0,
    upgradedUniverse = false,
  } = {},
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
      e.key.id === 'Bomber'
        ? {
            ...e,
            enabled,
            ship_statistics: {
              ...e.ship_statistics!,
              propulsion: {
                ...e.ship_statistics!.propulsion!,
                ...(upgradedUniverse
                  ? {
                      hyperspace_upgrade: {
                        minimum_level: 8,
                        base_speed: '5000',
                        fuel_consumption: '1000',
                        drive_coefficient: ['3', '10'],
                      },
                    }
                  : {}),
              },
            },
          }
        : e,
    ),
    research: [
      { research: 'PlasmaTechnology', level: plasma },
      { research: 'ImpulseDrive', level: impulse },
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
    const bomber =
      enabled && request.type === 'Manufacture' && request.item.id === 'Bomber'
    const missing =
      shipyard < 8
        ? {
            requirement: {
              type: 'BodyBuilding',
              building: 'Shipyard',
              level: 8,
            },
            actual: shipyard,
          }
        : plasma < 5
          ? {
              requirement: {
                type: 'PlayerResearch',
                research: 'PlasmaTechnology',
                level: 5,
              },
              actual: plasma,
            }
          : impulse < 6
            ? {
                requirement: {
                  type: 'PlayerResearch',
                  research: 'ImpulseDrive',
                  level: 6,
                },
                actual: impulse,
              }
            : null
    const cost = {
      metal: '50000000000',
      crystal: '25000000000',
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
        terms: bomber
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
              unit_duration_ms: 2400000,
              formula: 'ManufactureClassic',
              facilities: [
                { building: 'Shipyard', level: 8 },
                { building: 'NaniteFactory', level: 0 },
              ],
            }
          : null,
        terms_hash: bomber ? 'b'.repeat(64) : null,
        blockers: !bomber
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
  test(`Bomber Hyperspace profile is explained and compared at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    await setup(page, { hyperspace: 8, upgradedUniverse: true })
    await withBootstrapResponse(page, () =>
      page.goto(`/u/andromeda/b/${body.id}/shipyard/bomber`),
    )
    const pane = page.getByRole('region', { name: 'Progression quote' })
    await pane.getByText('Technical data', { exact: true }).click()
    const stats = pane.getByRole('region', {
      name: 'Ship technical statistics',
    })
    await expect(stats).toContainText('At Hyperspace Drive level 8')
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
        path: testInfo.outputPath(`bomber-upgrade-${width}x900.png`),
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
    await page.getByRole('checkbox', { name: 'Bomber', exact: true }).check()
    const table = page.getByRole('table', {
      name: 'Current player ship statistics · per ship',
    })
    const column = table.getByRole('columnheader', {
      name: 'Bomber',
      exact: true,
    })
    await expect(column).toBeVisible()
    await expect(table).toContainText('17,000')
    await expect(table).toContainText('Hyperspace Drive')
    await table.scrollIntoViewIfNeeded()
    await diagnosticScreenshot(page, {
      path: testInfo.outputPath(`bomber-comparison-${width}x900.png`),
      fullPage: false,
    })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  })
}
