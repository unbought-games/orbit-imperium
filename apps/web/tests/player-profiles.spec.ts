import { test, expect } from '@playwright/test'
import type { components } from '../src/contracts'
import {
  shellFixture,
  playerProfilesFixture,
  binding,
  body,
  id,
} from './fixtures/game'

test('Galaxy shows all three supporter levels and ordinary players, then removes changed and expired badges', async ({
  page,
}) => {
  await shellFixture(page, { protocol: 4 })
  await page.clock.install()
  const owners = [binding.player, id(31), id(32), id(33)]
  let tierTwo: number | undefined = 2
  let unavailable = false
  await playerProfilesFixture(page, () =>
    unavailable
      ? null
      : [
          { player: owners[0], username: 'MyCommander', supporter_tier: 1 },
          {
            player: owners[1],
            username: 'RoseCommander',
            supporter_tier: tierTwo,
          },
          {
            player: owners[2],
            username: 'ApricotCommander',
            supporter_tier: 3,
          },
          { player: owners[3], username: 'RegularCommander' },
        ],
  )
  await page.route('**/world', (route) => {
    const q = route.request().postDataJSON()
    return route.fulfill({
      json: {
        protocol: 4,
        binding,
        request_id: q.context.request_id,
        viewer_revision: '1',
        sampled_at: Date.now(),
        as_of_ms: Date.now(),
        data: {
          galaxy: q.galaxy,
          system: q.system,
          observed_at: Date.now(),
          positions: Array.from({ length: 15 }, (_, i) => ({
            coordinates: {
              galaxy: q.galaxy,
              system: q.system,
              position: i + 1,
            },
            body:
              i < owners.length
                ? {
                    id: id(40 + i),
                    kind: 'Planet',
                    owner: owners[i],
                    activity: { type: 'None' },
                    inactivity: 'Active',
                    vacation: false,
                    espionage_eligible: true,
                  }
                : null,
            debris: null,
          })),
        },
      },
    })
  })
  await page.goto(`/u/andromeda/galaxy?body=${body.id}`)
  const cards = page
    .getByRole('region', { name: 'Galaxy positions' })
    .getByRole('listitem')
  for (const [i, color] of [
    'rgb(133, 214, 239)',
    'rgb(240, 172, 212)',
    'rgb(242, 187, 131)',
  ].entries()) {
    await expect(
      cards.nth(i).getByRole('img', { name: /Supporter/ }),
    ).toBeVisible()
    await expect(
      cards
        .nth(i)
        .getByRole('img', { name: /Supporter/ })
        .locator('..'),
    ).toHaveCSS('color', color)
  }
  await expect(cards.nth(3)).toContainText('RegularCommander')
  await expect(
    cards.nth(3).getByRole('img', { name: /Supporter/ }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Menu', exact: true }).click()
  await expect(page.getByLabel('Username', { exact: true })).toContainText(
    'MyCommander',
  )
  await expect(
    page
      .getByLabel('Username', { exact: true })
      .getByRole('img', { name: /Supporter/ }),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await page.screenshot({
      path: `test-results/public-supporters-${width}.png`,
      fullPage: true,
    })
  }
  tierTwo = undefined
  await page.clock.fastForward(60_000)
  await expect(
    cards.nth(1).getByRole('img', { name: /Supporter/ }),
  ).toHaveCount(0)
  await expect(cards.nth(1)).toContainText('RoseCommander')
  unavailable = true
  await page.clock.fastForward(301_000)
  await expect(page.getByRole('img', { name: /Supporter/ })).toHaveCount(0)
  await expect(cards).toHaveCount(15)
})

test('incoming fleets and overview arrivals identify the same supporter', async ({
  page,
}) => {
  await shellFixture(page, {
    protocol: 4,
    missions: {
      fleets: [],
      incoming: [
        {
          sender: id(31),
          origin: { galaxy: 1, system: 2, position: 3 },
          target: body.id,
          mission: 'Attack',
          arrival_at: Date.now() + 600_000,
          ships: { visibility: 'Unknown' },
        },
      ],
      fleet_slots: '1',
      score_value_micro: '0',
    },
  })
  await playerProfilesFixture(page, () => [
    { player: id(31), username: 'Visitor', supporter_tier: 3 },
  ])
  await page.reload()
  const arrivals = page.getByRole('region', { name: 'Next to arrive' })
  await expect(arrivals.getByText('Visitor', { exact: true })).toBeVisible()
  await expect(arrivals.getByRole('img', { name: /Supporter/ })).toBeVisible()
  await page.goto(`/u/andromeda/fleets?body=${body.id}`)
  const incoming = page.getByRole('region', { name: 'Incoming fleets' })
  await expect(incoming.getByText('Visitor', { exact: true })).toBeVisible()
  await expect(incoming.getByRole('img', { name: /Supporter/ })).toBeVisible()
})

test('espionage and combat observations use current public identities without changing historical facts', async ({
  page,
}) => {
  await shellFixture(page, { protocol: 4 })
  await playerProfilesFixture(page, () => [
    { player: id(31), username: 'Observer', supporter_tier: 2 },
    { player: id(32), username: 'Defender' },
  ])
  let payload: components['schemas']['ReportPayload4'] = {
    kind: 'SpyContact',
    at: Date.now(),
    probability_ppm: 0,
    detected: false,
    sender: id(31),
    origin: { galaxy: 1, system: 1, position: 1 },
    target: { galaxy: 1, system: 1, position: 2 },
  }
  await page.route(`**/reports/${id(80)}`, (route) => {
    const context = route.request().postDataJSON()
    return route.fulfill({
      json: {
        protocol: 4,
        binding,
        request_id: context.request_id,
        viewer_revision: '1',
        sampled_at: Date.now(),
        as_of_ms: Date.now(),
        data: {
          header: {
            id: id(80),
            kind: payload.kind,
            observed_at: Date.now(),
            read: false,
            hidden: false,
          },
          payload,
        },
      },
    })
  })
  await page.goto(`/u/andromeda/reports/${id(80)}?body=${body.id}`)
  const observation = page.getByRole('region', { name: 'Report observation' })
  await expect(observation.getByText('Observer', { exact: true })).toBeVisible()
  await expect(
    observation.getByRole('img', { name: /Supporter/ }),
  ).toBeVisible()
  payload = {
    kind: 'Espionage',
    observed_at: Date.now(),
    resources: { visibility: 'Unknown' },
    fleet: { visibility: 'Unknown' },
    defenses: { visibility: 'Unknown' },
    buildings: { visibility: 'Unknown' },
    research: { visibility: 'Unknown' },
    activity: { type: 'None' },
    counterespionage: { probability_ppm: 0, detected: false },
    target: {
      owner: id(31),
      body: id(50),
      kind: 'Planet',
      coordinates: { galaxy: 1, system: 1, position: 2 },
    },
  }
  await page.reload()
  await expect(observation.getByText('Observer', { exact: true })).toBeVisible()
  payload = {
    kind: 'Combat',
    at: Date.now(),
    target: { galaxy: 1, system: 1, position: 2 },
    gross_losses: [],
    recovered: [],
    debris: { metal: '0', crystal: '0', deuterium: '0' },
    loot: { metal: '0', crystal: '0', deuterium: '0' },
    mission: 'Attack',
    outcome: 'Draw',
    participants: [
      {
        owner: id(31),
        side: 'Attacker',
        units: [],
        origin: { Fleet: id(50) },
        technology: [0, 0, 0],
      },
      {
        owner: id(32),
        side: 'Defender',
        units: [],
        origin: { Stationed: id(51) },
        technology: [0, 0, 0],
      },
    ],
    survivors: [
      { owner: id(31), side: 'Attacker', units: [], origin: { Fleet: id(50) } },
    ],
    rounds: [],
  }
  await page.reload()
  await expect(observation.getByText('Observer', { exact: true })).toHaveCount(
    2,
  )
  await expect(observation.getByText('Defender', { exact: true })).toBeVisible()
  await expect(observation.getByRole('img', { name: /Supporter/ })).toHaveCount(
    2,
  )
  await expect(observation.getByText('Draw', { exact: true })).toBeVisible()
})
