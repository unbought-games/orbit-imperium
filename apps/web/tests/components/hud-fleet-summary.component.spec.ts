import { expect, test } from './fixture'
import { mountHud } from './mount-hud'
import { body, binding, id } from '../fixtures/game'
import { diagnosticScreenshot } from '../fixtures/diagnostic-screenshot'
import type { components } from '../../src/contracts'
type S = components['schemas']
const baseTime = 1793120000000
const output = 'test-results/hud'
test('active HUD fleet accordion updates its actual flight rows, route links and ship disclosure as flights settle', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.install({ time: baseTime })
  await page.clock.pauseAt(baseTime)
  const bodies = [
    { ...body, name: 'Aster Prime' },
    {
      ...body,
      id: id(6),
      name: 'Vesper',
      coordinates: { galaxy: 1, system: 370, position: 4 },
    },
  ]
  const destinations: S['Destination'][] = [
    {
      id: id(47),
      name: 'Nova Bastion',
      kind: 'Planet',
      coordinates: { galaxy: 1, system: 372, position: 3 },
    },
  ]
  const massive: S['PublicShip4'][] = [
    { ship_type: 'LightFighter', count: '120000' },
    { ship_type: 'HeavyFighter', count: '60000' },
    { ship_type: 'Cruiser', count: '30000' },
    { ship_type: 'Battleship', count: '20000' },
    { ship_type: 'Battlecruiser', count: '10000' },
    { ship_type: 'Bomber', count: '5000' },
    { ship_type: 'Destroyer', count: '4000' },
    { ship_type: 'Dreadnought', count: '1000' },
  ]
  const makeFleet = (
    n: number,
    mission: S['Mission4'],
    leg: S['OwnMission4']['leg'],
    due: number,
  ): S['OwnMission4'] => {
    const ships =
      n === 912 ? massive : [{ ship_type: 'SmallCargo' as const, count: '3' }]
    const duration = n === 912 ? 7200000 : 300000
    return {
      id: id(n),
      intent: {
        origin: n === 910 ? body.id : id(6),
        destination: {
          type: 'Body',
          id: id(47),
          expected_owner: id(99),
          expected_kind: 'Planet',
        },
        mission,
        ships: ships.map((ship) => ({ ...ship, owner: binding.player })),
        cargo: { metal: '0', crystal: '0', deuterium: '0' },
        speed_percent: 100,
      },
      origin:
        n === 910 ? body.coordinates : { galaxy: 1, system: 370, position: 4 },
      destination: { galaxy: 1, system: 372, position: 3 },
      leg,
      ships,
      cargo: { metal: '0', crystal: '0', deuterium: '0' },
      due_at: baseTime + due,
      launched_at: baseTime + due - (leg === 'Returning' ? 2 : 1) * duration,
      duration_ms: duration,
      paid_fuel: '1000000',
      can_recall: leg === 'Outbound',
    }
  }
  await mountHud(page, mount, {
    bodies,
    destinations,
    missions: {
      fleets: [
        makeFleet(910, 'Transport', 'Outbound', 185000),
        makeFleet(911, 'Harvest', 'Returning', 65000),
        makeFleet(912, 'Attack', 'Outbound', 3725000),
      ],
      incoming: [],
      fleet_slots: '8',
      score_value_micro: '0',
    },
  })
  await expect(page.getByTestId('command-orb')).toBeVisible()
  await page.getByTestId('command-orb').click()
  const panel = page.getByRole('dialog', { name: 'Command uplink' })
  const toggle = panel.getByRole('button', { name: /Fleets/ })
  const list = panel.getByRole('list', { name: 'Empire fleets', exact: true })
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(toggle).toContainText('3 / 8 slots')
  await expect(list).toBeHidden()
  const allFleets = panel.getByRole('link', { name: 'All fleets', exact: true })
  await expect(allFleets).toHaveCount(1)
  await expect(allFleets).toHaveText('')
  await expect(allFleets).toHaveAttribute('title', 'All fleets')
  await diagnosticScreenshot(page, {
    path: `${output}/fleets-collapsed-390x844.png`,
  })
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  const rows = list.getByRole('article')
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(0)).toContainText('Harvest')
  await expect(rows.nth(0)).toContainText('Returning')
  await expect(
    rows
      .nth(0)
      .getByRole('img', {
        name: 'Returning: Vesper [1:370:4] ← Nova Bastion [1:372:3]',
        exact: true,
      }),
  ).toBeVisible()
  await expect(
    rows
      .nth(1)
      .getByRole('img', {
        name: 'Outbound: Aster Prime [1:371:12] → Nova Bastion [1:372:3]',
        exact: true,
      }),
  ).toBeVisible()
  await expect(rows.nth(2)).toContainText('250,000 ships')
  await expect(rows.nth(2).getByRole('timer')).toHaveText('Arrives in 1h 2m 5s')
  await expect(rows.nth(0).getByRole('timer')).toHaveText('Home in 1m 5s')
  await expect(panel.locator('time')).toHaveCount(0)
  await expect(rows.getByRole('timer')).toHaveCount(3)
  await diagnosticScreenshot(page, {
    path: `${output}/fleets-expanded-390x844.png`,
  })
  await page.clock.runFor(5000)
  await expect(rows.nth(2).getByRole('timer')).toHaveText('Arrives in 1h 2m 0s')
  await page.setViewportSize({ width: 320, height: 740 })
  expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  )
  expect(await list.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  )
  await diagnosticScreenshot(page, {
    path: `${output}/fleets-expanded-320x740.png`,
  })
  await toggle.focus()
  await page.keyboard.press('Enter')
  await expect(list).toBeHidden()
  await page.keyboard.press('Space')
  await expect(list).toBeVisible()
  await page.evaluate(async () => {
    window.hudScene.view.missions.fleets.splice(0, 2)
    await window.hudScene.refresh()
  })
  await page.clock.runFor(1)
  await expect(rows).toHaveCount(1)
  await expect(toggle).toContainText('1 / 8 slots')
  await page.setViewportSize({ width: 390, height: 844 })
  await toggle.blur()
  await diagnosticScreenshot(page, {
    path: `${output}/fleets-massive-390x844.png`,
  })
  const manifest = rows.getByRole('button', {
    name: 'Attack ship composition: 250,000 ships',
    exact: true,
  })
  await expect(manifest).toHaveAttribute('aria-expanded', 'false')
  await manifest.click()
  const ships = rows.getByRole('list', { name: 'Ship composition' })
  await expect(ships.getByRole('listitem')).toHaveCount(8)
  await expect(ships.getByRole('listitem').first()).toContainText(
    'Light Fighter 120,000',
  )
  await expect(ships.getByRole('listitem').last()).toContainText(
    'Dreadnought 1,000',
  )
  await diagnosticScreenshot(page, {
    path: `${output}/fleets-manifest-390x844.png`,
  })
  await page.setViewportSize({ width: 320, height: 740 })
  expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  )
  await diagnosticScreenshot(page, {
    path: `${output}/fleets-manifest-320x740.png`,
  })
  await manifest.click()
  await expect(ships).toBeHidden()
  await expect(
    list.getByRole('link', { name: 'Attack fleet details' }),
  ).toBeVisible()
  await expect(
    list.getByRole('link', { name: 'Attack fleet details' }),
  ).toHaveAttribute('href', `/u/andromeda/b/${id(6)}/fleets/${id(912)}`)
  await page.evaluate(async () => {
    window.hudScene.view.missions.fleets = []
    await window.hudScene.refresh()
  })
  await expect(
    panel.getByText('No active fleets. All fleet slots are available.'),
  ).toBeVisible()
  await expect(toggle).toContainText('0 / 8 slots')
  await expect(allFleets).toHaveAttribute(
    'href',
    `/u/andromeda/b/${body.id}/fleets`,
  )
})
