import { test, expect, type Page } from './fixtures/test'
import { installGameFixture, body, binding, refreshGame } from './fixtures/game'
import { captureCatalog } from './fixtures/catalog-capture'
import type { components } from '../src/contracts'

type S = components['schemas']
const cases = [
  {
    page: 'facilities',
    kind: 'Building',
    ids: ['RoboticsFactory', 'ResearchLab', 'Shipyard', 'NaniteFactory'],
    name: 'Upgrade Robotics Factory',
  },
  {
    page: 'research',
    kind: 'Research',
    ids: [
      'EnergyTechnology',
      'CombustionDrive',
      'LaserTechnology',
      'HyperspaceTechnology',
    ],
    name: 'Research Energy Technology',
  },
  {
    page: 'shipyard',
    kind: 'Ship',
    ids: ['SmallCargo', 'LightFighter', 'Cruiser', 'Dreadnought'],
    name: 'Build Small Cargo',
  },
  {
    page: 'defense',
    kind: 'Defense',
    ids: ['SmallShieldDome', 'RocketLauncher', 'HeavyLaser', 'LargeShieldDome'],
    name: 'Build Small Shield Dome',
  },
] as const

async function fixture(page: Page, scenario: (typeof cases)[number]) {
  const now = Date.now()
  await page.clock.install({ time: now })
  const planet = structuredClone(body)
  planet.amounts = {
    metal: '59999999',
    crystal: '15000000',
    deuterium: '10000000',
  }
  const research: S['Research3'][] = [
    { research: 'EnergyTechnology', level: 1 },
  ]
  const inspections: S['QuoteRequest3'][] = []
  const catalog = scenario.ids.map((id, index) => ({
    key: { kind: scenario.kind, id } as S['CatalogEntry3']['key'],
    requirements:
      index === 2
        ? [
            {
              type: 'BodyBuilding' as const,
              building: 'ResearchLab' as const,
              level: 9,
            },
          ]
        : [],
    enabled: index !== 3,
    mobile: scenario.kind === 'Ship',
    body_kinds: ['Planet' as const],
  }))
  const options = {
    bodies: [planet],
    catalog,
    research,
    sampledAt: now,
    researchOperation: null as S['ResearchOperationDto'] | null,
  }
  await installGameFixture(page, options)
  await page.route('**/progression-options', async (route) => {
    const { context, request } = route.request().postDataJSON()
    inspections.push(request)
    const id = request.building ?? request.research ?? request.item.id
    const cost = {
      metal: id === scenario.ids[1] ? '1000000' : '60000000',
      crystal: '15000000',
      deuterium: '10000000',
    }
    const common = { profile_hash: 'a'.repeat(64), paid: cost }
    const level =
      request.type === 'Research'
        ? (research.find((r) => r.research === request.research)?.level ?? 0)
        : (planet.levels[request.building as keyof typeof planet.levels] ?? 0)
    if (request.type === 'Research' && level > 1) cost.metal = '120000000'
    const terms =
      request.type === 'Research'
        ? {
            ...common,
            type: 'Research',
            host: request.host,
            research: request.research,
            source_level: level,
            target_level: level + 1,
            duration_ms: 60000,
            formula: 'ResearchClassic',
            labs: [],
            effective_lab: '1',
            required_energy: '0',
          }
        : request.type === 'Manufacture'
          ? {
              ...common,
              type: 'Manufacture',
              body: request.body,
              item: request.item,
              quantity: request.quantity,
              unit_cost: cost,
              unit_duration_ms: 30000,
              formula: 'ManufactureClassic',
              facilities: [],
            }
          : {
              ...common,
              type: 'Building',
              body: request.body,
              building: request.building,
              action: 'Upgrade',
              source_level: level,
              target_level: level + 1,
              duration_ms: 60000,
              formula: 'BuildingRedesign2011',
              facilities: [],
              required_energy: '0',
              reserve_fields: 1,
            }
    await route.fulfill({
      json: {
        protocol: 3,
        binding,
        request_id: context.request_id,
        viewer_revision: '1',
        sampled_at: now,
        as_of_ms: now,
        request,
        terms,
        terms_hash: 'b'.repeat(64),
        blockers: [],
        estimates: null,
      },
    })
  })
  return { planet, research, inspections, options, now }
}

for (const scenario of cases) {
  for (const width of [390, 1440]) {
    test(`${scenario.page} hatching follows exact live balances at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      const state = await fixture(page, scenario)
      await page.goto(`/u/andromeda/b/${body.id}/${scenario.page}`)
      const tile = page.getByRole('link', { name: scenario.name, exact: true })
      await expect(tile).toHaveAttribute('title', /Not enough resources/)
      await expect(tile).toHaveClass(/unaffordable/)
      await expect(page.locator('a[class*="locked"]')).not.toHaveClass(
        /unaffordable/,
      )
      await expect(page.locator('a[class*="unavailable"]')).not.toHaveClass(
        /unaffordable/,
      )
      await captureCatalog(
        page,
        `test-results/affordability-${scenario.page}-${width}.png`,
      )
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
      const queries = state.inspections.length
      // A clock tick and balance-only refresh must not re-fetch server costs.
      await page.clock.fastForward(1000)
      state.planet.amounts.metal = '60000000'
      await refreshGame(page)
      await expect(tile).not.toHaveClass(/unaffordable/)
      for (const resource of ['metal', 'crystal', 'deuterium'] as const) {
        const exact = state.planet.amounts[resource]
        state.planet.amounts[resource] = (BigInt(exact) - 1n).toString()
        await refreshGame(page)
        await expect(tile).toHaveClass(/unaffordable/)
        state.planet.amounts[resource] = exact
        await refreshGame(page)
        await expect(tile).not.toHaveClass(/unaffordable/)
      }
      expect(state.inspections).toHaveLength(queries)
      // Fresh loading must recover the same affordability after reconnect/reload.
      state.planet.amounts.metal = '59999999'
      await page.reload()
      await expect(tile).toHaveClass(/unaffordable/)
    })
  }
}

test('research progress suppresses hatching and completion refreshes next-level cost', async ({
  page,
}) => {
  const state = await fixture(page, cases[1])
  await page.goto(`/u/andromeda/b/${body.id}/research`)
  const tile = page.getByRole('link', { name: cases[1].name, exact: true })
  await expect(tile).toHaveClass(/unaffordable/)
  state.options.researchOperation = {
    id: '00000000-0000-4000-8000-000000000090',
    host: body.id,
    research: 'EnergyTechnology',
    source_level: 1,
    target_level: 2,
    paid: state.planet.amounts,
    started_at: state.now,
    due_at: state.now + 60000,
    labs: [],
    effective_lab: '1',
    can_cancel: true,
  }
  await refreshGame(page)
  await expect(tile.getByLabel('Research progress')).toBeVisible()
  await expect(tile).not.toHaveClass(/unaffordable/)
  state.options.researchOperation = null
  state.research[0].level = 2
  state.planet.amounts.metal = '60000000'
  await refreshGame(page)
  await expect(tile.getByLabel('Research progress')).toHaveCount(0)
  await expect(tile).toHaveClass(/unaffordable/)
  state.planet.amounts.metal = '120000000'
  await refreshGame(page)
  await expect(tile).not.toHaveClass(/unaffordable/)
})
