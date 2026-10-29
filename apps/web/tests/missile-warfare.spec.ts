import { readFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { test, expect } from './fixtures/test'
import { shellFixture, body, binding, id } from './fixtures/game'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import type { components } from '../src/contracts'
type S = components['schemas']
const content = JSON.parse(
  readFileSync('rules/content/missile-warfare.json', 'utf8'),
)
const baseline = JSON.parse(readFileSync('rules/mvp-v1-slice-13.json', 'utf8'))
const target = {
  id: id(20),
  expected_kind: 'Planet' as const,
  expected_owner: id(21),
}
const at = { galaxy: 1, system: 371, position: 3 }
const hash = 'b'.repeat(64)
async function setup(page: Parameters<typeof shellFixture>[0]) {
  const commands: S['Command4'][] = []
  const now = Date.now()
  const missileBody = {
    ...body,
    amounts: {
      metal: '900000000000',
      crystal: '900000000000',
      deuterium: '900000000000',
    },
    levels: { ...body.levels, MissileSilo: 4, Shipyard: 1 },
    silo: { occupied: '26', reserved: '2', total: '40' },
    inventories: [
      ...body.inventories,
      {
        item: {
          kind: 'Missile' as const,
          id: 'InterplanetaryMissile' as const,
        },
        count: '10',
      },
      {
        item: { kind: 'Missile' as const, id: 'AntiBallisticMissile' as const },
        count: '6',
      },
    ],
  }
  await shellFixture(page, {
    protocol: 4,
    bodies: [missileBody],
    catalog: baseline.catalog.map((e: S['CatalogEntry3']) =>
      e.key.kind === 'Missile'
        ? { ...e, enabled: true, requirements: content[e.key.id].requirements }
        : e.key.id === 'MissileSilo'
          ? { ...e, enabled: true, requirements: content.requirements }
          : e,
    ),
    research: [{ research: 'ImpulseDrive', level: 5 }],
    extraCapabilities: ['Missiles', 'Attack', 'Reports'],
    missiles: [
      {
        id: id(51),
        attacker: binding.player,
        origin: body.coordinates,
        target: at,
        target_body: target.id,
        target_kind: 'Planet',
        count: '2',
        arrival_at: now + 60000,
        outgoing: true,
      },
      {
        id: id(50),
        attacker: target.expected_owner,
        origin: at,
        target: body.coordinates,
        target_body: body.id,
        target_kind: 'Planet',
        count: '3',
        arrival_at: now + 90000,
        outgoing: false,
      },
    ],
    manufacturing: [
      {
        id: id(60),
        body: body.id,
        item: { kind: 'Missile', id: 'AntiBallisticMissile' },
        quantity: '2',
        completed_prefix: '0',
        remaining: '2',
        paid: { metal: '16000000000', crystal: '0', deuterium: '4000000000' },
        accepted_at: now,
        first_start_at: now,
        next_due_at: now + 60000,
        final_due_at: now + 120000,
        unit_duration_ms: 60000,
        state: 'Producing',
        can_cancel: false,
      },
    ],
    missions: {
      fleets: [
        {
          id: id(52),
          intent: {
            origin: body.id,
            destination: { type: 'Body', ...target },
            mission: 'Transport',
            ships: [
              { owner: binding.player, ship_type: 'SmallCargo', count: '1' },
            ],
            cargo: { metal: '0', crystal: '0', deuterium: '0' },
            speed_percent: 100,
          },
          origin: body.coordinates,
          destination: at,
          leg: 'Outbound',
          ships: [{ ship_type: 'SmallCargo', count: '1' }],
          cargo: { metal: '0', crystal: '0', deuterium: '0' },
          due_at: now + 30000,
          launched_at: now - 30000,
          duration_ms: 60000,
          paid_fuel: '1000000',
          can_recall: true,
        },
      ],
      incoming: [
        {
          sender: target.expected_owner,
          origin: at,
          target: body.id,
          mission: 'Attack',
          arrival_at: now + 120000,
          ships: { visibility: 'Unknown' },
        },
      ],
      score_value_micro: '0',
      fleet_slots: '1',
    },
  })
  await page.route('**/progression-options', async (route) => {
    const { context, request } = route.request().postDataJSON()
    const manufacture = request.type === 'Manufacture'
    const cost = manufacture
      ? (content[request.item.id]?.cost ?? {
          metal: 2000,
          crystal: 0,
          deuterium: 0,
        })
      : { metal: 320000, crystal: 320000, deuterium: 16000 }
    const unit = Object.fromEntries(
      Object.entries(cost).map(([k, v]) => [k, String(Number(v) * 1000000)]),
    )
    const quantity = manufacture ? BigInt(request.quantity) : 1n
    const capacity =
      manufacture &&
      request.item.kind === 'Missile' &&
      quantity * BigInt(request.item.id === 'InterplanetaryMissile' ? 2 : 1) >
        12n
    await route.fulfill({
      json: {
        protocol: 4,
        binding,
        request_id: context.request_id,
        viewer_revision: '1',
        sampled_at: now,
        as_of_ms: now,
        request,
        terms: manufacture
          ? {
              type: 'Manufacture',
              silo_slots:
                request.item.kind === 'Missile'
                  ? request.item.id === 'InterplanetaryMissile'
                    ? 2
                    : 1
                  : undefined,
              profile_hash: 'a'.repeat(64),
              body: body.id,
              item: request.item,
              quantity: request.quantity,
              unit_cost: unit,
              paid: Object.fromEntries(
                Object.entries(unit).map(([k, v]) => [
                  k,
                  (BigInt(v) * quantity).toString(),
                ]),
              ),
              unit_duration_ms: 60000,
              formula: 'ManufactureClassic',
              facilities: [{ building: 'Shipyard', level: 1 }],
            }
          : {
              type: 'Building',
              profile_hash: 'a'.repeat(64),
              body: body.id,
              building: request.building,
              action: request.type,
              source_level: 4,
              target_level: request.type === 'Upgrade' ? 5 : 3,
              paid: unit,
              duration_ms: 60000,
              formula: 'BuildingRedesign2011',
              facilities: [],
              required_energy: '0',
              reserve_fields: 1,
            },
        terms_hash: hash,
        blockers: capacity
          ? [
              {
                code: 'CapacityReserved',
                requirement: null,
                required: null,
                actual: null,
                resource: null,
                unit: null,
              },
            ]
          : [],
        estimates: { first_start_at: now, final_due_at: now + 60000 },
      },
    })
  })
  await page.route('**/world', async (route) => {
    const q = route.request().postDataJSON()
    const common = {
      protocol: 4,
      binding,
      request_id: q.context.request_id,
      viewer_revision: '1',
      sampled_at: now,
      as_of_ms: now,
    }
    if (q.type === 'MissileQuote')
      return route.fulfill({
        json: {
          ...common,
          data: {
            intent: q.intent,
            source_coordinates: body.coordinates,
            target_coordinates: at,
            interceptor_body: target.id,
            distance: 0,
            range: 24,
            duration_ms: 6000,
            weapons: 0,
            speed: 5,
            rules: content.rules,
            profile_hash: 'a'.repeat(64),
            terms_hash: hash,
          },
        },
      })
    await route.fulfill({
      json: {
        ...common,
        data: {
          galaxy: 1,
          system: 371,
          observed_at: now,
          positions: Array.from({ length: 15 }, (_, index) =>
            index === 2
              ? {
                  coordinates: at,
                  body: {
                    id: target.id,
                    kind: 'Planet',
                    owner: target.expected_owner,
                    name: 'Bastion',
                    activity: { type: 'None' },
                    inactivity: 'Active',
                    vacation: false,
                    attack_blocker: null,
                    espionage_eligible: true,
                  },
                  debris: null,
                }
              : {
                  coordinates: { galaxy: 1, system: 371, position: index + 1 },
                  body: null,
                  debris: null,
                },
          ),
        },
      },
    })
  })
  await page.route('**/commands', async (route) => {
    const pair = route.request().postDataJSON()
    const e = pair.gameplay ?? pair
    commands.push(e.command)
    await route.fulfill({
      json: {
        protocol: 4,
        binding,
        command_id: e.command_id,
        admitted_at: now,
        executed_at: now,
        status: 'Committed',
        result_ids: [id(88)],
        minimum_viewer_revision: '1',
      },
    })
  })
  const payload: S['MissileImpactPayload4'] = {
    kind: 'MissileImpact',
    at: now,
    attacker: target.expected_owner,
    origin: at,
    target: body.coordinates,
    target_kind: 'Planet',
    outcome: 'Impacted',
    sent: '8',
    intercepted: '6',
    penetrating: '2',
    destroyed: { RocketLauncher: '120' },
    primary: 'RocketLauncher',
    interceptors_spent: '6',
    interceptors_remaining: '0',
  }
  const {
    at: _at,
    primary: _primary,
    interceptors_spent: _spent,
    interceptors_remaining: _remaining,
    ...preview
  } = payload
  const header = {
    id: id(70),
    kind: 'MissileImpact',
    observed_at: now,
    read: false,
    hidden: false,
    preview,
  }
  await page.route('**/api/**/reports', async (route) => {
    const { context } = route.request().postDataJSON()
    await route.fulfill({
      json: {
        protocol: 4,
        binding,
        request_id: context.request_id,
        viewer_revision: '1',
        sampled_at: now,
        as_of_ms: now,
        data: {
          items: [header],
          next_cursor: null,
          has_more: false,
          as_of_ms: now,
        },
      },
    })
  })
  await page.route(`**/api/**/reports/${id(70)}*`, async (route) => {
    const context = route.request().postDataJSON()
    await route.fulfill({
      json: {
        protocol: 4,
        binding,
        request_id: context.request_id,
        viewer_revision: '1',
        sampled_at: now,
        as_of_ms: now,
        data: { header, payload },
      },
    })
  })
  return { commands }
}
for (const width of [1440, 390])
  test(`missile inventory launch and reports at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    const { commands } = await setup(page)
    const capture = async (name: string) => {
      await page.evaluate(() =>
        window.scrollTo({ top: 0, behavior: 'instant' }),
      )
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
      mkdirSync('test-results/missile-screenshots', { recursive: true })
      await diagnosticScreenshot(page, {
        path: resolve(
          `test-results/missile-screenshots/${name}-${width}x900.png`,
        ),
        fullPage: true,
      })
    }
    await page.goto(`/u/andromeda/b/${body.id}/overview`)
    await expect(
      page.getByRole('region', { name: 'Fleet movements' }),
    ).toContainText('Missile attack')
    await capture('empire-warning')
    await page.goto(`/u/andromeda/b/${body.id}/defense`)
    await expect(
      page.getByRole('region', { name: 'Missile silo capacity' }),
    ).toContainText('Reserved in queue')
    await expect(
      page.getByText('Interplanetary Missile', { exact: true }).first(),
    ).toBeVisible()
    await capture('defense-catalog')
    for (const slug of ['anti-ballistic-missile', 'interplanetary-missile']) {
      await page.goto(`/u/andromeda/b/${body.id}/defense/${slug}`)
      const pane = page.getByRole('region', { name: 'Progression quote' })
      await expect(
        pane.getByRole('button', { name: 'Build', exact: true }),
      ).toBeVisible()
      await page.getByLabel('Defenses quantity').fill('2')
      await expect(
        pane.getByRole('button', { name: 'Build', exact: true }),
      ).toBeEnabled()
      await capture(slug)
      if (slug === 'interplanetary-missile') {
        await page.getByLabel('Defenses quantity').fill('20')
        await expect(
          pane.getByRole('button', { name: 'Build', exact: true }),
        ).toBeDisabled()
        await page.getByLabel('Defenses quantity').fill('2')
        await pane.getByRole('button', { name: 'Build', exact: true }).click()
        await expect
          .poll(() =>
            commands.some(
              (c) =>
                c.type === 'StartManufacture' &&
                c.item.kind === 'Missile' &&
                c.quantity === '2',
            ),
          )
          .toBe(true)
        await pane
          .getByText('Scrap Interplanetary Missile', { exact: true })
          .click()
        await page.getByLabel('Scrap quantity').fill('1')
        await page.getByRole('button', { name: 'Scrap without refund' }).click()
        await expect(
          page.getByText('Missiles scrapped.', { exact: true }),
        ).toBeVisible()
      }
    }
    await page.goto(`/u/andromeda/b/${body.id}/facilities/missile-silo`)
    await expect(
      page.getByRole('region', { name: 'Missile silo capacity' }),
    ).toBeVisible()
    await capture('silo-details')
    await page.goto(`/u/andromeda/b/${body.id}/galaxy`)
    await expect(
      page.getByRole('button', {
        name: 'Launch missiles at [1:371:3]',
        exact: true,
      }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', {
        name: 'Launch missiles at [1:371:3]',
        exact: true,
      }),
    ).toBeVisible()
    await page
      .getByRole('button', {
        name: 'Launch missiles at [1:371:3]',
        exact: true,
      })
      .click()
    await page.getByLabel('Missile quantity', { exact: true }).fill('2')
    await page
      .getByLabel('Primary defense', { exact: true })
      .selectOption('RocketLauncher')
    await page.getByRole('button', { name: 'Review missile launch' }).click()
    await expect(
      page.getByRole('button', { name: 'Launch missiles — no recall' }),
    ).toBeEnabled()
    await capture('launch-review')
    await page
      .getByRole('button', { name: 'Launch missiles — no recall' })
      .click()
    await expect(
      page.getByText('Missiles launched. Track their arrival in Fleets.'),
    ).toBeVisible()
    expect(
      commands.filter(
        (c) => c.type === 'World' && c.action.type === 'LaunchMissiles',
      ),
    ).toHaveLength(1)
    const launch = commands.find(
      (c) => c.type === 'World' && c.action.type === 'LaunchMissiles',
    ) as Extract<S['Command4'], { type: 'World' }>
    expect(launch.action).toMatchObject({
      type: 'LaunchMissiles',
      intent: { count: '2', primary: 'RocketLauncher', target },
    })
    await page.goto(`/u/andromeda/b/${body.id}/fleets`)
    await expect(
      page.getByRole('region', { name: 'Incoming fleets' }),
    ).toContainText('Incoming missile attack')
    await expect(
      page.getByRole('region', { name: 'Missile flights' }),
    ).toHaveCount(0)
    await expect(
      page.getByText('No active fleets.', { exact: true }),
    ).toHaveCount(0)
    await expect(
      page.getByText('No visible incoming fleets.', { exact: true }),
    ).toHaveCount(0)
    await expect(
      page.getByRole('article', { name: 'Outgoing missile attack' }),
    ).toContainText('Cannot be recalled.')
    await expect(
      page
        .getByRole('article', { name: 'Outgoing missile attack' })
        .getByRole('button', { name: /recall/i }),
    ).toHaveCount(0)
    expect(
      await page
        .locator('main article[aria-label]')
        .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('aria-label'))),
    ).toEqual([
      'Transport fleet',
      'Outgoing missile attack',
      'Incoming missile attack',
      'Incoming attack fleet',
    ])
    await expect(
      page.getByText('Fleet slots: 1 used / 1 total', { exact: true }),
    ).toBeVisible()
    await capture('incoming-missiles')
    await page
      .getByRole('article', { name: 'Outgoing missile attack' })
      .getByRole('link', { name: 'Mission details' })
      .click()
    await expect(
      page.getByRole('article', { name: 'Outgoing missile attack' }),
    ).toBeVisible()
    await expect(
      page.getByText('Fleet unavailable.', { exact: true }),
    ).toHaveCount(0)
    await expect(
      page.getByRole('region', { name: 'Incoming fleets' }),
    ).toHaveCount(0)
    await capture('missile-mission-details')
    await page.goto(`/u/andromeda/b/${body.id}/reports`)
    await expect(page.getByText('6 intercepted · 2 penetrated')).toBeVisible()
    await capture('report-list')
    await page.goto(`/u/andromeda/b/${body.id}/reports/${id(70)}`)
    await expect(
      page.getByRole('region', { name: 'Missile impact report' }),
    ).toContainText('Permanently destroyed defenses')
    await expect(
      page.getByRole('region', { name: 'Missile impact report' }),
    ).toContainText('Your interceptors remaining')
    await capture('impact-report')
  })

test('missile action columns preserve exact row edges across tablet breakpoints', async ({
  page,
}) => {
  await setup(page)
  await page.goto(`/u/andromeda/b/${body.id}/galaxy`)
  for (const width of [390, 600, 767, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    const rows = page
      .getByRole('region', { name: 'Galaxy positions' })
      .getByRole('article')
    await expect(rows).toHaveCount(15)
    const bounds = await rows.evaluateAll((elements) =>
      elements.map((el) => ({
        left: el.getBoundingClientRect().left,
        right: el.getBoundingClientRect().right,
        action: el
          .querySelector('button[aria-label^="Actions for"]')!
          .getBoundingClientRect().left,
      })),
    )
    expect(new Set(bounds.map((b) => b.action)).size).toBe(1)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width)
    if (width <= 767)
      for (const b of bounds) {
        expect(b.left).toBe(0)
        expect(b.right).toBe(width)
      }
    await expect(
      page.getByRole('button', {
        name: 'Launch missiles at [1:371:3]',
        exact: true,
      }),
    ).toBeVisible()
  }
})
