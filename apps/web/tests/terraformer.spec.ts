import { readFileSync } from 'node:fs'
import { test, expect } from './fixtures/test'
import { shellFixture, body, binding, id, refreshGame } from './fixtures/game'
import { routeProgressionOptions } from './fixtures/progression-options'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import type { components } from '../src/contracts'

type S = components['schemas']
const baseline = JSON.parse(readFileSync('rules/mvp-v1-slice-13.json', 'utf8'))
const content = JSON.parse(
  readFileSync('rules/content/terraformer.json', 'utf8'),
)
const technical = JSON.parse(
  readFileSync('contracts/fixtures/terraformer-technical-data.json', 'utf8'),
)

for (const width of [390, 1440]) {
  test(`Terraformer fields, energy, cancellation and completion at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    const planet = structuredClone(body)
    planet.levels = {
      ...planet.levels,
      RoboticsFactory: 10,
      NaniteFactory: 1,
      Terraformer: 0,
    }
    planet.fields = 100
    planet.fields_used = 99
    planet.fields_reserved = 0
    planet.amounts = {
      metal: '500000000000',
      crystal: '500000000000',
      deuterium: '500000000000',
    }
    planet.capacity = { ...planet.amounts }
    planet.energy = {
      supply: '1000000000',
      demand: '2500000000',
      utilization: '400000',
    }
    const constructions: S['Construction3'][] = []
    let revision = 1
    let blockers: S['ProgressionBlocker3'][] = []
    const catalog: S['CatalogEntry3'][] = baseline.catalog.map(
      (entry: S['CatalogEntry3']) =>
        entry.key.id === 'Terraformer'
          ? {
              ...entry,
              enabled: true,
              requirements: content.requirements,
              technical_data: technical,
            }
          : entry.key.id === 'NaniteFactory'
            ? { ...entry, enabled: true }
            : entry,
    )
    await shellFixture(page, {
      protocol: 4,
      catalog,
      bodies: [planet],
      constructions,
      research: [{ research: 'EnergyTechnology', level: 12 }],
      missions: {
        fleets: [],
        incoming: [],
        score_value_micro: '0',
        fleet_slots: '1',
      },
      viewerRevision: () => String(revision),
    })
    const paid = {
      metal: '0',
      crystal: '50000000000',
      deuterium: '100000000000',
    }
    await routeProgressionOptions(page, (route) => {
      const { context, request } = route.request().postDataJSON()
      if (request.type !== 'Upgrade') return route.fallback()
      const terraformer = request.building === 'Terraformer'
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
          blockers: terraformer ? blockers : [],
          building_benefit: terraformer
            ? {
                kind: 'FieldCapacity',
                current: String(planet.fields),
                target: String(planet.fields + 5),
              }
            : undefined,
          building_energy: {
            current_consumption: '0',
            target_consumption: '0',
          },
          terms: {
            type: 'Building',
            profile_hash: 'a'.repeat(64),
            body: body.id,
            building: request.building,
            action: 'Upgrade',
            source_level: source,
            target_level: source + 1,
            paid:
              source === 0
                ? paid
                : {
                    metal: '0',
                    crystal: '100000000000',
                    deuterium: '200000000000',
                  },
            duration_ms: source === 0 ? 564000 : 1219000,
            formula: 'BuildingRedesign2011',
            facilities: [
              { building: 'NaniteFactory', level: 1 },
              { building: 'RoboticsFactory', level: 10 },
            ],
            required_energy: terraformer
              ? String(1000000000 * 2 ** source)
              : '0',
            reserve_fields: 1,
          },
        },
      })
    })
    const sent: S['Command3'][] = []
    await page.route('**/commands', (route) => {
      const envelope = route.request().postDataJSON().gameplay
      sent.push(envelope.command)
      if (envelope.command.type === 'CancelConstruction') {
        constructions.length = 0
        planet.fields_reserved = 0
      } else {
        constructions.push({
          id: id(30 + sent.length),
          body: body.id,
          building: 'Terraformer',
          target_level: 1,
          due_at: Date.now() + 564000,
          paid,
        })
        planet.fields_reserved = 1
      }
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
      if (state === 'technical')
        await page
          .getByText('Technical data', { exact: true })
          .evaluate((element) => element.scrollIntoView({ block: 'start' }))
      if (state === 'empire')
        await page
          .getByText('100/105 fields', { exact: false })
          .evaluate((element) => element.scrollIntoView({ block: 'center' }))
      await diagnosticScreenshot(page, {
        path: `test-results/terraformer-${state}-${width}x900.png`,
        fullPage: false,
        animations: 'disabled',
      })
    }
    const change = async (code?: S['GameError3']) => {
      planet.energy.supply =
        code === 'EnergyRequired' ? '999000000' : '1000000000'
      planet.fields_used = code === 'NoFreeField' ? 100 : 99
      blockers = code
        ? [
            {
              code,
              requirement: null,
              required: code === 'EnergyRequired' ? '1000000000' : null,
              actual: code === 'EnergyRequired' ? '999000000' : null,
              resource: null,
              unit: code === 'EnergyRequired' ? 'MicroEnergy' : null,
            },
          ]
        : []
      revision++
      await refreshGame(page)
    }
    await page.goto(`/u/andromeda/b/${body.id}/facilities`)
    const tile = page.getByRole('link', {
      name: 'Upgrade Terraformer',
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
    await expect(pane).toContainText('+5 fields → 105 fields')
    await expect(pane).toContainText('energy is not consumed or reserved')
    await capture('ready')
    await change('EnergyRequired')
    await expect(confirm).toBeDisabled()
    await expect(pane.getByLabel('Action blockers')).toContainText(
      'mine demand is not subtracted',
    )
    await expect(pane.getByText('Energy after build')).toHaveCount(0)
    await capture('energy-blocked')
    await change('NoFreeField')
    await expect(confirm).toBeDisabled()
    await expect(pane.getByLabel('Action blockers')).toContainText(
      'Free a field',
    )
    await capture('fields-blocked')
    await change()
    await confirm.click()
    await expect.poll(() => sent.length).toBe(1)
    await expect(
      pane.getByRole('region', { name: 'Active construction' }),
    ).toBeVisible()
    await capture('constructing')
    await pane.getByRole('button', { name: /Cancel construction/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await capture('cancellation')
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Confirm cancellation' })
      .click()
    await expect(confirm).toBeEnabled()
    await confirm.click()
    await expect.poll(() => sent.length).toBe(3)
    planet.energy.supply = '2000000000'
    planet.levels.Terraformer = 1
    planet.fields = 105
    planet.fields_used = 100
    planet.fields_reserved = 0
    constructions.length = 0
    revision++
    await refreshGame(page)
    await expect(pane).toContainText('Level 1')
    await expect(pane).toContainText('105 fields')
    await expect(
      pane.getByRole('button', { name: 'Demolish Terraformer' }),
    ).toHaveCount(0)
    await capture('completed')
    await pane.getByText('Technical data', { exact: true }).click()
    await expect(pane).toContainText('Terraformer cannot be demolished')
    await expect(
      pane.getByRole('link', { name: 'Energy Technology 12', exact: true }),
    ).toBeVisible()
    await capture('technical')
    await page.goto('/u/andromeda/overview')
    await expect(
      page.getByText('100/105 fields', { exact: false }),
    ).toBeVisible()
    await capture('empire')
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  })
}
