import { test, expect } from '@playwright/test'
import { shellFixture, body, binding, id } from './fixtures/game'
import { readFileSync } from 'node:fs'
import type { components } from '../src/contracts'
type S = components['schemas']
const item = { kind: 'Ship', id: 'HeavyFighter' } as const
const catalog = JSON.parse(
  readFileSync(
    new URL('../../../rules/mvp-v1-slice-7.json', import.meta.url),
    'utf8',
  ),
).catalog as S['CatalogEntry3'][]
const bound = (request_id: string, data: unknown) => ({
  protocol: 4,
  binding,
  request_id,
  viewer_revision: '1',
  sampled_at: Date.now(),
  as_of_ms: Date.now(),
  data,
})

async function setup(page: Parameters<typeof shellFixture>[0], impulse = 2) {
  const planet = {
    ...body,
    amounts: {
      metal: '30000000000',
      crystal: '20000000000',
      deuterium: '10000000000',
    },
    levels: { ...body.levels, Shipyard: 3, RoboticsFactory: 2, ResearchLab: 2 },
    inventories: [{ item, count: '2' }],
  }
  await shellFixture(page, {
    protocol: 4,
    bodies: [planet],
    catalog,
    research: [
      { research: 'ArmourTechnology', level: 2 },
      { research: 'ImpulseDrive', level: impulse },
      { research: 'EnergyTechnology', level: 1 },
    ],
    extraCapabilities: ['Attack'],
    missions: {
      fleets: [],
      incoming: [],
      score_value_micro: '0',
      fleet_slots: '1',
    },
  })
  await page.route('**/progression-options', async (route) => {
    const { context, request } = route.request().postDataJSON()
    const heavy =
      request.type === 'Manufacture' && request.item.id === 'HeavyFighter'
    const cost = { metal: '6000000000', crystal: '4000000000', deuterium: '0' }
    await route.fulfill({
      json: {
        protocol: 4,
        binding,
        request_id: context.request_id,
        viewer_revision: '1',
        sampled_at: Date.now(),
        as_of_ms: Date.now(),
        request,
        terms: heavy
          ? {
              type: 'Manufacture',
              profile_hash: 'a'.repeat(64),
              body: body.id,
              item,
              quantity: request.quantity,
              unit_cost: cost,
              paid: Object.fromEntries(
                Object.entries(cost).map(([k, v]) => [
                  k,
                  (BigInt(v) * BigInt(request.quantity)).toString(),
                ]),
              ),
              unit_duration_ms: 3600000,
              formula: 'ManufactureClassic',
              facilities: [
                { building: 'Shipyard', level: 3 },
                { building: 'NaniteFactory', level: 0 },
              ],
            }
          : null,
        terms_hash: heavy ? 'b'.repeat(64) : null,
        blockers: !heavy
          ? [
              {
                code: 'UnavailableContent',
                requirement: null,
                required: null,
                actual: null,
                resource: null,
                unit: null,
              },
            ]
          : impulse < 2
            ? [
                {
                  code: 'PrerequisiteMissing',
                  requirement: {
                    type: 'PlayerResearch',
                    research: 'ImpulseDrive',
                    level: 2,
                  },
                  required: '2',
                  actual: String(impulse),
                  resource: null,
                  unit: 'Level',
                },
              ]
            : [],
        estimates: null,
      },
    })
  })
}

test('Heavy Fighter exposes its missing Impulse Drive prerequisite', async ({
  page,
}) => {
  await setup(page, 1)
  await page.goto(`/u/andromeda/b/${body.id}/shipyard`)
  await page
    .getByRole('button', { name: 'Build Heavy Fighter', exact: true })
    .click()
  const pane = page.getByRole('region', { name: 'Progression quote' })
  await expect(pane).toContainText('Impulse Drive')
  await expect(
    pane.getByRole('button', { name: 'Build', exact: true }),
  ).toBeDisabled()
  await expect(pane.getByLabel('Action blockers')).toContainText(
    'Impulse Drive',
  )
})

test('Heavy Fighter submits the selected build quantity', async ({ page }) => {
  await setup(page)
  const pane = page.getByRole('region', { name: 'Progression quote' })
  let sent: unknown = null
  await page.route('**/commands', async (route) => {
    const pair = route.request().postDataJSON()
    sent = pair.gameplay.command
    await route.fulfill({
      json: {
        protocol: 4,
        binding,
        command_id: pair.gameplay.command_id,
        admitted_at: Date.now(),
        executed_at: Date.now(),
        status: 'Committed',
        result_ids: [id(80)],
        minimum_viewer_revision: '1',
      },
    })
  })
  await page.goto(`/u/andromeda/b/${body.id}/shipyard`)
  await page
    .getByRole('button', { name: 'Build Heavy Fighter', exact: true })
    .click()
  await expect(pane).toContainText('An impulse-powered combat ship')
  await expect(pane.locator('img').first()).toHaveAttribute(
    'src',
    /heavy-fighter/,
  )
  await page.getByLabel('Shipyard quantity').fill('2')
  await expect(
    pane.getByRole('button', { name: 'Metal details' }),
  ).toContainText('12,000')
  await expect(
    pane.getByRole('button', { name: 'Crystal details' }),
  ).toContainText('8,000')
  await pane.getByRole('button', { name: 'Build', exact: true }).click()
  await expect
    .poll(() => sent)
    .toMatchObject({
      type: 'StartManufacture',
      body: body.id,
      item,
      quantity: '2',
    })
})

test('Heavy Fighters can be selected, quoted and launched in an attack fleet', async ({
  page,
}) => {
  await setup(page)
  const target = {
    type: 'Body',
    id: id(90),
    expected_kind: 'Planet',
    expected_owner: id(91),
  }
  await page.route('**/world', async (route) => {
    const request = route.request().postDataJSON()
    await route.fulfill({
      json: bound(
        request.context.request_id,
        request.type === 'ResolveDestination'
          ? target
          : {
              intent: request.intent,
              profile_hash: 'a'.repeat(64),
              terms_hash: 'b'.repeat(64),
              distance: 1005,
              speeds: [['HeavyFighter', '14000']],
              duration_ms: 360000,
              fuel: '20000000',
              capacity: '200000000',
              maximum_payload: '180000000',
              slot_limit: '1',
            },
      ),
    })
  })
  let sent: unknown = null
  await page.route('**/commands', async (route) => {
    const pair = route.request().postDataJSON()
    sent = pair.gameplay.command
    await route.fulfill({
      json: {
        protocol: 4,
        binding,
        command_id: pair.gameplay.command_id,
        admitted_at: Date.now(),
        executed_at: Date.now(),
        status: 'Committed',
        result_ids: [id(80)],
        minimum_viewer_revision: '1',
      },
    })
  })
  await page.goto(`/u/andromeda/dispatch?body=${body.id}`)
  await page
    .getByRole('combobox', { name: 'Mission', exact: true })
    .selectOption('Attack')
  await page.getByLabel('Position', { exact: true }).fill('8')
  await page
    .getByRole('textbox', { name: 'Heavy Fighter · 2 available' })
    .fill('2')
  await page.getByRole('button', { name: 'Review fleet', exact: true }).click()
  const quote = page.getByRole('region', { name: 'Fleet quote' })
  await expect(quote).toContainText('2 Heavy Fighter')
  await quote.getByRole('button', { name: /Send/ }).click()
  await expect
    .poll(() => sent)
    .toMatchObject({
      type: 'World',
      action: {
        type: 'LaunchFleet',
        intent: {
          mission: 'Attack',
          ships: [
            { owner: binding.player, ship_type: 'HeavyFighter', count: '2' },
          ],
        },
      },
    })
})
