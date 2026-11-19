import { test, expect, type Page } from './fixture'
import { mountHud } from './mount-hud'
import type { EmpireSceneInput } from './empire-runtime'
import type {} from './empire.scenarios'
import type { components } from '../../src/contracts'
import { body, binding, id } from '../../src/test-support/empire'
type S = components['schemas']
const now = 1_800_000_000_000
const target: S['MissionDestination4'] = {
  type: 'Body',
  id: id(90),
  expected_owner: id(91),
  expected_kind: 'Planet',
}
const coordinates = { galaxy: 1, system: 2, position: 8 }
const group: S['AttackGroup4'] = {
  id: id(71),
  revision: 1,
  initiator: id(92),
  target,
  coordinates,
  arrival_at: now + 600000,
  joining_open: true,
  can_join: true,
  members: [
    {
      owner: id(92),
      own_fleet: null,
      ships: [{ ship_type: 'Cruiser', count: '12' }],
    },
  ],
}
const missions: S['MissionView4'] = {
  fleets: [],
  incoming: [
    {
      attack_group: id(81),
      sender: id(93),
      origin: { galaxy: 1, system: 3, position: 4 },
      target: body.id,
      mission: 'Attack',
      arrival_at: now + 300000,
      ships: { visibility: 'Unknown' },
    },
  ],
  fleet_slots: '5',
  score_value_micro: '0',
}
const playerNames = { [id(92)]: 'Cassiopeia', [id(93)]: 'Vega' }
async function prepare(
  page: Page,
  mount: (name: string) => Promise<void>,
  input: EmpireSceneInput,
) {
  await page.addInitScript(
    (input) => {
      window.empireInput = input
    },
    { ...input, screen: 'fleets' as const, sampledAt: now },
  )
  await mount('empire')
}
async function fits(page: Page) {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  }
}
test('an invited fleet route offers Join, omits invitation administration and retains unknown hostile composition', async ({
  page,
  mount,
}) => {
  await prepare(page, mount, {
    bodies: [body],
    missions,
    attackGroups: [group],
    playerNames,
  })
  const invitations = page.getByRole('region', { name: 'Alliance attacks' })
  await expect(invitations).toContainText('Cassiopeia')
  await expect(
    invitations.getByRole('button', { name: 'Join attack', exact: true }),
  ).toBeVisible()
  await expect(
    invitations.getByRole('button', { name: 'Invite players', exact: true }),
  ).toHaveCount(0)
  const hostile = page.getByRole('article', { name: 'Incoming attack fleet' })
  await expect(hostile).toContainText('Alliance attack')
  await expect(hostile).toContainText('Ship composition unknown')
  await fits(page)
})
test('the command HUD exposes the funded Fleets destination for an open group invitation', async ({
  page,
  mount,
}) => {
  await mountHud(page, mount, { missions, attackGroups: [group], playerNames })
  await page.getByTestId('command-orb').click()
  const link = page.getByRole('link', { name: 'Alliance attack invitations' })
  await expect(link).toBeVisible()
  await expect(link).toHaveAttribute('href', `/u/andromeda/b/${body.id}/fleets`)
  await fits(page)
})
test('reviewed Depot supply and recall reach the real holdings list and update distinct fleets', async ({
  page,
  mount,
}) => {
  const planet = {
    ...structuredClone(body),
    name: 'Hades',
    levels: { ...body.levels, AllianceDepot: 1 },
    amounts: {
      metal: '100000000000',
      crystal: '100000000000',
      deuterium: '100000000000',
    },
  }
  const holdings: S['HeldFleetView4'][] = [
    {
      id: id(81),
      owner: id(90),
      target: body.id,
      ships: [{ ship_type: 'LightFighter', count: '1000' }],
      departure_at: now + 3600000,
      can_supply: true,
    },
  ]
  const depots: S['DepotView4'][] = [
    {
      body: body.id,
      remaining_budget: '10000000000',
      next_budget_release_at: null,
    },
  ]
  const own: S['OwnMission4'] = {
    id: id(82),
    intent: {
      origin: body.id,
      destination: {
        type: 'Body',
        id: id(83),
        expected_kind: 'Planet',
        expected_owner: id(90),
      },
      mission: 'Hold',
      hold_hours: 2,
      ships: [{ owner: binding.player, ship_type: 'SmallCargo', count: '2' }],
      cargo: { metal: '0', crystal: '0', deuterium: '0' },
      speed_percent: 100,
    },
    origin: body.coordinates,
    destination: { galaxy: 1, system: 3, position: 8 },
    leg: 'Holding',
    ships: [{ ship_type: 'SmallCargo', count: '2' }],
    cargo: { metal: '0', crystal: '0', deuterium: '0' },
    due_at: now + 7200000,
    launched_at: now - 3600000,
    duration_ms: 120000,
    paid_fuel: '50000000',
    can_recall: true,
  }

  await prepare(page, mount, {
    bodies: [planet],
    holdings,
    depots,
    missions: {
      fleets: [own],
      incoming: [],
      score_value_micro: '0',
      fleet_slots: '5',
    },
    playerNames: { [id(90)]: 'Cassiopeia' },
    catalog: [
      {
        key: { kind: 'Building', id: 'AllianceDepot' },
        enabled: true,
        mobile: false,
        body_kinds: ['Planet'],
        requirements: [],
      },
    ],
  })
  await expect(
    page.getByRole('heading', { name: 'Hold Holding' }),
  ).toBeVisible()
  await expect(page.getByText('Departs in', { exact: true })).toBeVisible()
  const visitingFleet = page.getByRole('article').filter({
    has: page.getByRole('heading', { name: /Cassiopeia.*Defending/ }),
  })
  const departureLabel = visitingFleet.locator('header').getByText(/^Departs /)
  const [originalDeparture, extendedDeparture] = await page.evaluate(
    (epoch) => {
      const formatter = new Intl.DateTimeFormat(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short',
      })
      return [1, 3].map(
        (hours) => 'Departs ' + formatter.format(epoch + hours * 3600000),
      )
    },
    now,
  )
  await expect(departureLabel).toHaveText(originalDeparture)
  await visitingFleet
    .getByRole('button', { name: 'Supply fleet', exact: true })
    .click()
  await visitingFleet
    .getByRole('textbox', { name: 'Deuterium to supply' })
    .fill('4000')
  await visitingFleet
    .getByRole('button', { name: 'Review supply', exact: true })
    .click()
  await expect(
    visitingFleet
      .getByText('Additional defense', { exact: true })
      .locator('..')
      .locator('dd'),
  ).toHaveText('2 hours')
  await expect(
    visitingFleet
      .getByText('Budget after supply', { exact: true })
      .locator('..')
      .locator('dd'),
  ).toHaveText('6,000')
  await visitingFleet
    .getByRole('button', { name: 'Supply deuterium', exact: true })
    .click()
  await expect(
    visitingFleet.getByRole('status').filter({ hasText: 'Supply delivered' }),
  ).toBeVisible()

  await expect(
    page.getByText(/Available this rolling hour:/).getByTitle('Deuterium'),
  ).toHaveText('6,000')

  await expect(departureLabel).toHaveText(extendedDeparture)

  await page.getByRole('button', { name: 'Review recall', exact: true }).click()
  await expect(
    page.getByText(/return leg uses the original flight duration/),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Recall fleet', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Hold Returning' }),
  ).toBeVisible()

  const commands = await page.evaluate(() =>
    window.empireScene.sent.map((e) => e.command),
  )
  expect(commands).toMatchObject([
    {
      type: 'World',
      action: {
        type: 'SupplyHoldingFleet',
        expected_terms_hash: 'b'.repeat(64),
        intent: {
          source_planet: body.id,
          fleet: id(81),
          deuterium: '4000000000',
        },
      },
    },
    { type: 'World', action: { type: 'RecallMission', fleet: id(82) } },
  ])
  await fits(page)
})

test('a hostile fleet notification opens the HUD at the received attack and its native manifest disclosure', async ({
  page,
  mount,
}) => {
  const arrival = Date.UTC(2026, 10, 2, 12) + 360000
  await page.setViewportSize({ width: 390, height: 900 })
  await mountHud(page, mount, {
    missions: {
      fleets: [],
      incoming: [
        {
          sender: id(90),
          origin: { galaxy: 1, system: 15, position: 7 },
          target: body.id,
          mission: 'Attack',
          arrival_at: arrival,
          ships: {
            visibility: 'Exact',
            total: '30',
            ships: [{ ship_type: 'Cruiser', count: '30' }],
          },
        },
      ],
      fleet_slots: '8',
      score_value_micro: '0',
    },
    playerNames: { [id(90)]: 'Commander Vega' },
  })
  const notification = page.getByRole('button', {
    name: /Hostile fleet inbound/,
  })
  await expect(notification).toBeVisible()
  await notification.click()
  const dialog = page.getByRole('dialog')
  const attack = dialog.getByRole('article', { name: 'Incoming attack fleet' })
  await expect(attack).toBeVisible()
  await attack
    .getByRole('button', {
      name: 'Incoming Attack ship composition: 30 ships',
      exact: true,
    })
    .click()
  await expect(
    attack
      .getByRole('list', { name: 'Ship composition' })
      .getByRole('listitem'),
  ).toHaveText(['Cruiser 30'])
  await dialog.getByRole('button', { name: 'Close command HUD' }).click()
  await expect(dialog).toBeHidden()
})

test('a moon displays its local ships but its visiting defence fleet is supplied from its parent planet', async ({
  page,
  mount,
}) => {
  const home = {
    ...body,
    name: 'Terra',
    levels: { ...body.levels, AllianceDepot: 1 },
    amounts: { ...body.amounts, deuterium: '100000000000' },
  }
  const moon = {
    ...body,
    id: id(80),
    name: 'Luna',
    kind: 'Moon' as const,
    moon: { parent: home.id, created_at: 1000 },
    inventories: [
      {
        item: { kind: 'Ship' as const, id: 'SmallCargo' as const },
        count: '2',
      },
    ],
  }
  await prepare(page, mount, {
    bodies: [home, moon],
    depots: [
      {
        body: home.id,
        remaining_budget: '10000000000',
        next_budget_release_at: null,
      },
    ],
    holdings: [
      {
        id: id(81),
        owner: id(90),
        target: moon.id,
        ships: [{ ship_type: 'LightFighter', count: '1000' }],
        departure_at: now + 3600000,
        can_supply: true,
      },
    ],
    missions: {
      fleets: [],
      incoming: [],
      score_value_micro: '0',
      fleet_slots: '5',
    },
    catalog: [
      {
        key: { kind: 'Building', id: 'AllianceDepot' },
        enabled: true,
        mobile: false,
        body_kinds: ['Planet'],
        requirements: [],
      },
      {
        key: { kind: 'Ship', id: 'SmallCargo' },
        enabled: true,
        mobile: true,
        body_kinds: ['Planet'],
        requirements: [],
      },
    ],
  })
  await page.evaluate((id) => window.selectPreparedEmpireBody(id), moon.id)
  await expect(
    page.getByRole('region', { name: 'Stationed ships' }),
  ).toContainText('Small Cargo')
  const supply = page.getByRole('region', { name: 'Allied defense' })
  await expect(supply).toContainText(
    'Supply comes from Terra on the parent planet',
  )
  await supply
    .getByRole('button', { name: 'Supply fleet', exact: true })
    .click()
  await supply
    .getByRole('button', { name: 'Review supply', exact: true })
    .click()
  await expect(
    supply.getByText('Additional defense', { exact: true }),
  ).toBeVisible()
  await supply
    .getByRole('button', { name: 'Supply deuterium', exact: true })
    .click()
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.empireScene.sent.flatMap((envelope) => {
          if (
            envelope.protocol !== 4 ||
            envelope.command.type !== 'World' ||
            envelope.command.action.type !== 'SupplyHoldingFleet'
          )
            return []
          const presence = envelope.presence?.command
          return [
            {
              intent: envelope.command.action.intent,
              presence: presence?.type === 'World' ? presence.action : null,
              paired:
                presence?.type === 'World' &&
                presence.action.type === 'RecordForegroundPresence' &&
                presence.action.paired_command_id === envelope.command_id,
            },
          ]
        }),
      ),
    )
    .toEqual([
      {
        intent: {
          source_planet: home.id,
          fleet: id(81),
          deuterium: '1000000000',
        },
        presence: {
          type: 'RecordForegroundPresence',
          cause: 'GameplayGesture',
          body: home.id,
          paired_command_id: expect.any(String),
        },
        paired: true,
      },
    ])
})
