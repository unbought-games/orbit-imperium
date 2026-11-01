import { readFileSync } from 'node:fs'
import { test, expect } from './fixtures/test'
import { shellFixture, body, binding, id, refreshGame } from './fixtures/game'
import { routeProgressionOptions } from './fixtures/progression-options'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import type { components } from '../src/contracts'

type S = components['schemas']
const baseline = JSON.parse(readFileSync('rules/mvp-v1-slice-13.json', 'utf8'))
const nanite = JSON.parse(
  readFileSync('rules/content/nanite-factory.json', 'utf8'),
)

// The command/lock lifecycle is shared by industrial facilities. Keep content
// arithmetic in engine tests instead of duplicating every formula in the browser.
for (const building of ['Shipyard', 'NaniteFactory'] as const) {
  for (const width of [390, 1440]) {
    test(`${building} industrial lifecycle at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      const title = building === 'Shipyard' ? 'Shipyard' : 'Nanite Factory'
      const slug = building === 'Shipyard' ? 'shipyard' : 'nanite-factory'
      const planet = structuredClone(body)
      planet.levels = {
        ...planet.levels,
        RoboticsFactory: 10,
        Shipyard: 1,
        NaniteFactory: 0,
      }
      planet.amounts = {
        metal: '10000000000000',
        crystal: '10000000000000',
        deuterium: '10000000000000',
      }
      planet.capacity = { ...planet.amounts }
      planet.fields_reserved = 0
      const constructions: S['Construction3'][] = []
      const manufacturing: S['ManufacturingBatchDto'][] = []
      let revision = 1
      const paid =
        building === 'NaniteFactory'
          ? {
              metal: '1000000000000',
              crystal: '500000000000',
              deuterium: '100000000000',
            }
          : { metal: '800000000', crystal: '400000000', deuterium: '200000000' }
      const quotedPayment = (action: string, source: number) => {
        const relative = source - (building === 'Shipyard' ? 1 : 0)
        const factor = 2 ** (relative - (action === 'Demolition' ? 2 : 0))
        return Object.fromEntries(
          Object.entries(paid).map(([resource, amount]) => [
            resource,
            String((BigInt(amount) * BigInt(factor * 4)) / 4n),
          ]),
        ) as S['Resources']
      }
      const catalog: S['CatalogEntry3'][] = baseline.catalog.map(
        (entry: S['CatalogEntry3']) =>
          entry.key.id === 'NaniteFactory'
            ? {
                ...entry,
                enabled: true,
                requirements: nanite.requirements,
                technical_data: JSON.parse(
                  readFileSync(
                    'contracts/fixtures/nanite-technical-data.json',
                    'utf8',
                  ),
                ),
              }
            : entry,
      )
      await shellFixture(page, {
        protocol: 4,
        catalog,
        bodies: [planet],
        constructions,
        manufacturing,
        missions: {
          fleets: [],
          incoming: [],
          score_value_micro: '0',
          fleet_slots: '11',
        },
        research: [{ research: 'ComputerTechnology', level: 10 }],
        viewerRevision: () => String(revision),
      })
      await routeProgressionOptions(page, (route) => {
        const { context, request } = route.request().postDataJSON()
        if (!['Upgrade', 'Demolition'].includes(request.type))
          return route.fallback()
        const source = planet.levels[request.building as S['BuildingId3']] ?? 0
        return route.fulfill({
          json: {
            protocol: 4,
            binding,
            request_id: context.request_id,
            viewer_revision: String(revision),
            sampled_at: Date.now(),
            as_of_ms: Date.now(),
            request,
            terms_hash: 'b'.repeat(64),
            estimates: null,
            blockers:
              manufacturing.length > 0
                ? [
                    {
                      code: 'YardLocked',
                      requirement: null,
                      required: null,
                      actual: null,
                      resource: null,
                      unit: null,
                    },
                  ]
                : [],
            terms: {
              type: 'Building',
              profile_hash: 'a'.repeat(64),
              body: body.id,
              building: request.building,
              action: request.type,
              source_level: source,
              target_level: source + (request.type === 'Demolition' ? -1 : 1),
              paid: quotedPayment(request.type, source),
              duration_ms:
                request.type === 'Demolition'
                  ? building === 'NaniteFactory'
                    ? 9_818_000
                    : 15_000
                  : building === 'NaniteFactory'
                    ? 39_182_000
                    : 31_000,
              formula:
                request.type === 'Demolition'
                  ? 'DemolitionClassic'
                  : 'BuildingRedesign2011',
              facilities: [
                {
                  building: 'NaniteFactory',
                  level: planet.levels.NaniteFactory,
                },
                { building: 'RoboticsFactory', level: 10 },
              ],
              required_energy: '0',
              reserve_fields: request.type === 'Upgrade' ? 1 : 0,
            },
          },
        })
      })
      const sent: S['Command3'][] = []
      await page.route('**/commands', (route) => {
        const envelope = route.request().postDataJSON().gameplay
        const command = envelope.command
        sent.push(command)
        const demolition = command.type === 'StartDemolition'
        constructions.push({
          id: id(30 + sent.length),
          body: body.id,
          building,
          target_level: planet.levels[building]! + (demolition ? -1 : 1),
          due_at: Date.now() + 39_182_000,
          paid: quotedPayment(
            demolition ? 'Demolition' : 'Upgrade',
            planet.levels[building]!,
          ),
        })
        planet.fields_reserved = demolition ? 0 : 1
        revision++
        return route.fulfill({
          json: {
            protocol: 4,
            binding,
            command_id: envelope.command_id,
            admitted_at: Date.now(),
            executed_at: Date.now(),
            status: 'Committed',
            result_ids: [],
            minimum_viewer_revision: String(revision),
          },
        })
      })
      const capture = async (state: string) => {
        await page.evaluate(() => {
          window.scrollTo(0, 0)
          for (const element of document.querySelectorAll('*'))
            if (element instanceof HTMLElement && element.scrollTop)
              element.scrollTop = 0
        })
        if (building === 'NaniteFactory')
          await diagnosticScreenshot(page, {
            path: `test-results/nanite-${state}-${width}x900.png`,
            fullPage: false,
            animations: 'disabled',
          })
      }
      await page.goto(`/u/andromeda/b/${body.id}/facilities`)
      const tile = page.getByRole('link', {
        name: `Upgrade ${title}`,
        exact: true,
      })
      await expect(tile).toBeVisible()
      await capture('facilities')
      await tile.click()
      const pane = page.getByRole('region', { name: 'Progression quote' })
      const confirm = pane.getByRole('button', {
        name: 'Confirm upgrade',
        exact: true,
      })
      await expect(confirm).toBeEnabled()
      await expect(
        pane.getByRole('group', { name: 'Required resources' }),
      ).toContainText(building === 'NaniteFactory' ? '1,000,000' : '800')
      await expect(page).toHaveURL(new RegExp(`/facilities/${slug}$`))
      await capture('ready')
      if (building === 'NaniteFactory') {
        await pane.getByText('Technical data', { exact: true }).click()
        await expect(pane).toContainText('Research is unaffected')
        await expect(
          pane.getByRole('link', {
            name: 'Computer Technology 10',
            exact: true,
          }),
        ).toBeVisible()
        await capture('technical')
        await pane.getByText('Technical data', { exact: true }).click()
      }
      const now = Date.now()
      manufacturing.push({
        id: id(50),
        body: body.id,
        item: { kind: 'Defense', id: 'RocketLauncher' },
        quantity: '2',
        completed_prefix: '0',
        remaining: '2',
        paid,
        accepted_at: now,
        first_start_at: now,
        next_due_at: now + 600000,
        final_due_at: now + 1200000,
        unit_duration_ms: 600000,
        state: 'Producing',
        can_cancel: false,
      })
      revision++
      await refreshGame(page)
      await expect(confirm).toBeDisabled()
      await expect(pane.getByLabel('Action blockers')).toContainText(
        'Finish all manufacturing on this planet',
      )
      await capture('manufacturing-blocked')
      manufacturing.length = 0
      revision++
      await refreshGame(page)
      await expect(confirm).toBeEnabled()
      await confirm.click()
      await expect.poll(() => sent.length).toBe(1)
      expect(sent[0]).toMatchObject({
        type: 'StartUpgrade',
        body: body.id,
        building,
        expected_terms_hash: 'b'.repeat(64),
      })
      await expect(
        pane.getByRole('region', { name: 'Active construction' }),
      ).toBeVisible()
      await capture('constructing')
      planet.levels[building] = constructions[0].target_level
      constructions.length = 0
      planet.fields_reserved = 0
      revision++
      await refreshGame(page)
      await expect(confirm).toBeEnabled()
      await pane
        .getByRole('button', { name: `Demolish ${title}`, exact: true })
        .click()
      const demolition = pane.getByRole('button', {
        name: 'Confirm demolition',
        exact: true,
      })
      await expect(demolition).toBeEnabled()
      await capture('demolition')
      await demolition.click()
      await page
        .getByRole('dialog', { name: `Tear down ${title}?` })
        .getByRole('button', { name: 'Confirm demolition', exact: true })
        .click()
      await expect.poll(() => sent.length).toBe(2)
      expect(sent[1]).toMatchObject({
        type: 'StartDemolition',
        body: body.id,
        building,
      })
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
    })
  }
}
