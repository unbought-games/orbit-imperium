import { test, expect, type Page } from './fixture'
import { body, id, binding } from '../../src/test-support/empire'
import type {} from './empire.scenarios'

const now = 1800000000000
const fleet = {
  id: id(61),
  origin: body.coordinates,
  destination: { galaxy: 1, system: 372, position: 10 },
  intent: {
    origin: body.id,
    destination: {
      type: 'Body' as const,
      id: id(60),
      expected_kind: 'Planet' as const,
      expected_owner: id(9),
    },
    mission: 'Transport' as const,
    ships: [
      { owner: binding.player, ship_type: 'SmallCargo' as const, count: '4' },
    ],
    cargo: { metal: '2000000000', crystal: '1000000000', deuterium: '0' },
    speed_percent: 100 as const,
  },
  leg: 'Outbound' as const,
  ships: [{ ship_type: 'SmallCargo' as const, count: '4' }],
  cargo: { metal: '2000000000', crystal: '1000000000', deuterium: '0' },
  due_at: now + 394000,
  launched_at: now - 100000,
  duration_ms: 494000,
  paid_fuel: '6000000',
  can_recall: true,
}

async function open(
  page: Page,
  mount: (name: string) => Promise<void>,
  detail: boolean,
) {
  await page.addInitScript(
    (input) => {
      window.empireInput = input
    },
    {
      sampledAt: now,
      bodies: [body],
      screen: 'fleets' as const,
      fleetId: detail ? fleet.id : undefined,
      missions: {
        fleets: [fleet],
        incoming: [],
        score_value_micro: '12345000000000',
        fleet_slots: '5',
      },
    },
  )
  await mount('empire')
  return page.getByRole('article', { name: 'Transport fleet' })
}
test('flight detail shows its exact manifest, arrival and recall review', async ({
  page,
  mount,
}) => {
  const mission = await open(page, mount, true)
  await expect(
    mission
      .getByRole('list', { name: 'Ship composition' })
      .getByRole('listitem'),
  ).toHaveText(['Small Cargo 4'])
  await expect(mission).toContainText('2,000')
  await expect(mission.locator('time')).toHaveAttribute(
    'datetime',
    new Date(fleet.due_at).toISOString(),
  )
  await page.getByRole('button', { name: 'Review recall', exact: true }).click()
  await expect(
    page.getByRole('region', { name: 'Review recall' }),
  ).toContainText('Estimated return if recalled now')
  expect(await page.evaluate(() => window.empireScene.sent.length)).toBe(0)
  await page.getByRole('button', { name: 'Keep mission', exact: true }).click()
})
test('loss of ship artwork and passing the arrival estimate cannot revoke a server-authorized recall', async ({
  page,
  mount,
}) => {
  await page.route('**/art/**', (route) => route.abort())
  const mission = await open(page, mount, false)
  await mission
    .getByRole('button', {
      name: 'Transport ship composition: 4 ships',
      exact: true,
    })
    .click()
  await expect(
    mission
      .getByRole('list', { name: 'Ship composition' })
      .getByRole('listitem'),
  ).toHaveText(['Small Cargo 4'])
  await expect(mission).toContainText('6m 34s')
  await page.evaluate(() => window.empireScene.tick(400000))
  await expect(mission).toContainText('Awaiting confirmation')
  await mission
    .getByRole('button', { name: 'Review recall', exact: true })
    .click()
  await expect(
    page.getByRole('region', { name: 'Review recall' }),
  ).toContainText('The server will confirm the return time')
  await page.evaluate(() => {
    window.empireScene.setOutcome('uncertain')
    window.empireScene.hold()
  })
  try {
    await page
      .getByRole('button', { name: 'Recall fleet', exact: true })
      .click()
    await expect(
      mission.getByRole('button', { name: 'Recall requested', exact: true }),
    ).toBeDisabled()
    expect(
      await page.evaluate(() => window.empireScene.sent.map((e) => e.command)),
    ).toEqual([
      { type: 'World', action: { type: 'RecallMission', fleet: fleet.id } },
    ])
  } finally {
    await page.evaluate(() => window.empireScene.release())
  }
})
