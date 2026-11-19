import type { components } from '../../src/contracts'
import { body, empireFixture, id } from '../../src/test-support/empire'
import { test, expect, type Page } from './fixture'
import type {} from './empire.scenarios'
import type { EmpireSceneInput } from './empire-runtime'

type Incoming = components['schemas']['IncomingMission4']
const epoch = 1_800_000_000_000
const incoming: Incoming = {
  sender: id(90),
  origin: { galaxy: 1, system: 15, position: 7 },
  target: body.id,
  mission: 'Attack',
  arrival_at: epoch + 360000,
  ships: {
    visibility: 'Exact',
    total: '30',
    ships: [{ ship_type: 'Cruiser', count: '30' }],
  },
}
async function mountFleetList(
  page: Page,
  screen: 'overview' | 'fleets',
  ownFleets: boolean,
) {
  const { missions, bodies } = empireFixture(epoch)
  const input: EmpireSceneInput = {
    screen,
    catalog: [
      {
        key: { kind: 'Ship', id: 'SmallCargo' },
        enabled: true,
        mobile: true,
        body_kinds: ['Planet', 'Moon'],
        requirements: [],
      },
    ],
    bodies,
    sampledAt: epoch,
    playerNames: { [id(90)]: 'Commander Vega' },
    missions: {
      ...missions,
      incoming: [incoming],
      fleets: ownFleets ? missions.fleets.slice(0, 1) : [],
    },
  }
  await page.addInitScript((input) => {
    window.empireInput = input
  }, input)
  await page.goto('/?scenario=empire')
  await expect(page.locator('html')).toHaveAttribute(
    'data-component-ready',
    'empire',
  )
}

for (const screen of ['overview', 'fleets'] as const) {
  test(`${screen} keeps the open incoming manifest on its own fleet when an earlier arrival is inserted and removed`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 900 })
    await mountFleetList(page, screen, false)
    const original = page.getByRole('button', {
      name: 'Incoming Attack ship composition: 30 ships',
      exact: true,
    })
    await original.click()
    await expect(original).toHaveAttribute('aria-expanded', 'true')
    const earlier: Incoming = {
      ...incoming,
      origin: { ...incoming.origin, position: 8 },
      arrival_at: epoch + 180000,
      ships: { visibility: 'Total', total: '10' },
    }
    await page.evaluate(async (earlier) => {
      window.empireScene.view.missions.incoming.unshift(earlier)
      await window.empireScene.refresh()
    }, earlier)
    const inserted = page.getByRole('button', {
      name: 'Incoming Attack ship composition: 10 ships',
      exact: true,
    })
    await expect(inserted).toHaveAttribute('aria-expanded', 'false')
    await expect(original).toHaveAttribute('aria-expanded', 'true')
    await page.evaluate(async () => {
      window.empireScene.view.missions.incoming.shift()
      await window.empireScene.refresh()
    })
    await expect(inserted).toHaveCount(0)
    await expect(original).toHaveAttribute('aria-expanded', 'true')
  })
}

test('fleet traffic retains its selected filter and keyboard focus as the last detected and owned fleets disappear', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await mountFleetList(page, 'fleets', true)
  const traffic = page.getByRole('region', { name: 'Empire fleet traffic' })
  const filters = traffic.getByRole('group', { name: 'Fleet traffic filter' })
  for (const name of [
    'Incoming fleets',
    'No active fleets.',
    'Stationed ships',
  ]) {
    await expect(page.getByRole('heading', { name, exact: true })).toHaveCount(
      0,
    )
  }
  await expect(
    page.getByText('Queued ships are not built yet', { exact: false }),
  ).toHaveCount(0)
  const cargo = page.getByRole('link', {
    name: 'Build more Small Cargo in Shipyard',
    exact: true,
  })
  await expect(cargo.locator('img')).toHaveAttribute(
    'src',
    '/art/atlas/objects/small-cargo-96.webp',
  )
  await expect(cargo.locator('img')).toHaveAttribute('alt', '')
  await expect(cargo).toHaveCSS('text-decoration-line', 'none')
  await expect(
    page
      .locator('main header')
      .getByRole('link', {
        name: 'Shipyard',
        exact: true,
        includeHidden: true,
      }),
  ).toHaveAttribute('href', `/u/andromeda/b/${body.id}/shipyard`)
  await expect(traffic.getByRole('article')).toHaveCount(2)
  await expect(traffic).toContainText('From Commander Vega')
  await expect(traffic.getByText('1 incoming', { exact: true })).toBeVisible()
  await filters.getByRole('button', { name: 'Yours', exact: true }).click()
  await expect(traffic.getByRole('article')).toHaveCount(1)
  await expect(
    traffic.getByRole('article', { name: 'Incoming attack fleet' }),
  ).toHaveCount(0)
  const others = filters.getByRole('button', { name: 'Others', exact: true })
  await others.focus()
  await others.press('Enter')
  await expect(
    traffic.getByRole('article', { name: 'Incoming attack fleet' }),
  ).toBeVisible()
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(others).toBeFocused()
    expect(
      await traffic.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true)
  }
  await page.evaluate(async () => {
    window.empireScene.view.missions.incoming = []
    await window.empireScene.refresh()
  })
  await expect(
    traffic.getByRole('heading', { name: 'No other fleets detected.' }),
  ).toBeVisible()
  await expect(others).toBeFocused()
  await expect(others).toHaveAttribute('aria-pressed', 'true')
  const all = filters.getByRole('button', { name: 'All', exact: true })
  await all.click()
  await expect(traffic.getByRole('article')).toHaveCount(1)
  await page.evaluate(async () => {
    window.empireScene.view.missions.fleets = []
    await window.empireScene.refresh()
  })
  await expect(
    traffic.getByRole('heading', { name: 'No active fleets.' }),
  ).toBeVisible()
  await expect(traffic.getByRole('article')).toHaveCount(0)
  await expect(
    page.getByText('No visible incoming fleets.', { exact: true }),
  ).toHaveCount(0)
  await expect(all).toBeFocused()
})

test('empire body network focuses its selected dossier while preserving per-body work, wealth and directional traffic', async ({
  page,
  mount,
}) => {
  await mount('empire')
  await expect(page.getByRole('article')).toHaveCount(4)
  const planet = page.getByRole('article', {
    name: 'Planet [1:371:4] dossier',
    exact: true,
  })
  const colony = page.getByRole('article', {
    name: 'Planet [1:380:8] dossier',
    exact: true,
  })
  const moon = page.getByRole('article', {
    name: 'Moon [1:371:4] dossier',
    exact: true,
  })
  await expect(planet).toContainText('Metal Mine · Level 8')
  await expect(colony).toContainText('Robotics Factory · Level 7')
  await expect(colony).toContainText('15191 km · 24 to 64 °C')
  await expect(
    planet.getByRole('button', { name: '-60 to -20 °C', exact: true }),
  ).toBeVisible()
  await expect(
    colony.getByRole('button', { name: '24 to 64 °C', exact: true }),
  ).toBeVisible()
  await expect(moon.getByText(/Maximum temperature/)).toHaveCount(0)
  await expect(moon).not.toContainText('Metal Mine · Level 8')
  await expect(planet.getByLabel('Planet resources')).toContainText('25,216')
  await expect(planet).toContainText('1 in')
  await expect(planet).toContainText('2 out')
  await expect(colony).toContainText('2 in')
  await expect(moon).toContainText('0 in')
  const traffic = page.getByRole('region', {
    name: 'Fleet movements',
    exact: true,
  })
  await expect(traffic.getByRole('listitem')).toHaveCount(4)
  await expect(traffic).toContainText('1 incoming hostile fleet detected')
  await expect(traffic).toContainText('Ship composition unknown')
  await expect(
    page
      .getByRole('region', { name: 'Empire research' })
      .getByRole('link', { name: /Energy Technology/ }),
  ).toHaveAccessibleDescription('Host Planet [1:371:4]')
  await expect(colony).not.toContainText('Energy Technology')
  await page.getByText('Empire orbital network', { exact: true }).click()
  await page
    .getByRole('link', { name: 'Focus Planet [1:380:8]', exact: true })
    .click()
  await expect(page.getByLabel('Scene destination')).toHaveText(
    `/u/andromeda/b/${id(6)}/overview`,
  )
  await expect(colony).toContainText('Command focus')
  await expect(page.getByRole('article')).toHaveCount(4)
  await expect(page.getByRole('link', { name: 'Dispatch fleet' })).toHaveCount(
    0,
  )
  expect(
    await page.evaluate(() =>
      window.empireScene.sent.map((envelope) => envelope.command),
    ),
  ).toEqual([
    {
      type: 'World',
      action: {
        type: 'RecordForegroundPresence',
        cause: 'BodyVisit',
        body: id(6),
        paired_command_id: null,
      },
    },
  ])
})
test('a quiet protocol-three overview remains usable after planet art fails', async ({
  page,
  mount,
}) => {
  await page.route('**/art/**', (route) => route.abort())
  await page.addInitScript(() => {
    window.empireInput = { protocol: 3 }
  })
  await mount('empire')
  await expect(page.getByRole('article')).toHaveCount(1)
  await expect(page.getByText('The lanes are quiet.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Dispatch fleet' })).toHaveCount(
    0,
  )
  await expect(
    page.getByRole('link', { name: 'Manage Planet [1:371:12]' }),
  ).toBeVisible()
  await expect(page.getByText('No research in progress.')).toBeVisible()
})
