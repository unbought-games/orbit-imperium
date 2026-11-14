import { readFileSync } from 'node:fs'
import { test, expect } from './fixtures/test'
import {
  installGameFixture,
  routeWorld,
  body,
  binding,
  id,
} from './fixtures/game'
import { withFixtureResponse } from './fixtures/responses'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import type { components } from '../src/contracts'
type S = components['schemas']
const now = 1793667600000
for (const width of [1440, 390]) {
  test.describe(`Jump Gates at ${width}`, () => {
    test.use({ viewport: { width, height: 900 }, reducedMotion: 'reduce' })
    // Regression: facility route exposes construction and an explicit quote-bound transfer,
    // with the selected moon retained across submission and reload on desktop/touch layouts.
    test(
      'build, review and jump preserves moon context and both cooldowns',
      { tag: '@journey' },
      async ({ page }) => {
        await page.clock.install({ time: now })
        const source: S['BodyV3'] = {
          ...structuredClone(body),
          id: id(80),
          name: 'Luna',
          kind: 'Moon',
          moon: { parent: body.id, created_at: now },
          levels: {
            ...Object.fromEntries(Object.keys(body.levels).map((k) => [k, 0])),
            LunarBase: 1,
            JumpGate: 0,
          },
          fields: 4,
          fields_used: 1,
          fields_reserved: 0,
          amounts: {
            metal: '20000000000000',
            crystal: '20000000000000',
            deuterium: '20000000000000',
          },
          jump_gate: { ready_at: 0, cooldown_ms: 3600000 },
          inventories: [
            { item: { kind: 'Ship', id: 'SmallCargo' }, count: '20' },
            { item: { kind: 'Ship', id: 'LightFighter' }, count: '10' },
            { item: { kind: 'Ship', id: 'SolarSatellite' }, count: '3' },
          ],
        }
        const destination: S['BodyV3'] = {
          ...structuredClone(source),
          id: id(81),
          name: 'Selene',
          coordinates: { galaxy: 2, system: 4, position: 8 },
          levels: { ...source.levels, JumpGate: 1 },
          inventories: [],
        }
        const catalog = JSON.parse(
          readFileSync('rules/mvp-v1-slice-13.json', 'utf8'),
        ).catalog as S['CatalogEntry3'][]
        const gate = catalog.find((c) => c.key.id === 'JumpGate')!
        Object.assign(gate, {
          enabled: true,
          body_kinds: ['Moon'],
          requirements: [
            { type: 'BodyBuilding', building: 'LunarBase', level: 1 },
            {
              type: 'PlayerResearch',
              research: 'HyperspaceTechnology',
              level: 7,
            },
          ],
        })
        let revision = 1,
          jumps = 0,
          builds = 0
        await installGameFixture(page, {
          protocol: 4,
          bodies: [body, source, destination],
          catalog,
          sampledAt: () => now,
          viewerRevision: () => String(revision),
          extraCapabilities: ['JumpShips'],
          research: [{ research: 'HyperspaceTechnology', level: 7 }],
          missions: {
            fleets: [],
            incoming: [],
            score_value_micro: '0',
            fleet_slots: '1',
          },
        })
        const bound = (request_id: string) => ({
          protocol: 4,
          binding,
          request_id,
          viewer_revision: String(revision),
          sampled_at: now,
          as_of_ms: now,
        })
        await page.route('**/progression-options', async (route) => {
          const { context, request } = route.request().postDataJSON()
          const level = source.levels.JumpGate ?? 0
          await route.fulfill({
            json: {
              ...bound(context.request_id),
              request,
              terms_hash: 'b'.repeat(64),
              estimates: null,
              blockers: [],
              terms: {
                type: 'Building',
                profile_hash: 'a'.repeat(64),
                body: source.id,
                building: 'JumpGate',
                action: 'Upgrade',
                source_level: level,
                target_level: level + 1,
                paid: {
                  metal: String(2000000000000 * 2 ** level),
                  crystal: String(4000000000000 * 2 ** level),
                  deuterium: String(2000000000000 * 2 ** level),
                },
                duration_ms: 8640000000 * 2 ** level - 90000,
                formula: 'BuildingRedesign2011',
                facilities: [{ building: 'RoboticsFactory', level: 0 }],
                required_energy: '0',
                reserve_fields: 1,
              },
            },
          })
        })
        await routeWorld(page, async (route) => {
          const r = route.request().postDataJSON()
          expect(r.type).toBe('JumpQuote')
          await route.fulfill({
            json: {
              ...bound(r.context.request_id),
              data: {
                intent: r.intent,
                cooldown_ms: 3600000,
                profile_hash: 'a'.repeat(64),
                terms_hash: 'c'.repeat(64),
              },
            },
          })
        })
        await page.route('**/commands', async (route) => {
          const pair = route.request().postDataJSON(),
            e = pair.gameplay ?? pair
          if (e.command.type === 'StartUpgrade') {
            builds++
            source.levels.JumpGate = 1
            source.fields_used = 2
            revision++
          }
          if (e.command.action?.type === 'JumpShips') {
            jumps++
            expect(pair.presence.command.action.body).toBe(source.id)
            expect(e.command.action.intent).toEqual({
              source: source.id,
              destination: destination.id,
              ships: [
                {
                  owner: binding.player,
                  ship_type: 'LightFighter',
                  count: '3',
                },
                { owner: binding.player, ship_type: 'SmallCargo', count: '7' },
              ],
            })
            expect(e.command.action.expected_terms_hash).toBe('c'.repeat(64))
            source.inventories[0].count = '13'
            source.inventories[1].count = '7'
            destination.inventories = [
              { item: { kind: 'Ship', id: 'SmallCargo' }, count: '7' },
              { item: { kind: 'Ship', id: 'LightFighter' }, count: '3' },
            ]
            source.jump_gate = { ready_at: now + 3600000, cooldown_ms: 3600000 }
            destination.jump_gate = { ...source.jump_gate }
            revision++
          }
          await route.fulfill({
            json: {
              protocol: 4,
              binding,
              command_id: e.command_id,
              admitted_at: now,
              executed_at: now,
              status: 'Committed',
              result_ids: [],
              minimum_viewer_revision: String(revision),
            },
          })
        })
        await withFixtureResponse(
          page,
          (r) => r.url().endsWith('/progression-options'),
          () => page.goto(`/u/andromeda/b/${source.id}/facilities/jump-gate`),
        )
        const panel = page.getByRole('region', { name: 'Jump Gate transfer' })
        const capture = async (state: string) => {
          if (process.env.ORBIT_TEST_SCREENSHOTS !== '1') return
          if (width === 390 && state !== 'construction')
            await panel.evaluate((el) =>
              window.scrollTo(
                0,
                window.scrollY + el.getBoundingClientRect().top - 160,
              ),
            )
          if (width !== 390 || state === 'construction')
            await page.evaluate(() => window.scrollTo(0, 0))
          await diagnosticScreenshot(page, {
            path: `test-results/jump-gate-${state}-${width}x900.png`,
            fullPage: width !== 390,
          })
        }
        await expect(panel).toContainText('Complete Jump Gate level 1')
        await capture('construction')
        await withFixtureResponse(
          page,
          (r) => r.url().endsWith('/overview'),
          () =>
            page
              .getByRole('button', { name: 'Confirm upgrade', exact: true })
              .click(),
        )
        await expect(panel).not.toContainText('Complete Jump Gate level 1')
        expect(builds).toBe(1)
        await panel.getByLabel('Destination moon').selectOption(destination.id)
        await panel
          .getByRole('textbox', { name: 'Small Cargo', exact: true })
          .fill('7')
        await panel
          .getByRole('textbox', { name: 'Light Fighter', exact: true })
          .fill('3')
        await expect(
          panel.getByRole('textbox', { name: 'Solar Satellite' }),
        ).toHaveCount(0)
        await withFixtureResponse(
          page,
          (r) =>
            r.url().endsWith('/world') &&
            r.request().postDataJSON().type === 'JumpQuote',
          () =>
            panel
              .getByRole('button', { name: 'Review jump', exact: true })
              .click(),
        )
        await expect(panel).toContainText('Ready to transfer')
        expect(jumps).toBe(0)
        await capture('review')
        if (width === 390 && process.env.ORBIT_TEST_SCREENSHOTS === '1') {
          await panel
            .getByRole('button', { name: 'Jump ships', exact: true })
            .scrollIntoViewIfNeeded()
          await diagnosticScreenshot(page, {
            path: 'test-results/jump-gate-confirm-390x900.png',
            fullPage: false,
          })
        }
        await withFixtureResponse(
          page,
          (r) => r.url().endsWith('/overview'),
          () =>
            panel
              .getByRole('button', { name: 'Jump ships', exact: true })
              .click(),
        )
        await expect(panel).toContainText('Ships transferred')
        await expect(panel).toContainText('This gate is cooling down')
        expect(jumps).toBe(1)
        await capture('cooling')
        await withFixtureResponse(
          page,
          (r) => r.url().endsWith('/progression-options'),
          () => page.reload(),
        )
        await expect(panel).toContainText('This gate is cooling down')
        await expect(page).toHaveURL(
          new RegExp(`/b/${source.id}/facilities/jump-gate$`),
        )
        expect(jumps).toBe(1)
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true)
      },
    )
  })
}
