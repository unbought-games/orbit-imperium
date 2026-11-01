import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { readFileSync, mkdirSync } from 'node:fs'
import { test, expect } from './fixtures/test'
import { installGameFixture, body, binding, id } from './fixtures/game'
import { setDestination } from './fixtures/coordinates'
import type { components } from '../src/contracts'
type S = components['schemas']
const now = 1793486400000
const catalog: S['CatalogEntry3'][] = JSON.parse(
  readFileSync('rules/mvp-v1-slice-13.json', 'utf8'),
).catalog.map((e: S['CatalogEntry3']) =>
  e.key.id === 'AllianceDepot' ? { ...e, enabled: true, requirements: [] } : e,
)
async function shot(
  page: Parameters<typeof installGameFixture>[0],
  name: string,
  width: number,
) {
  mkdirSync('test-results/depot', { recursive: true })
  if (name.startsWith('fleets-supply')) {
    await page
      .getByRole('region', { name: 'Allied defense' })
      .evaluate((element) =>
        window.scrollTo({
          top: window.scrollY + element.getBoundingClientRect().top - 80,
          behavior: 'instant',
        }),
      )
  } else
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  )
  return diagnosticScreenshot(page, {
    path: `test-results/depot/${name}-${width}x900.png`,
    fullPage: !name.startsWith('fleets-supply') && !name.endsWith('review'),
  })
}
for (const width of [390, 1440]) {
  test(`allied defense supply and recall ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.clock.setFixedTime(now)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    let revision = 1
    const planet = {
      ...structuredClone(body),
      name: 'Hades',
      levels: { ...body.levels, AllianceDepot: 1 },
      amounts: {
        metal: '100000000000',
        crystal: '100000000000',
        deuterium: '100000000000',
      },
    }
    const holdings: S['HeldFleetView4'][] = [
      {
        id: id(81),
        owner: id(90),
        target: body.id,
        ships: [{ ship_type: 'LightFighter', count: '1000' }],
        departure_at: now + 3600000,
        can_supply: true,
      },
    ]
    const depots: S['DepotView4'][] = [
      {
        body: body.id,
        remaining_budget: '10000000000',
        next_budget_release_at: null,
      },
    ]
    const own: S['OwnMission4'] = {
      id: id(82),
      intent: {
        origin: body.id,
        destination: {
          type: 'Body',
          id: id(83),
          expected_kind: 'Planet',
          expected_owner: id(90),
        },
        mission: 'Hold',
        hold_hours: 2,
        ships: [{ owner: binding.player, ship_type: 'SmallCargo', count: '2' }],
        cargo: { metal: '0', crystal: '0', deuterium: '0' },
        speed_percent: 100,
      },
      origin: body.coordinates,
      destination: { galaxy: 1, system: 3, position: 8 },
      leg: 'Holding',
      ships: [{ ship_type: 'SmallCargo', count: '2' }],
      cargo: { metal: '0', crystal: '0', deuterium: '0' },
      due_at: now + 7200000,
      launched_at: now - 3600000,
      duration_ms: 120000,
      paid_fuel: '50000000',
      can_recall: true,
    }
    await installGameFixture(page, {
      protocol: 4,
      catalog,
      bodies: [planet],
      holdings,
      depots,
      missions: {
        fleets: [own],
        incoming: [],
        score_value_micro: '0',
        fleet_slots: '5',
      },
      sampledAt: now,
      extraCapabilities: ['Hold'],
      viewerRevision: () => String(revision),
      playerNames: { [id(90)]: 'Cassiopeia' },
    })
    let supplies = 0,
      recalls = 0
    await page.route('**/world', async (route) => {
      const r = route.request().postDataJSON()
      if (r.type !== 'DepotSupplyQuote') return route.fallback()
      expect(r.intent).toEqual({
        source_planet: body.id,
        fleet: id(81),
        deuterium: '4000000000',
      })
      await route.fulfill({
        json: {
          protocol: 4,
          binding,
          request_id: r.context.request_id,
          viewer_revision: String(revision),
          sampled_at: now,
          as_of_ms: now,
          data: {
            intent: r.intent,
            profile_hash: 'a'.repeat(64),
            terms_hash: 'b'.repeat(64),
            rate_micro_per_hour: '2000000000',
            extension_ms: 7200000,
            departure_at: now + 10800000,
            remaining_budget: depots[0].remaining_budget,
            available_deuterium: planet.amounts.deuterium,
            next_budget_release_at: null,
          },
        },
      })
    })
    await page.route('**/commands', async (route) => {
      const pair = route.request().postDataJSON(),
        action = pair.gameplay.command.action
      expect(pair.presence.command.action.body).toBe(body.id)
      if (action.type === 'SupplyHoldingFleet') {
        supplies++
        expect(action.intent.deuterium).toBe('4000000000')
        holdings[0].departure_at = now + 10800000
        depots[0].remaining_budget = '6000000000'
        depots[0].next_budget_release_at = now + 3600000
      } else {
        expect(action.type).toBe('RecallMission')
        recalls++
        own.leg = 'Returning'
        own.can_recall = false
        own.due_at = now + 120000
      }
      revision++
      await route.fulfill({
        json: {
          protocol: 4,
          binding,
          command_id: pair.gameplay.command_id,
          admitted_at: now,
          executed_at: now,
          status: 'Committed',
          result_ids: [],
          minimum_viewer_revision: String(revision),
        },
      })
    })
    await page.goto(`/u/andromeda/b/${body.id}/overview`)
    await expect(
      page.getByRole('heading', { name: 'Hades', exact: true }).first(),
    ).toBeVisible()
    await shot(page, 'empire-holding', width)
    await page.goto(`/u/andromeda/b/${body.id}/fleets`)
    await expect(
      page.getByRole('heading', { name: 'Hold Holding' }),
    ).toBeVisible()
    await expect(page.getByText('Departs in', { exact: true })).toBeVisible()
    await page
      .getByRole('button', { name: 'Supply fleet', exact: true })
      .click()
    await page
      .getByRole('textbox', { name: 'Deuterium to supply' })
      .fill('4000')
    await page
      .getByRole('button', { name: 'Review supply', exact: true })
      .click()
    await expect(
      page.getByText('Additional defense', { exact: true }),
    ).toBeVisible()
    await shot(page, 'fleets-supply-review', width)
    await page
      .getByRole('button', { name: 'Supply deuterium', exact: true })
      .click()
    await expect(
      page.getByRole('status').filter({ hasText: 'Supply delivered' }),
    ).toBeVisible()
    expect(supplies).toBe(1)
    await shot(page, 'fleets-supply-delivered', width)
    await page
      .getByRole('button', { name: 'Review recall', exact: true })
      .click()
    await expect(
      page.getByText(/return leg uses the original flight duration/),
    ).toBeVisible()
    await shot(page, 'holding-recall-review', width)
    await page
      .getByRole('button', { name: 'Recall fleet', exact: true })
      .click()
    await expect(
      page.getByRole('heading', { name: 'Hold Returning' }),
    ).toBeVisible()
    expect(recalls).toBe(1)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width)
  })
  test(`hold dispatch quote ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.clock.setFixedTime(now)
    const planet = {
      ...structuredClone(body),
      inventories: [
        {
          item: { kind: 'Ship' as const, id: 'SmallCargo' as const },
          count: '2',
        },
      ],
    }
    await installGameFixture(page, {
      protocol: 4,
      bodies: [planet],
      catalog,
      extraCapabilities: ['Hold', 'Transport'],
      sampledAt: now,
      missions: {
        fleets: [],
        incoming: [],
        score_value_micro: '0',
        fleet_slots: '3',
      },
    })
    await page.route('**/world', async (route) => {
      const r = route.request().postDataJSON()
      let data: unknown
      if (r.type === 'Galaxy')
        data = {
          galaxy: r.galaxy,
          system: r.system,
          observed_at: now,
          positions: Array.from({ length: 15 }, (_, i) => ({
            coordinates: {
              galaxy: r.galaxy,
              system: r.system,
              position: i + 1,
            },
            body:
              i === 7
                ? {
                    id: id(90),
                    owner: id(91),
                    kind: 'Planet',
                    name: 'Orion',
                    vacation: false,
                    inactivity: 'Active',
                    activity: { type: 'None' },
                    espionage_eligible: true,
                  }
                : null,
            debris: null,
          })),
        }
      else if (r.type === 'ResolveDestination')
        data = {
          type: 'Body',
          id: id(90),
          expected_kind: 'Planet',
          expected_owner: id(91),
        }
      else
        data = {
          intent: r.intent,
          profile_hash: 'a'.repeat(64),
          terms_hash: 'b'.repeat(64),
          distance: 1020,
          speeds: [['SmallCargo', '5000']],
          duration_ms: 120000,
          fuel: '104000000',
          capacity: '5000000000',
          maximum_payload: '4896000000',
          slot_limit: '3',
          ...(r.intent.mission === 'Hold'
            ? {
                holding: {
                  duration_ms: r.intent.hold_hours * 3600000,
                  rates: { SmallCargo: 10 },
                  fuel: String(r.intent.hold_hours * 1000000),
                },
              }
            : {}),
        }
      await route.fulfill({
        json: {
          protocol: 4,
          binding,
          request_id: r.context.request_id,
          viewer_revision: '1',
          sampled_at: now,
          as_of_ms: now,
          data,
        },
      })
    })
    let launched = 0
    await page.route('**/commands', async (route) => {
      const pair = route.request().postDataJSON()
      expect(pair.gameplay.command.action.intent.hold_hours).toBe(4)
      launched++
      await route.fulfill({
        json: {
          protocol: 4,
          binding,
          command_id: pair.gameplay.command_id,
          admitted_at: now,
          executed_at: now,
          status: 'Committed',
          result_ids: [id(87)],
          minimum_viewer_revision: '1',
        },
      })
    })
    await page.goto(`/u/andromeda/b/${body.id}/dispatch`)
    await page.getByRole('radio', { name: 'Hold', exact: true }).check()
    await page
      .getByRole('combobox', { name: 'Holding duration', exact: true })
      .click()
    await page.getByRole('option', { name: '4 hours', exact: true }).click()
    await setDestination(page, { galaxy: '1', system: '2', position: '8' })
    await page
      .getByRole('textbox', { name: 'Small Cargo · 2 available' })
      .fill('1')
    await expect(page.getByText('Orion', { exact: true }).first()).toBeVisible()
    await expect(
      page.getByRole('region', { name: 'Flight timing' }),
    ).toContainText('2m')
    await shot(page, 'hold-dispatch', width)
    await page
      .getByRole('button', { name: 'Review fleet', exact: true })
      .click()
    await expect(
      page.getByRole('region', { name: 'Fleet quote' }),
    ).toBeVisible()
    await expect(
      page.getByText('Prepaid holding', { exact: true }),
    ).toBeVisible()
    await shot(page, 'hold-dispatch-review', width)
    await page.getByRole('button', { name: /Defend with/ }).click()
    await expect.poll(() => launched).toBe(1)
  })
}

for (const width of [390, 1440]) {
  test(`Depot facility construction ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.clock.setFixedTime(now)
    const planet = {
      ...structuredClone(body),
      levels: { ...body.levels, AllianceDepot: 0 },
      amounts: {
        metal: '100000000000',
        crystal: '100000000000',
        deuterium: '100000000000',
      },
    }
    const constructions: S['Construction3'][] = []
    let revision = 1
    await installGameFixture(page, {
      protocol: 4,
      catalog,
      bodies: [planet],
      constructions,
      sampledAt: now,
      extraCapabilities: ['Hold'],
      viewerRevision: () => String(revision),
      missions: {
        fleets: [],
        incoming: [],
        score_value_micro: '0',
        fleet_slots: '3',
      },
    })
    const { routeProgressionOptions } = await import(
      './fixtures/progression-options'
    )
    await routeProgressionOptions(page, (route) => {
      const { context, request } = route.request().postDataJSON()
      if (request.building !== 'AllianceDepot') return route.fallback()
      return route.fulfill({
        json: {
          protocol: 4,
          binding,
          request_id: context.request_id,
          viewer_revision: String(revision),
          sampled_at: now,
          as_of_ms: now,
          request,
          terms_hash: 'b'.repeat(64),
          estimates: null,
          blockers: [],
          terms: {
            type: 'Building',
            profile_hash: 'a'.repeat(64),
            body: body.id,
            building: 'AllianceDepot',
            action: request.type,
            source_level: 0,
            target_level: 1,
            paid: {
              metal: '20000000000',
              crystal: '40000000000',
              deuterium: '0',
            },
            duration_ms: 86400000,
            formula: 'BuildingRedesign2011',
            facilities: [
              { building: 'RoboticsFactory', level: 0 },
              { building: 'NaniteFactory', level: 0 },
            ],
            required_energy: '0',
            reserve_fields: 1,
          },
        },
      })
    })
    let built = 0
    await page.route('**/commands', async (route) => {
      const pair = route.request().postDataJSON()
      expect(pair.gameplay.command.type).toBe('StartUpgrade')
      expect(pair.gameplay.command.building).toBe('AllianceDepot')
      built++
      revision++
      constructions.push({
        id: id(88),
        body: body.id,
        building: 'AllianceDepot',
        target_level: 1,
        paid: { metal: '20000000000', crystal: '40000000000', deuterium: '0' },
        started_at: now,
        due_at: now + 86400000,
      })
      await route.fulfill({
        json: {
          protocol: 4,
          binding,
          command_id: pair.gameplay.command_id,
          admitted_at: now,
          executed_at: now,
          status: 'Committed',
          result_ids: [id(88)],
          minimum_viewer_revision: String(revision),
        },
      })
    })
    await page.goto(`/u/andromeda/b/${body.id}/facilities/alliance-depot`)
    await expect(
      page.getByRole('heading', { name: 'Alliance Depot', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByText(/No allied fleets are holding here/),
    ).toBeVisible()
    await shot(page, 'depot-facility', width)
    const build = page.getByRole('button', {
      name: 'Confirm upgrade',
      exact: true,
    })
    await expect(build).toBeEnabled()
    await build.click()
    await expect.poll(() => built).toBe(1)
    await expect(
      page.getByRole('button', { name: /Cancel/i }).first(),
    ).toBeVisible()
    await shot(page, 'depot-construction', width)
  })
}
