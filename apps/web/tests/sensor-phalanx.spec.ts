import { readFileSync } from 'node:fs'
import { test, expect } from './fixtures/test'
import { installGameFixture, body, binding, id } from './fixtures/game'
import { withFixtureResponse } from './fixtures/responses'
import { withGalaxyResponse } from './fixtures/galaxy'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import type { components } from '../src/contracts'
type S = components['schemas']
const now = 1793667600000
const moon: S['BodyV3'] = {
  ...body,
  id: id(80),
  kind: 'Moon',
  diameter_km: 8366,
  levels: { ...body.levels, LunarBase: 1, SensorPhalanx: 3 },
  amounts: {
    metal: '100000000000',
    crystal: '100000000000',
    deuterium: '10000000000',
  },
  moon: { parent: body.id, created_at: now },
  fields: 10,
  fields_used: 4,
  fields_reserved: 0,
}
const catalog = JSON.parse(readFileSync('rules/mvp-v1-slice-13.json', 'utf8'))
  .catalog as S['CatalogEntry3'][]
for (const e of catalog)
  if (e.key.id === 'SensorPhalanx') {
    e.enabled = true
    e.body_kinds = ['Moon']
    e.requirements = [{ type: 'BodyBuilding', building: 'LunarBase', level: 1 }]
  }
const bound = (request_id: string, data: unknown) => ({
  protocol: 4,
  binding,
  request_id,
  viewer_revision: '1',
  sampled_at: now,
  as_of_ms: now,
  data,
})
for (const width of [1440, 390]) {
  test.describe(`phalanx at ${width}`, () => {
    test.use({ viewport: { width, height: 900 }, reducedMotion: 'reduce' })
    // Regression: navigation and historical report refresh must never buy an observation.
    test('explicit paid scan opens immutable receipt report', async ({
      page,
    }) => {
      await installGameFixture(page, {
        protocol: 4,
        bodies: [body, moon],
        catalog,
        sampledAt: now,
        missions: {
          fleets: [],
          incoming: [],
          score_value_micro: '0',
          fleet_slots: '1',
        },
        extraCapabilities: ['Reports', 'ScanPlanet'],
      })
      const target = {
        coordinates: body.coordinates,
        body: {
          id: id(81),
          kind: 'Planet' as const,
          name: 'Quiet Horizon',
          owner: id(82),
          activity: { type: 'None' as const },
          inactivity: 'Active' as const,
          vacation: false,
          espionage_eligible: false,
        },
        debris: null,
      }
      await page.route('**/world', async (route) => {
        const r = route.request().postDataJSON()
        await route.fulfill({
          json: bound(r.context.request_id, {
            galaxy: 1,
            system: 371,
            observed_at: now,
            positions: Array.from({ length: 15 }, (_, i) =>
              i === 11
                ? target
                : {
                    coordinates: { galaxy: 1, system: 371, position: i + 1 },
                    body: null,
                    debris: null,
                  },
            ),
          }),
        })
      })
      let scans = 0
      await page.route('**/commands', async (route) => {
        const pair = route.request().postDataJSON()
        const e = pair.gameplay ?? pair
        if (e.command.action?.type === 'ScanPlanet') {
          scans++
          expect(e.command.action).toEqual({
            type: 'ScanPlanet',
            source_moon: moon.id,
            target_planet: id(81),
          })
          expect(pair.presence.command.action.body).toBe(moon.id)
        }
        await route.fulfill({
          json: {
            protocol: 4,
            binding,
            command_id: e.command_id,
            admitted_at: now,
            executed_at: now,
            status: 'Committed',
            result_ids: [id(90)],
            minimum_viewer_revision: '1',
          },
        })
      })
      const source = {
        coordinates: body.coordinates,
        kind: 'Moon',
        body: moon.id,
      }
      const destination = {
        coordinates: body.coordinates,
        kind: 'Planet',
        body: id(81),
      }
      const observation = {
        version: 'V1',
        report: {
          id: id(90),
          at: now,
          source,
          target: destination,
          cost: '5000000000',
          rows: [
            {
              kind: 'Fleet',
              owner: { id: id(82), name: 'Historical Commander' },
              mission: 'Attack',
              phase: 'Outbound',
              endpoints: {
                original_origin: source,
                effective_origin: source,
                original_destination: destination,
                effective_destination: destination,
              },
              ships: [
                { ship_type: 'LightFighter', count: '123' },
                { ship_type: 'SmallCargo', count: '45' },
              ],
              deadline: { kind: 'Arrival', at: now + 60000 },
            },
            {
              kind: 'Missile',
              attacker: { id: id(82), name: 'Historical Commander' },
              source: body.coordinates,
              target: destination,
              count: '8',
              deadline: { kind: 'Impact', at: now + 90000 },
            },
          ],
        },
      }
      await page.route(`**/api/v4/**/reports/${id(90)}`, async (route) => {
        const r = route.request().postDataJSON()
        await route.fulfill({
          json: bound(r.request_id, {
            header: {
              id: id(90),
              kind: 'Phalanx',
              observed_at: now,
              read: true,
              hidden: false,
            },
            payload: { kind: 'Phalanx', observation },
          }),
        })
      })
      await withGalaxyResponse(page, () =>
        page.goto(`/u/andromeda/b/${moon.id}/galaxy`),
      )
      await expect(
        page.getByRole('region', { name: 'Galaxy browser' }),
      ).toBeVisible()
      await page
        .getByRole('button', { name: 'Scan planet', exact: true })
        .click()
      const dialog = page.getByRole('dialog', {
        name: 'Sensor Phalanx',
        exact: true,
      })
      await expect(dialog).toContainText('Range 8 systems')
      expect(scans).toBe(0)
      await expect(
        dialog.getByRole('button', {
          name: 'Scan — spend 5,000 deuterium',
          exact: true,
        }),
      ).toBeInViewport()
      await diagnosticScreenshot(page, {
        path: `test-results/phalanx-scan-${width}x900.png`,
        fullPage: true,
      })
      await dialog
        .getByRole('button', {
          name: 'Scan — spend 5,000 deuterium',
          exact: true,
        })
        .click()
      await expect(
        dialog.getByRole('link', { name: 'Open saved scan' }),
      ).toBeVisible()
      expect(scans).toBe(1)
      await withFixtureResponse(
        page,
        (r) =>
          r.request().method() === 'POST' &&
          r.url().endsWith(`/reports/${id(90)}`),
        () => dialog.getByRole('link', { name: 'Open saved scan' }).click(),
      )
      await expect(
        page.getByRole('region', { name: 'Report observation' }),
      ).toContainText('Historical Commander')
      await expect(
        page.getByRole('region', { name: 'Report observation' }),
      ).toContainText('123')
      await diagnosticScreenshot(page, {
        path: `test-results/phalanx-report-${width}x900.png`,
        fullPage: true,
      })
      await withFixtureResponse(
        page,
        (r) =>
          r.request().method() === 'POST' &&
          r.url().endsWith(`/reports/${id(90)}`),
        () => page.reload(),
      )
      await expect(
        page.getByRole('region', { name: 'Report observation' }),
      ).toContainText('historical observation')
      expect(scans).toBe(1)
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
      await page.route('**/progression-options', async (route) => {
        const { context, request } = route.request().postDataJSON()
        await route.fulfill({
          json: {
            ...bound(context.request_id, undefined),
            request,
            terms_hash: 'b'.repeat(64),
            estimates: null,
            blockers: [],
            terms: {
              type: 'Building',
              profile_hash: 'a'.repeat(64),
              body: moon.id,
              building: 'SensorPhalanx',
              action: 'Upgrade',
              source_level: 3,
              target_level: 4,
              paid: {
                metal: '160000000000',
                crystal: '320000000000',
                deuterium: '160000000000',
              },
              duration_ms: 691110000,
              formula: 'BuildingRedesign2011',
              facilities: [{ building: 'RoboticsFactory', level: 0 }],
              required_energy: '0',
              reserve_fields: 1,
            },
          },
        })
      })
      await withFixtureResponse(
        page,
        (r) => r.url().endsWith('/progression-options'),
        () => page.goto(`/u/andromeda/b/${moon.id}/facilities/sensor-phalanx`),
      )
      await expect(
        page.getByRole('region', { name: 'Phalanx scanning' }),
      ).toContainText('8 systems')
      await diagnosticScreenshot(page, {
        path: `test-results/phalanx-facility-${width}x900.png`,
        fullPage: true,
      })
    })
  })
}
