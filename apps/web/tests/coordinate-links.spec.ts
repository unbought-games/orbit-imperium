import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { test, expect, type Page } from './fixtures/test'
import type { components } from '../src/contracts'
import { shellFixture, binding, body, id, resources } from './fixtures/game'

type S = components['schemas']
const now = 1792756800000
const destination = { galaxy: 1, system: 5, position: 12 }
const other = {
  ...body,
  id: id(8),
  name: 'Hades',
  coordinates: { galaxy: 1, system: 2, position: 4 },
}
const fleet: S['OwnMission4'] = {
  id: id(30),
  intent: {
    origin: other.id,
    destination: {
      type: 'Body',
      id: id(99),
      expected_kind: 'Planet',
      expected_owner: id(90),
    },
    mission: 'Attack',
    ships: [{ owner: binding.player, ship_type: 'SmallCargo', count: '3' }],
    cargo: { metal: '100000000', crystal: '0', deuterium: '0' },
    speed_percent: 100,
  },
  origin: other.coordinates,
  destination,
  leg: 'Outbound',
  ships: [{ ship_type: 'SmallCargo', count: '3' }],
  cargo: resources,
  due_at: now + 180000,
  launched_at: now - 180000,
  duration_ms: 360000,
  paid_fuel: '1000000',
  can_recall: true,
}

async function setup(page: Page, leg: S['OwnMission4']['leg'] = 'Outbound') {
  await page.clock.setFixedTime(now)
  await shellFixture(page, {
    protocol: 4,
    sampledAt: now,
    universeName: 'Andromeda Prime',
    bodies: [body, other],
    extraCapabilities: ['Reports'],
    missions: {
      fleets: [{ ...fleet, leg }],
      incoming: [],
      score_value_micro: '0',
      fleet_slots: '2',
    },
  })
  const requests: { galaxy: number; system: number }[] = []
  await page.route('**/world', async (route) => {
    const { context, galaxy, system } = route.request().postDataJSON()
    requests.push({ galaxy, system })
    await route.fulfill({
      json: {
        protocol: 4,
        binding,
        request_id: context.request_id,
        viewer_revision: '1',
        sampled_at: now,
        as_of_ms: now,
        data: {
          galaxy,
          system,
          observed_at: now,
          player_names: {},
          positions: Array.from({ length: 15 }, (_, i) => ({
            coordinates: { galaxy, system, position: i + 1 },
            body: null,
            debris: null,
          })),
        },
      },
    })
  })
  return requests
}
const path = (page: string) => `/u/andromeda-prime/b/${body.id}/${page}`
async function assertLocation(page: Page, system: number, position: number) {
  await expect(page).toHaveURL(
    new RegExp(
      `/b/${body.id}/galaxy\\?galaxy=1&system=${system}&position=${position}$`,
    ),
  )
  await expect(
    page.getByRole('combobox', { name: 'Selected body' }),
  ).toHaveValue(body.id)
  const selected = page.locator('li[aria-current="location"]')
  await expect(selected).toHaveAttribute('id', `position-${position}`)
  await expect(selected).toContainText(
    `Selected location [1:${system}:${position}]`,
  )
  await expect(selected).toBeInViewport()
  await expect(selected).toBeFocused()
  await expect(selected).toContainText('Empty position')
  await expect(page.locator('a a, button a, a button')).toHaveCount(0)
}
for (const width of [1280, 390, 320]) {
  test(`mission endpoints retain planet context and browser history at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 })
    const requests = await setup(page)
    await page.goto(path(`fleets/${fleet.id}`))
    const target = page
      .getByRole('link', {
        name: 'View destination [1:5:12] in galaxy',
        exact: true,
      })
      .first()
    await expect(target).toBeVisible()
    await diagnosticScreenshot(page, {
      path: `test-results/coordinate-mission-${width}.png`,
    })
    await target.focus()
    await page.keyboard.press('Enter')
    await assertLocation(page, 5, 12)
    expect(requests.at(-1)).toEqual({ galaxy: 1, system: 5 })
    await diagnosticScreenshot(page, {
      path: `test-results/coordinate-galaxy-${width}.png`,
    })
    await page.reload()
    await assertLocation(page, 5, 12)
    await page.goBack()
    await expect(page).toHaveURL(path(`fleets/${fleet.id}`))
    await page
      .getByRole('link', { name: 'View origin [1:2:4] in galaxy', exact: true })
      .first()
      .click()
    await assertLocation(page, 2, 4)
    await page.getByRole('button', { name: 'Next system', exact: true }).click()
    await expect(
      page.getByRole('combobox', { name: 'Solar system' }),
    ).toHaveValue('3')
    await expect(page.locator('li[aria-current="location"]')).toHaveCount(0)
    await page.goBack()
    await assertLocation(page, 2, 4)
    await page.goBack()
    await page.getByRole('link', { name: 'All fleets', exact: true }).click()
    await expect(
      page.getByRole('button', { name: 'Review recall', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Mission details', exact: true }),
    ).toBeVisible()
  })
}

test('returning mission keeps origin and destination labels unambiguous', async ({
  page,
}) => {
  await setup(page, 'Returning')
  await page.goto(path(`fleets/${fleet.id}`))
  const mission = page.getByRole('article', { name: 'Attack fleet' })
  await expect(mission).toContainText('←')
  await mission
    .getByRole('link', {
      name: 'View destination [1:5:12] in galaxy',
      exact: true,
    })
    .click()
  await assertLocation(page, 5, 12)
})

test('context-free direct links preserve coordinates and invalid locations are safe', async ({
  page,
}) => {
  const requests = await setup(page)
  await page.goto('/u/andromeda-prime/galaxy?galaxy=1&system=5&position=12')
  await assertLocation(page, 5, 12)
  requests.length = 0
  await page.goto(path('galaxy?galaxy=1&system=500&position=12'))
  await expect(page.getByRole('alert')).toContainText('outside this universe')
  expect(requests).toEqual([])
  await page.goto(path('galaxy?galaxy=1&system=-1&position=12'))
  await expect(
    page.getByRole('heading', { name: 'Destination unavailable', exact: true }),
  ).toBeVisible()
  expect(requests).toEqual([])
})

test('menu and empire coordinates browse other owned worlds without changing selection', async ({
  page,
}) => {
  await setup(page)
  await page.goto(path('overview'))
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    const headerLink = page
      .getByRole('group', { name: 'Planet and resources' })
      .getByRole('link', { name: 'View [1:371:12] in galaxy', exact: true })
    expect((await headerLink.boundingBox())!.height).toBeGreaterThanOrEqual(24)
    await headerLink.click()
    await assertLocation(page, 371, 12)
    await page.goBack()
  }
  const dossier = page.getByRole('article', {
    name: 'Hades [1:2:4] dossier',
    exact: true,
  })
  await dossier
    .getByRole('link', { name: 'View [1:2:4] in galaxy', exact: true })
    .click()
  await assertLocation(page, 2, 4)
  await page.goBack()
  await page
    .getByRole('combobox', { name: 'Selected body' })
    .selectOption(other.id)
  await expect(page).toHaveURL(new RegExp(`/b/${other.id}/overview$`))
})

for (const [kind, payload, linkName] of [
  [
    'Espionage',
    {
      kind: 'Espionage',
      observed_at: now,
      target: {
        body: id(99),
        kind: 'Planet',
        owner: id(90),
        coordinates: destination,
      },
      resources: { visibility: 'Unknown' },
      fleet: { visibility: 'Unknown' },
      defenses: { visibility: 'Unknown' },
      buildings: { visibility: 'Unknown' },
      research: { visibility: 'Unknown' },
      activity: { type: 'None' },
      counterespionage: { probability_ppm: 0, detected: false },
    },
    'View target [1:5:12] in galaxy',
  ],
  [
    'Combat',
    {
      kind: 'Combat',
      at: now,
      target: destination,
      outcome: 'Draw',
      mission: 'Attack',
      rounds: [],
      participants: [],
      survivors: [],
      gross_losses: [],
      recovered: [],
      debris: resources,
      loot: resources,
    },
    'View target [1:5:12] in galaxy',
  ],
  [
    'Delivered',
    {
      kind: 'Delivered',
      at: now,
      sender: binding.player,
      recipient: id(90),
      origin: other.coordinates,
      target: destination,
      cargo: resources,
    },
    'View destination [1:5:12] in galaxy',
  ],
  [
    'ColonizationFailed',
    {
      kind: 'ColonizationFailed',
      fleet: fleet.id,
      origin: other.id,
      at: now,
      return_at: now + 180000,
      destination_coordinates: destination,
      reason: 'Occupied',
    },
    'View destination [1:5:12] in galaxy',
  ],
] satisfies [string, S['ReportPayload4'], string][]) {
  test(`${kind} report links recorded coordinates when the historical body is missing`, async ({
    page,
  }) => {
    await setup(page)
    const header = {
      id: id(62),
      kind,
      observed_at: now - 3600000,
      read: true,
      hidden: false,
    }
    await page.route('**/api/**/reports**', async (route) => {
      const request = route.request().postDataJSON()
      await route.fulfill({
        json: {
          protocol: 4,
          binding,
          request_id: (request.context ?? request).request_id,
          viewer_revision: '1',
          sampled_at: now,
          as_of_ms: now,
          data: new URL(route.request().url()).pathname.endsWith(header.id)
            ? { header, payload }
            : {
                items: [header],
                has_more: false,
                next_cursor: null,
                as_of_ms: now,
              },
        },
      })
    })
    await page.goto(`/u/andromeda-prime/reports/${header.id}?body=${body.id}`)
    await expect(
      page.getByRole('link', { name: linkName, exact: true }),
    ).toBeVisible()
    await page.getByRole('link', { name: linkName, exact: true }).click()
    await assertLocation(page, 5, 12)
    await page.goBack()
    await expect(
      page.getByRole('link', { name: 'Back to reports', exact: true }),
    ).toBeVisible()
    await expect(page.locator('a a, button a, a button')).toHaveCount(0)
  })
}
