import { withFixtureResponse } from './fixtures/responses'
import { routeProgressionOptions } from './fixtures/progression-options'
import { selectBody } from './fixtures/body-selector'
import { test, expect } from './fixtures/test'
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
async function setup(
  page: Parameters<typeof shellFixture>[0],
  impulse = 2,
  options: Parameters<typeof shellFixture>[1] = {},
) {
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
    ...options,
    missions: {
      fleets: [],
      incoming: [],
      score_value_micro: '0',
      fleet_slots: '1',
    },
  })
  await routeProgressionOptions(page, async (route) => {
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
              body: request.body,
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

test('manufacturing affordability follows the selected planet', async ({
  page,
}) => {
  const rich = structuredClone(body)
  rich.amounts = {
    metal: '18000000000',
    crystal: '12000000000',
    deuterium: '0',
  }
  const poor = {
    ...structuredClone(rich),
    id: id(6),
    coordinates: { galaxy: 1, system: 2, position: 3 },
    amounts: { ...rich.amounts, metal: '17999999999' },
  }
  await setup(page, 2, { bodies: [rich, poor] })
  await withFixtureResponse(
    page,
    (response) => response.url().endsWith('/bootstrap'),
    () => page.goto(`/u/andromeda/b/${body.id}/shipyard/heavy-fighter`),
  )
  const pane = page.getByRole('region', { name: 'Progression quote' })
  const build = pane.getByRole('button', { name: 'Build', exact: true })
  await page.getByLabel('Shipyard quantity').fill('3')
  await expect(build).toBeEnabled()
  await selectBody(page, poor.id)
  await page.getByLabel('Shipyard quantity').fill('3')
  await expect(build).toBeDisabled()
  await expect(pane.getByLabel('Missing resources')).toContainText(
    /Missing\s*1/,
  )
  await selectBody(page, rich.id)
  await page.getByLabel('Shipyard quantity').fill('3')
  await expect(build).toBeEnabled()
  await expect(pane.getByLabel('Missing resources')).toHaveCount(0)
})
