import { expect, test } from '@playwright/test'
import {
  binding,
  body,
  id,
  resources,
  shellFixture,
  refreshGame,
} from './fixtures/game'
import type { components } from '../src/contracts'

type S = components['schemas']
function empireFixture() {
  const now = Date.now()
  const bodies: S['BodyV3'][] = [
    {
      ...body,
      coordinates: { galaxy: 1, system: 371, position: 4 },
      amounts: {
        metal: '25216000000',
        crystal: '14380000000',
        deuterium: '8720000000',
      },
      capacity: {
        metal: '40000000000',
        crystal: '30000000000',
        deuterium: '15000000000',
      },
      fields_used: 87,
    },
    {
      ...body,
      id: id(6),
      coordinates: { galaxy: 1, system: 380, position: 8 },
      amounts: {
        metal: '17304000000',
        crystal: '7510000000',
        deuterium: '4810000000',
      },
      fields_used: 34,
      fields: 230,
      colony: {
        diameter_km: 15191,
        min_temperature: 24,
        max_temperature: 64,
        created_at: now,
        profile: 'oi-redesign-reconstructed-v1',
      },
    },
    {
      ...body,
      id: id(7),
      coordinates: { galaxy: 1, system: 402, position: 2 },
      amounts: {
        metal: '8120000000',
        crystal: '4820000000',
        deuterium: '2170000000',
      },
      fields_used: 12,
      energy: { ...body.energy, demand: '68400000' },
    },
    {
      ...body,
      id: id(8),
      kind: 'Moon',
      coordinates: { galaxy: 1, system: 371, position: 4 },
      fields_used: 5,
      fields: 41,
    },
  ]
  const fleet = (
    n: number,
    origin: number,
    target: number,
    leg: 'Outbound' | 'Returning',
    mission: S['Mission4'],
  ): S['OwnMission4'] => ({
    id: id(30 + n),
    intent: {
      origin: bodies[origin].id,
      destination: {
        type: 'Body',
        id: bodies[target].id,
        expected_kind: bodies[target].kind,
        expected_owner: binding.player,
      },
      mission,
      ships: [{ owner: binding.player, ship_type: 'SmallCargo', count: '12' }],
      cargo: { metal: '0', crystal: '0', deuterium: '0' },
      speed_percent: 100,
    },
    origin: bodies[origin].coordinates,
    destination: bodies[target].coordinates,
    leg,
    ships: [{ ship_type: 'SmallCargo', count: '12' }],
    cargo: resources,
    due_at: now + 175000 + n * 180000,
    launched_at: now - 180000,
    duration_ms: 600000,
    paid_fuel: '1000000',
    can_recall: leg === 'Outbound',
  })
  return {
    protocol: 4 as const,
    bodies,
    constructions: bodies
      .filter((b) => b.kind === 'Planet')
      .map((b, i) => ({
        id: id(50 + i),
        body: b.id,
        building: (['MetalMine', 'RoboticsFactory', 'SolarPlant'] as const)[i],
        target_level: 8 - i,
        due_at: now + (i + 1) * 240000,
        paid: resources,
      })),
    researchOperation: {
      id: id(60),
      host: body.id,
      research: 'EnergyTechnology' as const,
      source_level: 4,
      target_level: 5,
      paid: resources,
      started_at: now - 360000,
      due_at: now + 160000,
      labs: [],
      effective_lab: '5',
      can_cancel: true,
    },
    manufacturing: bodies
      .slice(0, 2)
      .map((b, i) => ({
        id: id(70 + i),
        body: b.id,
        item: {
          kind: 'Ship' as const,
          id: (['SmallCargo', 'LightFighter'] as const)[i],
        },
        quantity: '20',
        remaining: '12',
        completed_prefix: '8',
        paid: resources,
        accepted_at: now - 1800000,
        first_start_at: now - 1800000,
        next_due_at: now + 140000,
        final_due_at: now + 2340000,
        unit_duration_ms: 200000,
        state: 'Producing' as const,
        can_cancel: false as const,
      })),
    production: bodies.map((b) => ({
      body: b.id,
      settings: {
        metal_mine: 100,
        crystal_mine: 100,
        deuterium_synthesizer: 100,
        solar_plant: 100,
        fusion_reactor: 100,
        solar_satellite: 100,
      },
      settings_revision: '1',
      editable: [],
      gross_per_hour: {
        metal: '720000000',
        crystal: '360000000',
        deuterium: '160000000',
      },
      fuel_deuterium_per_hour: '0',
      net_deuterium_per_hour: {
        sign: 'Nonnegative' as const,
        magnitude: '160000000',
      },
      energy_supply: b.energy.supply,
      energy_demand: b.energy.demand,
      utilization: '1000000',
      fuel_utilization: '1000000',
    })),
    missions: {
      fleets: [
        fleet(0, 0, 1, 'Outbound', 'Transport'),
        fleet(1, 1, 2, 'Returning', 'Transport'),
        fleet(2, 0, 2, 'Outbound', 'Deploy'),
      ],
      incoming: [
        {
          sender: id(99),
          origin: { galaxy: 1, system: 400, position: 9 },
          target: body.id,
          mission: 'Attack' as const,
          arrival_at: now + 95000,
          ships: { visibility: 'Unknown' as const },
        },
      ],
      score_value_micro: '0',
      fleet_slots: '8',
    },
  }
}

test('empire shows every body, its own work and resources, and directional fleet traffic', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1672, height: 1100 })
  const options = empireFixture()
  const purchases = await shellFixture(page, options)
  await expect(page).toHaveTitle('Empire · Andromeda · Orbit Imperium')
  await expect(page.getByRole('article')).toHaveCount(4)
  const planet = page.getByRole('article', {
    name: 'Planet [1:371:4] dossier',
    exact: true,
  })
  const colony = page.getByRole('article', {
    name: 'Planet [1:380:8] dossier',
    exact: true,
  })
  const moon = page.getByRole('article', {
    name: 'Moon [1:371:4] dossier',
    exact: true,
  })
  await expect(planet).toContainText('Metal Mine · Level 8')
  await expect(colony).toContainText('Robotics Factory · Level 7')
  await expect(colony).toContainText('15191 km · 24 to 64 °C')
  await expect(moon).not.toContainText('Metal Mine · Level 8')
  await expect(planet.getByLabel('Planet resources')).toContainText('25,216')
  await expect(planet).toContainText('1 in')
  await expect(planet).toContainText('2 out')
  await expect(colony).toContainText('2 in')
  await expect(moon).toContainText('0 in')
  const traffic = page.getByRole('region', {
    name: 'Fleet movements',
    exact: true,
  })
  await expect(traffic.getByRole('listitem')).toHaveCount(4)
  await expect(traffic).toContainText('1 incoming attack detected')
  await expect(traffic).toContainText('Ship composition unknown')
  await expect(
    page.getByRole('region', { name: 'Empire research' }),
  ).toContainText('Host Planet [1:371:4]')
  await expect(colony).not.toContainText('Energy Technology')
  await page.getByText('Empire orbital network', { exact: true }).click()
  await page
    .getByRole('link', { name: 'Focus Planet [1:380:8]', exact: true })
    .click()
  await expect(page).toHaveURL(new RegExp(`/b/${id(6)}/overview$`))
  await expect(colony).toContainText('Command focus')
  await expect(page.getByRole('article')).toHaveCount(4)
  await colony.getByRole('link', { name: 'Dispatch fleet' }).click()
  await expect(page).toHaveURL(new RegExp(`/dispatch\\?body=${id(6)}$`))
  expect(purchases()).toBe(0)
})

test('desktop and phone command views keep all information readable without horizontal scrolling', async ({
  page,
}) => {
  const options = empireFixture()
  await shellFixture(page, options)
  for (const width of [1672, 1024, 768, 430, 390, 320]) {
    await page.setViewportSize({ width, height: width > 767 ? 1100 : 844 })
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.locator('main img').evaluateAll(async (images) => {
      // Screenshot preparation also loads art inside the collapsed map.
      await Promise.all(images.map((image) => {
        const img = image as HTMLImageElement
        img.loading = 'eager'
        return img.decode().catch(() => {})
      }))
    })

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    const bodies = page.getByRole('article')
    await expect(bodies).toHaveCount(4)
    for (const dossier of await bodies.all()) {
      await expect(dossier.getByLabel('Planet resources')).toBeVisible()
      expect(
        await dossier.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true)
    }
    await page.screenshot({ path: `test-results/empire-viewport-${width}.png` })
    await page.screenshot({
      path: `test-results/empire-${width}.png`,
      fullPage: true,
    })
  }
  const planet = page.getByRole('article', {
    name: 'Planet [1:371:4] dossier',
    exact: true,
  })
  await planet.locator('summary').filter({ hasText: 'Fleet traffic' }).focus()
  await page.keyboard.press('Enter')
  await expect(planet).toContainText('Ship composition unknown')
  await planet
    .locator('summary')
    .filter({ hasText: 'Orbital fleet' })
    .click()
  await expect(
    planet.getByRole('region', { name: 'Orbital fleet' }),
  ).toContainText('Small Cargo2')
  options.bodies.push({
    ...body,
    id: id(9),
    coordinates: { galaxy: 1, system: 411, position: 15 },
  })
  await refreshGame(page)
  await expect(page.getByRole('article')).toHaveCount(5)
})

test('one quiet planet, unavailable fleets and missing art remain usable', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route('**/art/**', (route) => route.abort())
  await shellFixture(page, { bodies: [body], protocol: 3 })
  await expect(page.getByRole('article')).toHaveCount(1)
  await expect(page.getByText('The lanes are quiet.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Dispatch fleet' })).toHaveCount(
    0,
  )
  await expect(
    page.getByRole('link', { name: 'Manage Planet [1:371:12]' }),
  ).toBeVisible()
  await expect(page.getByText('No research in progress.')).toBeVisible()
})

test('a large empire keeps every network target reachable and phone movements expandable', async ({
  page,
}) => {
  const options = empireFixture()
  options.bodies = Array.from({ length: 16 }, (_, i) => ({
    ...body,
    id: i === 0 ? body.id : id(100 + i),
    coordinates: { galaxy: 1, system: 371 + i, position: (i % 15) + 1 },
  }))
  await page.setViewportSize({ width: 1440, height: 1000 })
  await shellFixture(page, options)
  await page.getByText('Empire orbital network', { exact: true }).click()
  const map = page.getByRole('region', { name: 'Empire orbital network' })
  await expect(map.getByRole('link', { name: /^Focus/ })).toHaveCount(16)
  const last = map.getByRole('link', {
    name: 'Focus Planet [1:386:1]',
    exact: true,
  })
  await last.focus()
  await expect(last).toBeInViewport()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(new RegExp(`/b/${id(115)}/overview$`))
  await expect(page.getByRole('article')).toHaveCount(16)
  await page.setViewportSize({ width: 390, height: 844 })
  const board = page.getByRole('region', {
    name: 'Fleet movements',
    exact: true,
  })
  await expect(board.getByRole('list')).toBeHidden()
  await board.getByRole('button', { name: 'Show 4 fleet movements' }).click()
  await expect(board.getByRole('listitem')).toHaveCount(4)
  await expect(board.getByText('Ship composition unknown')).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
})
