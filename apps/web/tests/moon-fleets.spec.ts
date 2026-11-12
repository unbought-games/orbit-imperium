import { routeWorld } from './fixtures/game'
import { readFileSync } from 'node:fs'
import { test, expect, type Page } from './fixtures/test'
import { installGameFixture, body, binding, id } from './fixtures/game'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import type { components } from '../src/contracts'
import { withBootstrapResponse, withReportResponse } from './fixtures/responses'
import { withGalaxyResponse } from './fixtures/galaxy'
type S = components['schemas']
const now = 1793667600000
const catalog: S['CatalogEntry3'][] = JSON.parse(
  readFileSync('rules/mvp-v1-slice-13.json', 'utf8'),
).catalog.map((entry: S['CatalogEntry3']) =>
  entry.key.id === 'AllianceDepot'
    ? { ...entry, enabled: true, requirements: [] }
    : entry,
)
const parent: S['BodyV3'] = {
  ...body,
  name: 'Terra',
  levels: { ...body.levels, AllianceDepot: 1 },
}
const moon: S['BodyV3'] = {
  ...body,
  id: id(80),
  name: 'Luna',
  kind: 'Moon',
  fields: 1,
  fields_used: 0,
  fields_reserved: 0,
  levels: Object.fromEntries(Object.keys(body.levels).map((k) => [k, 0])),
  energy: { supply: '0', demand: '0', utilization: '1000000' },
  moon: { parent: body.id, created_at: now },
  diameter_km: 8366,
  inventories: [
    ...body.inventories,
    { item: { kind: 'Ship', id: 'EspionageProbe' }, count: '3' },
  ],
}
const foreign: S['GalaxyPosition4'] = {
  coordinates: { ...body.coordinates, position: 9 },
  body: {
    id: id(120),
    owner: id(130),
    name: 'Foreign planet',
    kind: 'Planet',
    activity: { type: 'None' },
    inactivity: 'Active',
    vacation: false,
    espionage_eligible: true,
  },
  moon: {
    id: id(121),
    name: 'Selene',
    diameter_km: 8500,
    activity: { type: 'Recent' },
  },
  debris: null,
}
async function fixture(page: Page, attackBlocker?: S['GameError4']) {
  await page.clock.setFixedTime(now)
  const launches: S['FleetIntent4'][] = []
  const supplies: S['DepotSupplyIntent4'][] = []
  const holdings: S['HeldFleetView4'][] = [
    {
      id: id(81),
      owner: id(90),
      target: moon.id,
      ships: [{ ship_type: 'LightFighter', count: '1000' }],
      departure_at: now + 3600000,
      can_supply: true,
    },
  ]
  await installGameFixture(page, {
    protocol: 4,
    bodies: [structuredClone(parent), structuredClone(moon)],
    catalog,
    sampledAt: now,
    playerNames: {
      [binding.player]: 'Commander',
      [id(130)]: 'Artemis',
      [id(90)]: 'Cassiopeia',
    },
    holdings,
    depots: [
      {
        body: parent.id,
        remaining_budget: '10000000000',
        next_budget_release_at: null,
      },
    ],
    missions: {
      fleets: [],
      incoming: [
        {
          sender: id(130),
          origin: foreign.coordinates,
          origin_body: id(121),
          target: moon.id,
          mission: 'Attack',
          arrival_at: now + 3600000,
          ships: {
            visibility: 'Exact',
            total: '20',
            ships: [{ ship_type: 'LightFighter', count: '20' }],
          },
        },
      ],
      score_value_micro: '0',
      fleet_slots: '5',
    },
    extraCapabilities: [
      'Attack',
      'Espionage',
      'Deploy',
      'Hold',
      'Harvest',
      'Colonize',
      'Reports',
    ],
  })
  await routeWorld(page, async (route) => {
    const q = route.request().postDataJSON()
    let data: unknown
    if (q.type === 'Galaxy')
      data = {
        galaxy: q.galaxy,
        system: q.system,
        observed_at: now,
        player_names: { [id(130)]: 'Artemis' },
        positions: Array.from({ length: 15 }, (_, index) =>
          index === 8
            ? {
                ...foreign,
                body: {
                  ...foreign.body!,
                  attack_blocker: attackBlocker,
                  espionage_eligible: !attackBlocker,
                },
              }
            : {
                coordinates: { ...body.coordinates, position: index + 1 },
                body: null,
                debris: null,
              },
        ),
      }
    else if (q.type === 'ResolveDestination')
      data = {
        type: 'Body',
        id:
          q.selection.coordinates.position === 9
            ? q.selection.kind === 'Moon'
              ? id(121)
              : id(120)
            : q.selection.kind === 'Moon'
              ? moon.id
              : parent.id,
        expected_kind: q.selection.kind,
        expected_owner:
          q.selection.coordinates.position === 9 ? id(130) : binding.player,
      }
    else if (q.type === 'DepotSupplyQuote') {
      expect(q.intent.source_planet).toBe(parent.id)
      data = {
        intent: q.intent,
        profile_hash: 'a'.repeat(64),
        terms_hash: 'b'.repeat(64),
        rate_micro_per_hour: '2000000000',
        extension_ms: 1800000,
        departure_at: now + 5400000,
        remaining_budget: '10000000000',
        available_deuterium: parent.amounts.deuterium,
        next_budget_release_at: null,
      }
    } else {
      expect(['FleetQuote', 'FleetEstimate']).toContain(q.type)
      data = {
        intent: q.intent,
        profile_hash: 'a'.repeat(64),
        ...(q.type === 'FleetEstimate'
          ? { estimate: true }
          : {
              distance: 5,
              speeds: [],
              slot_limit: '5',
              terms_hash: 'b'.repeat(64),
            }),
        duration_ms: 60000,
        fuel: '1000000',
        capacity: '5000000000',
        maximum_payload: '4999000000',
      }
    }
    await route.fulfill({
      json: {
        protocol: 4,
        binding,
        request_id: q.context.request_id,
        viewer_revision: '1',
        sampled_at: now,
        as_of_ms: now,
        data,
      },
    })
  })
  await page.route('**/commands', async (route) => {
    const pair = route.request().postDataJSON()
    const action = pair.gameplay.command.action
    if (action.type === 'LaunchFleet') launches.push(action.intent)
    else if (action.type === 'SupplyHoldingFleet') {
      expect(pair.presence.command.action.body).toBe(parent.id)
      supplies.push(action.intent)
    } else expect(action.type).toBe('MarkReportRead')
    await route.fulfill({
      json: {
        protocol: 4,
        binding,
        command_id: pair.gameplay.command_id,
        admitted_at: now,
        executed_at: now,
        status: 'Committed',
        result_ids: [],
        minimum_viewer_revision: '1',
      },
    })
  })
  return { launches, supplies }
}
for (const width of [1440, 390]) {
  test.describe(`moon fleet operations ${width}`, () => {
    test.use({
      viewport: { width, height: 900 },
      hasTouch: width < 600,
      reducedMotion: 'reduce',
    })
    test('launches from local inventory and supplies moon defenders from the parent', async ({
      page,
    }) => {
      const state = await fixture(page)
      await withBootstrapResponse(page, () => page.goto(`/u/andromeda/b/${moon.id}/fleets`))
      await page
        .getByRole('button', { name: /Hostile fleet inbound/ })
        .press('Escape')
      await expect(page.getByTestId('swipeable-toast')).toHaveCount(0)
      await expect(
        page.getByRole('region', { name: 'Stationed ships' }),
      ).toContainText('Small Cargo')
      await expect(
        page.getByRole('region', { name: 'Allied defense' }),
      ).toContainText('Supply comes from Terra on the parent planet')
      await diagnosticScreenshot(page, {
        path: `test-results/moon-fleets-${width}x900.png`,
        fullPage: true,
      })
      await page
        .getByRole('button', { name: 'Supply fleet', exact: true })
        .click()
      await page
        .getByRole('button', { name: 'Review supply', exact: true })
        .click()
      await expect(
        page.getByText('Additional defense', { exact: true }),
      ).toBeVisible()
      await diagnosticScreenshot(page, {
        path: `test-results/moon-supply-review-${width}x900.png`,
        fullPage: false,
      })
      await expect(
        page.getByRole('button', { name: 'Supply deuterium', exact: true }),
      ).toBeEnabled()
      await page
        .getByRole('button', { name: 'Supply deuterium', exact: true })
        .click()
      await expect.poll(() => state.supplies.length).toBe(1)
      expect(state.supplies[0]).toMatchObject({
        source_planet: parent.id,
        fleet: id(81),
      })
      await withBootstrapResponse(page, () => page.goto(`/u/andromeda/b/${moon.id}/dispatch`))
      await page
        .getByRole('button', { name: /Hostile fleet inbound/ })
        .press('Escape')
      await expect(page.getByTestId('swipeable-toast')).toHaveCount(0)
      await page.getByLabel('Small Cargo · 2 available').fill('1')
      await page
        .getByRole('combobox', { name: 'Your planets and moons' })
        .click()
      await page.getByRole('option', { name: /Terra/ }).click()
      await expect(page.getByLabel('Destination preview')).toContainText(
        'Planet',
      )
      await page
        .getByRole('button', { name: 'Review fleet', exact: true })
        .click()
      await expect(
        page.getByRole('region', { name: 'Fleet quote' }),
      ).toBeVisible()
      await diagnosticScreenshot(page, {
        path: `test-results/moon-flight-review-${width}x900.png`,
        fullPage: true,
      })
      await page.getByRole('button', { name: /^Transport to Terra/ }).click()
      await expect.poll(() => state.launches.length).toBe(1)
      expect(state.launches[0]).toMatchObject({
        origin: moon.id,
        destination: { id: parent.id, expected_kind: 'Planet' },
      })
      await withBootstrapResponse(page, () => page.goto(`/u/andromeda/b/${parent.id}/dispatch`))
      await page
        .getByRole('button', { name: /Hostile fleet inbound/ })
        .press('Escape')
      await expect(page.getByTestId('swipeable-toast')).toHaveCount(0)
      await page
        .getByRole('combobox', { name: 'Your planets and moons' })
        .click()
      await page.getByRole('option', { name: /Luna/ }).click()
      await expect(page.getByLabel('Destination preview')).toContainText(
        'Moon · Your moon',
      )
      await diagnosticScreenshot(page, {
        path: `test-results/moon-destination-${width}x900.png`,
        fullPage: true,
      })
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
    })
    test('Galaxy moon actions and quick espionage bind the moon rather than its planet', async ({
      page,
    }) => {
      const state = await fixture(page)
      await withGalaxyResponse(page, () => page.goto(`/u/andromeda/b/${moon.id}/galaxy`))
      await page
        .getByRole('button', { name: /Hostile fleet inbound/ })
        .press('Escape')
      await expect(page.getByTestId('swipeable-toast')).toHaveCount(0)
      const trigger = page.getByRole('button', {
        name: 'Moon at [1:371:9] details',
        exact: true,
      })
      await trigger.click()
      const details = page.getByRole('dialog', {
        name: 'Moon at [1:371:9]',
        exact: true,
      })
      await expect(details).toContainText('8,500 km')
      await diagnosticScreenshot(page, {
        path: `test-results/moon-galaxy-actions-${width}x900.png`,
      })
      await expect(
        details.getByRole('button', {
          name: 'Spy on Moon [1:371:9]',
          exact: true,
        }),
      ).toBeEnabled()
      await details
        .getByRole('button', { name: 'Spy on Moon [1:371:9]', exact: true })
        .click()
      await expect.poll(() => state.launches.length).toBe(1)
      expect(state.launches[0]).toMatchObject({
        origin: moon.id,
        mission: 'Espionage',
        destination: { id: id(121), expected_kind: 'Moon' },
      })
      if (!(await details.isVisible())) await trigger.click()
      await expect(details).toBeVisible()
      await details
        .getByRole('button', {
          name: 'Actions for moon [1:371:9]',
          exact: true,
        })
        .click()
      await expect(
        page.getByRole('menuitem', { name: 'Attack', exact: true }),
      ).toBeVisible()
      await page.getByRole('menuitem', { name: 'Attack', exact: true }).click()
      await expect(page).toHaveURL(/target=moon/)
      await expect(page.getByLabel('Destination preview')).toContainText(
        'Selene',
      )
      await expect(page.getByLabel('Destination preview')).toContainText('Moon')
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
    })
    test('delivery reports retain lunar destination links at shared coordinates', async ({
      page,
    }) => {
      await fixture(page)
      const report = id(190)
      await page.route(`**/reports/${report}`, async (route) => {
        const request = route.request().postDataJSON()
        await route.fulfill({
          json: {
            protocol: 4,
            binding,
            request_id: request.request_id,
            viewer_revision: '1',
            sampled_at: now,
            as_of_ms: now,
            data: {
              header: {
                id: report,
                kind: 'Delivered',
                observed_at: now,
                read: true,
                hidden: false,
              },
              payload: {
                kind: 'Delivered',
                at: now,
                sender: binding.player,
                recipient: binding.player,
                origin: body.coordinates,
                target: body.coordinates,
                origin_name: 'Terra',
                target_name: 'Luna',
                origin_kind: 'Planet',
                target_kind: 'Moon',
                cargo: {
                  metal: '1000000000',
                  crystal: '0',
                  deuterium: '1000000000',
                },
              },
            },
          },
        })
      })
      await withReportResponse(page, report, () => page.goto(`/u/andromeda/b/${moon.id}/reports/${report}`))
      await page
        .getByRole('button', { name: /Hostile fleet inbound/ })
        .press('Escape')
      await expect(page.getByTestId('swipeable-toast')).toHaveCount(0)
      const reportBody = page.getByRole('region', {
        name: 'Report observation',
      })
      await expect(reportBody).toContainText('Luna')
      const target = reportBody.getByRole('link', {
        name: 'View destination [1:371:12] in galaxy',
      })
      await expect(target).toHaveAttribute('href', /target=moon/)
      await expect(
        reportBody.getByRole('link', {
          name: 'View origin [1:371:12] in galaxy',
        }),
      ).not.toHaveAttribute('href', /target=moon/)
      await diagnosticScreenshot(page, {
        path: `test-results/moon-delivery-report-${width}x900.png`,
        fullPage: true,
      })
      await target.click()
      await expect(page).toHaveURL(/target=moon/)
    })
    test('moon quick-espionage failures remain visible on the Galaxy row', async ({
      page,
    }) => {
      const state = await fixture(page)
      await routeWorld(page, async (route) => {
        if (route.request().postDataJSON().type !== 'FleetQuote')
          return route.fallback()
        await route.fulfill({
          status: 422,
          json: { code: 'GameRejected', game_code: 'InsufficientResources' },
        })
      })
      await withGalaxyResponse(page, () => page.goto(`/u/andromeda/b/${moon.id}/galaxy`))
      await page
        .getByRole('button', { name: /Hostile fleet inbound/ })
        .press('Escape')
      await expect(page.getByTestId('swipeable-toast')).toHaveCount(0)
      await page
        .getByRole('button', { name: 'Moon at [1:371:9] details', exact: true })
        .click()
      await page
        .getByRole('button', { name: 'Spy on Moon [1:371:9]', exact: true })
        .click()
      await expect(page.getByRole('alert')).toContainText('Espionage at moon')
      await expect(page.getByRole('alert')).toContainText('resources')
      expect(state.launches).toEqual([])
      await diagnosticScreenshot(page, {
        path: `test-results/moon-spy-error-${width}x900.png`,
      })
    })
    test('moon dispatch shows observed attack and espionage protection before review', async ({
      page,
    }) => {
      const state = await fixture(page, 'BeginnerProtected')
      await withBootstrapResponse(page, () => page.goto(
        `/u/andromeda/b/${moon.id}/dispatch?galaxy=1&system=371&position=9&target=moon&mission=Attack`,
      ))
      await page
        .getByRole('button', { name: /Hostile fleet inbound/ })
        .press('Escape')
      await expect(page.getByTestId('swipeable-toast')).toHaveCount(0)
      await expect(page.getByLabel('Destination preview')).toContainText(
        'Selene',
      )
      await expect(
        page
          .getByRole('status')
          .filter({ hasText: 'Beginner protection prevents this mission' }),
      ).toBeVisible()
      await diagnosticScreenshot(page, {
        path: `test-results/moon-dispatch-protection-${width}x900.png`,
        fullPage: true,
      })
      await page.getByRole('radio', { name: 'Espionage', exact: true }).check()
      await expect(
        page
          .getByRole('status')
          .filter({ hasText: 'Beginner protection prevents this mission' }),
      ).toBeVisible()
      expect(state.launches).toEqual([])
    })
  })
}
