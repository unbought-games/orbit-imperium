import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { setDestination } from './fixtures/coordinates'
import { test, expect } from './fixtures/test'
import { shellFixture, body, binding, id } from './fixtures/game'
import { readFileSync } from 'node:fs'
import type { components } from '../src/contracts'
type S = components['schemas']
const item = { kind: 'Ship', id: 'Battlecruiser' } as const
const catalog = JSON.parse(
  readFileSync(
    new URL('../../../rules/mvp-v1-slice-11.json', import.meta.url),
    'utf8',
  ),
).catalog as S['CatalogEntry3'][]
const definition = JSON.parse(
  readFileSync('rules/content/battlecruiser.json', 'utf8'),
)
const battlecruiser = catalog.find((e) => e.key.id === 'Battlecruiser')!
battlecruiser.enabled = true
battlecruiser.requirements = definition.requirements
battlecruiser.ship_statistics = {
  cost: [
    String(definition.cost.metal),
    String(definition.cost.crystal),
    String(definition.cost.deuterium),
  ],
  propulsion: {
    drive: 'HyperspaceDrive',
    drive_coefficient: ['3', '10'],
    base_speed: '10000',
    cargo_capacity: '750',
    fuel_consumption: '250',
    impulse_upgrade: null,
  },
  combat: {
    technology_bonus: ['1', '10'],
    attack_ticks: '70000000',
    shield_ticks: '40000000',
    hull_ticks: '700000000',
    rapid_fire_against: definition.rapid_fire.map(
      (r: { target: S['ItemKey3']; factor: number }) => ({
        unit: r.target,
        factor: String(r.factor),
      }),
    ),
    rapid_fire_from: [],
  },
}
const researchDefinitions = {
  HyperspaceDrive: JSON.parse(
    readFileSync('rules/content/hyperspace-drive.json', 'utf8'),
  ),
  HyperspaceTechnology: JSON.parse(
    readFileSync('rules/content/hyperspace-technology.json', 'utf8'),
  ),
  LaserTechnology: (() => {
    const laser = JSON.parse(
      readFileSync('rules/content/light-laser.json', 'utf8'),
    ).research
    return { research: laser.definition, requirements: laser.requirements }
  })(),
}
for (const [key, definition] of Object.entries(researchDefinitions)) {
  const entry = catalog.find((e) => e.key.id === key)!
  entry.enabled = true
  entry.requirements = definition.requirements
  entry.technical_data = {
    bonuses:
      key === 'HyperspaceDrive'
        ? [
            {
              label: 'Base speed',
              fraction: ['3', '10'],
              subject: item,
              condition: null,
            },
          ]
        : [],
    facts: [
      {
        label: 'Effect',
        value:
          key === 'HyperspaceDrive'
            ? 'Bonuses add to base speed. Actual travel time and fuel depend on the slowest ship, route, universe speed and speed setting.'
            : 'Prerequisite research. No additional per-level production, combat, cargo or construction bonus is implemented in this universe.',
        subject: null,
      },
    ],
    storage_capacities: null,
    combat: null,
  }
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

async function capture(page: Parameters<typeof shellFixture>[0], path: string) {
  await page
    .locator('main img')
    .evaluateAll((images) =>
      Promise.all(images.map((image) => (image as HTMLImageElement).decode())),
    )
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0)
  await diagnosticScreenshot(page, { path, fullPage: true })
}

async function setup(
  page: Parameters<typeof shellFixture>[0],
  {
    hyperspace = 5,
    technology = 5,
    laser = 12,
    shipyard = 8,
    enabled = true,
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
      ResearchLab: 7,
    },
    inventories: [{ item, count: '2' }],
  }
  await shellFixture(page, {
    protocol: 4,
    bodies: [planet],
    catalog: catalog.map((e) =>
      e.key.id === 'Battlecruiser' ? { ...e, enabled } : e,
    ),
    research: [
      { research: 'HyperspaceDrive', level: hyperspace },
      { research: 'HyperspaceTechnology', level: technology },
      { research: 'LaserTechnology', level: laser },
      { research: 'EnergyTechnology', level: 5 },
      { research: 'WeaponsTechnology', level: 0 },
      { research: 'ShieldingTechnology', level: 5 },
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
  await page.route('**/progression-options', async (route) => {
    const { context, request } = route.request().postDataJSON()
    if (
      request.type === 'Research' &&
      request.research in researchDefinitions
    ) {
      const definition =
        researchDefinitions[
          request.research as keyof typeof researchDefinitions
        ]
      const level = {
        HyperspaceDrive: hyperspace,
        HyperspaceTechnology: technology,
        LaserTechnology: laser,
      }[request.research as keyof typeof researchDefinitions]
      const cost = Object.fromEntries(
        ['metal', 'crystal', 'deuterium'].map((resource, i) => [
          resource,
          String(
            BigInt(definition.research.base[i]) *
              2n ** BigInt(level) *
              1000000n,
          ),
        ]),
      )
      await route.fulfill({
        json: {
          protocol: 4,
          binding,
          request_id: context.request_id,
          viewer_revision: '1',
          sampled_at: Date.now(),
          as_of_ms: Date.now(),
          request,
          terms: {
            type: 'Research',
            profile_hash: 'a'.repeat(64),
            host: body.id,
            research: request.research,
            source_level: level,
            target_level: level + 1,
            paid: cost,
            duration_ms: 360000,
            formula: 'ResearchClassic',
            labs: [{ body: body.id, level: 7 }],
            effective_lab: '7',
            required_energy: '0',
          },
          terms_hash: 'b'.repeat(64),
          blockers: [],
          estimates: null,
        },
      })
      return
    }
    const battlecruiser =
      enabled &&
      request.type === 'Manufacture' &&
      request.item.id === 'Battlecruiser'
    const levels: Record<string, number> = {
      Shipyard: shipyard,
      HyperspaceDrive: hyperspace,
      HyperspaceTechnology: technology,
      LaserTechnology: laser,
    }
    const requirement =
      battlecruiser &&
      definition.requirements.find(
        (r: S['CatalogEntry3']['requirements'][number]) =>
          levels[r.type === 'BodyBuilding' ? r.building : r.research] < r.level,
      )
    const missing = requirement
      ? {
          requirement,
          actual: levels[requirement.building ?? requirement.research],
        }
      : null
    const cost = {
      metal: '30000000000',
      crystal: '40000000000',
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
        terms: battlecruiser
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
              unit_duration_ms: 2240000,
              formula: 'ManufactureClassic',
              facilities: [
                { building: 'Shipyard', level: 8 },
                { building: 'NaniteFactory', level: 0 },
              ],
            }
          : null,
        terms_hash: battlecruiser ? 'b'.repeat(64) : null,
        blockers: !battlecruiser
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
  ['Shipyard', { shipyard: 7 }],
  ['Hyperspace Technology', { technology: 4 }],
  ['Hyperspace Drive', { hyperspace: 4 }],
  ['Laser Technology', { laser: 11 }],
] as const) {
  test(`Battlecruiser exposes its missing ${label} prerequisite`, async ({
    page,
  }) => {
    await setup(page, levels)
    await page.goto(`/u/andromeda/b/${body.id}/shipyard/battlecruiser`)
    const pane = page.getByRole('region', { name: 'Progression quote' })
    await expect(
      pane.getByRole('button', { name: 'Build', exact: true }),
    ).toBeDisabled()
    await expect(pane.getByLabel('Action blockers')).toContainText(label)
  })
}

test('Battlecruiser stays unavailable before its universe enables it', async ({
  page,
}) => {
  await setup(page, { enabled: false })
  await page.goto(`/u/andromeda/b/${body.id}/shipyard/battlecruiser`)
  const pane = page.getByRole('region', { name: 'Progression quote' })
  await expect(pane).toContainText('Unavailable in this universe.')
  await expect(
    pane.getByRole('button', { name: 'Build', exact: true }),
  ).toBeDisabled()
})

for (const width of [390, 1440]) {
  test(`Battlecruiser submits the selected build quantity at ${width}px`, async ({
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
      page.getByRole('link', { name: 'Build Battlecruiser', exact: true }),
    ).toBeVisible()
    await capture(
      page,
      testInfo.outputPath(`battlecruiser-catalog-${width}x900.png`),
    )
    await page
      .getByRole('link', { name: 'Build Battlecruiser', exact: true })
      .click()
    await expect(pane).toContainText('A hyperspace-powered combat ship')
    await expect(pane.locator('img').first()).toHaveAttribute(
      'src',
      /battlecruiser/,
    )
    await pane.getByText('Technical data', { exact: true }).click()
    const stats = pane.getByRole('region', {
      name: 'Ship technical statistics',
    })
    await expect(stats).toContainText('10,000')
    await expect(stats).toContainText('7,000')
    await expect(stats).toContainText('Hyperspace Drive')
    await expect(stats).toContainText('Solar Satellite')
    await expect(stats).toContainText('Cruiser')
    await expect(stats).not.toContainText('profile changes')
    await page.getByLabel('Shipyard quantity').fill('2')
    await expect(
      pane.getByRole('button', { name: 'Metal details' }),
    ).toContainText('60,000')
    await expect(
      pane.getByRole('button', { name: 'Crystal details' }),
    ).toContainText('80,000')
    await expect(
      pane.getByRole('button', { name: 'Deuterium details' }),
    ).toContainText('30,000')
    await page
      .locator('main img')
      .evaluateAll((images) =>
        Promise.all(
          images.map((image) => (image as HTMLImageElement).decode()),
        ),
      )
    await capture(
      page,
      testInfo.outputPath(`battlecruiser-details-${width}x900.png`),
    )
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
    await expect(result).toContainText('Last submitted: 2 × Battlecruiser')
    await expect(result).toContainText('Order confirmed')
  })
}

for (const width of [390, 1440]) {
  test(`Battlecruisers can be selected, quoted and launched at ${width}px`, async ({
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
                speeds: [['Battlecruiser', '25000']],
                duration_ms: 360000,
                fuel: '20000000',
                capacity: '1500000000',
                maximum_payload: '1480000000',
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
    await setDestination(page, { position: '8' })
    await page
      .getByRole('textbox', { name: 'Battlecruiser · 2 available' })
      .fill('2')
    await page
      .getByRole('button', { name: 'Review fleet', exact: true })
      .click()
    const quote = page.getByRole('region', { name: 'Fleet quote' })
    await expect(
      quote
        .getByRole('list', { name: 'Ship composition' })
        .getByRole('listitem'),
    ).toHaveText(['Battlecruiser 2'])
    await capture(
      page,
      testInfo.outputPath(`battlecruiser-fleet-quote-${width}x900.png`),
    )
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
              { owner: binding.player, ship_type: 'Battlecruiser', count: '2' },
            ],
          },
        },
      })
  })
}

for (const width of [390, 1440]) {
  test(`Battlecruiser comparison and research unlocks at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    await setup(page)
    await page.goto(`/u/andromeda/b/${body.id}/shipyard`)
    await page.locator('summary').filter({ hasText: 'Compare ships' }).click()
    for (const name of ['Light Fighter', 'Heavy Fighter'])
      await page.getByRole('checkbox', { name, exact: true }).uncheck()
    await page
      .getByRole('checkbox', { name: 'Battlecruiser', exact: true })
      .check()
    const table = page.getByRole('table', {
      name: 'Current player ship statistics · per ship',
    })
    await expect(table).toContainText('25,000')
    await expect(table).toContainText('Hyperspace Drive')
    await table.scrollIntoViewIfNeeded()
    await diagnosticScreenshot(page, {
      path: testInfo.outputPath(`battlecruiser-comparison-${width}x900.png`),
    })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    for (const slug of [
      'hyperspace-drive',
      'hyperspace-technology',
      'laser-technology',
    ]) {
      await page.goto(`/u/andromeda/b/${body.id}/research/${slug}`)
      const pane = page.getByRole('region', { name: 'Progression quote' })
      await expect(pane).toContainText('Battlecruisers')
      await expect(
        pane.getByRole('button', { name: 'Confirm research', exact: true }),
      ).toBeEnabled()
      await pane.getByText('Technical data', { exact: true }).click()
      await expect(
        pane.getByRole('link', { name: /Battlecruiser/ }),
      ).toBeVisible()
      await page
        .locator('main img')
        .evaluateAll((images) =>
          Promise.all(
            images.map((image) => (image as HTMLImageElement).decode()),
          ),
        )
      await capture(
        page,
        testInfo.outputPath(`${slug}-battlecruiser-unlock-${width}x900.png`),
      )
    }
  })
}

for (const width of [390, 1440]) {
  test(`Battlecruiser locked detail at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    await setup(page, { laser: 11 })
    await page.goto(`/u/andromeda/b/${body.id}/shipyard/battlecruiser`)
    const pane = page.getByRole('region', { name: 'Progression quote' })
    await expect(
      pane.getByRole('button', { name: 'Build', exact: true }),
    ).toBeDisabled()
    await expect(pane.getByLabel('Action blockers')).toContainText(
      'Laser Technology',
    )
    await capture(
      page,
      testInfo.outputPath(`battlecruiser-locked-${width}x900.png`),
    )
  })
}
