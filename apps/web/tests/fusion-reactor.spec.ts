import { test, expect } from './fixtures/test'
import { shellFixture, body, binding } from './fixtures/game'
import { openProductionSettings } from './fixtures/production-settings'
import { readFileSync } from 'node:fs'
import type { components } from '../src/contracts'
type S = components['schemas']
const content = JSON.parse(
  readFileSync(
    new URL('../../../rules/content/fusion-reactor.json', import.meta.url),
    'utf8',
  ),
)
const catalog = JSON.parse(
  readFileSync(
    new URL('../../../rules/mvp-v1-slice-13.json', import.meta.url),
    'utf8',
  ),
).catalog as S['CatalogEntry3'][]

for (const width of [320, 1440]) {
  test(`Fusion shows fuel-limited output and saves requested duty at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    const production: S['ProductionDto'] = {
      body: body.id,
      settings_revision: '0',
      settings: {
        metal_mine: 100,
        crystal_mine: 100,
        deuterium_synthesizer: 100,
        solar_plant: 100,
        fusion_reactor: 100,
        solar_satellite: 100,
      },
      editable: [
        'metal_mine',
        'crystal_mine',
        'deuterium_synthesizer',
        'solar_plant',
        'fusion_reactor',
      ],
      gross_per_hour: {
        metal: '40000000',
        crystal: '15000000',
        deuterium: '3333333',
      },
      fuel_deuterium_per_hour: '3333333',
      net_deuterium_per_hour: { sign: 'Nonnegative', magnitude: '0' },
      energy_supply: '33333333',
      energy_demand: '100000000',
      utilization: '333333',
      fuel_utilization: '166666',
      fusion_reactor: { energy_supply: '13333333', projection_limit: null },
    }
    await shellFixture(page, {
      protocol: 4,
      bodies: [
        {
          ...body,
          levels: { ...body.levels, FusionReactor: 5, DeuteriumSynthesizer: 5 },
          amounts: { ...body.amounts, deuterium: '0' },
        },
      ],
      production: [production],
      catalog: catalog.map((e) =>
        e.key.id === 'FusionReactor'
          ? { ...e, enabled: true, requirements: content.requirements }
          : e,
      ),
      viewerRevision: () => String(Number(production.settings_revision) + 1),
    })
    let sent: unknown
    await page.route('**/commands', async (route) => {
      const pair = route.request().postDataJSON()
      sent = pair.gameplay.command
      production.settings = pair.gameplay.command.settings
      production.settings_revision = '1'
      await route.fulfill({
        json: {
          protocol: 4,
          binding,
          command_id: pair.gameplay.command_id,
          admitted_at: Date.now(),
          executed_at: Date.now(),
          status: 'Committed',
          result_ids: [],
          minimum_viewer_revision: '2',
        },
      })
    })
    await page.goto(`/u/andromeda/b/${body.id}/resources`)
    await expect(
      page.getByRole('link', { name: 'Upgrade Fusion Reactor', exact: true }),
    ).toBeVisible()
    await openProductionSettings(page)
    const row = page
      .getByRole('row')
      .filter({
        has: page.getByRole('rowheader', {
          name: 'Fusion Reactor',
          exact: true,
        }),
      })
    await expect(row).toContainText('Fuel limited')
    await expect(row).toContainText('fuel / hour')
    await expect(
      row.getByRole('img', { name: 'Deuterium', exact: true }),
    ).toBeVisible()
    const slider = row.getByRole('slider')
    await slider.focus()
    await slider.press('Home')
    await expect
      .poll(() => sent)
      .toMatchObject({
        type: 'SetProduction',
        body: body.id,
        settings: { fusion_reactor: 0 },
      })
    await expect(slider).toHaveValue('0')
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
  })
}
