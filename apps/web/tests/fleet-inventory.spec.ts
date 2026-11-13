import { test, expect } from './fixtures/test'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import {
  installGameFixture,
  refreshGame,
  body,
  binding,
  id,
  resources,
} from './fixtures/game'
import { selectBody } from './fixtures/body-selector'
import type { components } from '../src/contracts'
import {
  withBootstrapResponse,
  withFixtureResponse,
} from './fixtures/responses'

type S = components['schemas']
function inventoryFixture() {
  const now = Date.now()
  const catalog: S['CatalogEntry3'][] = [
    {
      key: { kind: 'Ship', id: 'SmallCargo' },
      ship_statistics: {
        propulsion: null,
        combat: null,
        cost: ['2000', '2000', '0'],
      },
      enabled: true,
      mobile: true,
      body_kinds: ['Planet', 'Moon'],
      requirements: [],
    },
    {
      key: { kind: 'Ship', id: 'LightFighter' },
      ship_statistics: {
        propulsion: null,
        combat: null,
        cost: ['3000', '1000', '0'],
      },
      enabled: true,
      mobile: true,
      body_kinds: ['Planet', 'Moon'],
      requirements: [],
    },
    {
      key: { kind: 'Ship', id: 'SolarSatellite' },
      ship_statistics: {
        propulsion: null,
        combat: null,
        cost: ['0', '2000', '500'],
      },
      enabled: true,
      mobile: false,
      body_kinds: ['Planet'],
      requirements: [],
    },
    {
      key: { kind: 'Defense', id: 'RocketLauncher' },
      enabled: true,
      mobile: false,
      body_kinds: ['Planet'],
      requirements: [],
    },
  ]
  const fleet: S['OwnMission4'] = {
    id: id(30),
    intent: {
      origin: body.id,
      destination: {
        type: 'Body',
        id: id(6),
        expected_kind: 'Moon',
        expected_owner: binding.player,
      },
      mission: 'Transport',
      ships: [{ owner: binding.player, ship_type: 'SmallCargo', count: '5' }],
      cargo: { metal: '0', crystal: '0', deuterium: '0' },
      speed_percent: 100,
    },
    origin: body.coordinates,
    destination: body.coordinates,
    leg: 'Returning',
    ships: [{ ship_type: 'SmallCargo', count: '5' }],
    cargo: resources,
    due_at: now + 600000,
    launched_at: now - 10000,
    duration_ms: 610000,
    paid_fuel: '0',
    can_recall: false,
  }
  const batch: S['ManufacturingBatchDto'] = {
    id: id(70),
    body: body.id,
    item: { kind: 'Ship', id: 'SmallCargo' },
    quantity: '11',
    remaining: '3',
    completed_prefix: '8',
    paid: resources,
    accepted_at: now - 100000,
    first_start_at: now - 100000,
    next_due_at: now + 100000,
    final_due_at: now + 300000,
    unit_duration_ms: 100000,
    state: 'Producing',
    can_cancel: false,
  }
  return {
    protocol: 4 as const,
    catalog,
    bodies: [
      {
        ...body,
        inventories: [
          {
            item: { kind: 'Ship' as const, id: 'SmallCargo' as const },
            count: '9223372036854775807',
          },
        ],
      },
      { ...body, id: id(6), kind: 'Moon' as const, inventories: [] },
    ],
    missions: {
      fleets: [
        fleet,
        {
          ...fleet,
          id: id(31),
          intent: { ...fleet.intent, origin: id(6) },
          ships: [{ ship_type: 'SmallCargo' as const, count: '9' }],
        },
      ],
      incoming: [] as S['IncomingMission4'][],
      score_value_micro: '0',
      fleet_slots: '8',
    },
    manufacturing: [
      batch,
      { ...batch, id: id(71), remaining: '2', completed_prefix: '9' },
      {
        ...batch,
        id: id(72),
        body: id(6),
        remaining: '7',
        completed_prefix: '4',
      },
    ],
  }
}

for (const width of [390, 1280]) {
  test(`stationed inventory separates exact counts and Shipyard links at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    let revision = 1
    const options = {
      ...inventoryFixture(),
      viewerRevision: () => String(revision),
    }
    await installGameFixture(page, options)
    await withBootstrapResponse(page, () =>
      page.goto(`/u/andromeda/b/${body.id}/fleets`),
    )
    await expect(page.locator('main h1')).toHaveText('Fleets')
    await expect(
      page.getByRole('heading', { name: 'Fleets', level: 2, exact: true }),
    ).toBeVisible()
    const dispatch = page.getByRole('link', {
      name: 'Dispatch Fleet',
      exact: true,
    })
    const slots = page.getByRole('button', {
      name: 'Fleet slots: 2 used / 8 total',
      exact: true,
    })
    const dispatchBox = (await dispatch.boundingBox())!
    const slotsBox = (await slots.boundingBox())!
    const shipyardBox = (await page
      .locator('main header')
      .getByRole('link', { name: 'Shipyard', exact: true })
      .boundingBox())!
    expect(shipyardBox.x + shipyardBox.width).toBeLessThan(slotsBox.x)
    expect(Math.abs(shipyardBox.y - slotsBox.y)).toBeLessThan(8)
    expect(slotsBox.x + slotsBox.width).toBeLessThan(dispatchBox.x)
    expect(Math.abs(slotsBox.y - dispatchBox.y)).toBeLessThan(8)

    const panel = page.getByRole('region', {
      name: 'Stationed ships',
      exact: true,
    })
    const cargo = panel.getByRole('row').filter({
      has: page.getByRole('rowheader', {
        name: 'Build more Small Cargo in Shipyard',
        exact: true,
      }),
    })
    await expect(cargo.getByRole('cell')).toHaveText([
      '9,223,372,036,854,775,807',
      '5',
      '5',
    ])
    await expect(panel.getByRole('columnheader')).toHaveText([
      'Ship',
      'Stationed',
      'Away',
      'Queued',
    ])
    await expect(panel.getByRole('row')).toHaveCount(3)
    await expect(
      panel.getByRole('rowheader', { name: 'Civil', exact: true }),
    ).toBeVisible()
    expect(
      (await panel.getByRole('row').first().boundingBox())!.height,
    ).toBeLessThan(44)
    await expect(
      panel.getByRole('rowheader', { name: /Light Fighter|Solar Satellite/ }),
    ).toHaveCount(0)
    await expect(
      page.getByRole('button', {
        name: 'Fleet slots: 2 used / 8 total',
        exact: true,
      }),
    ).toBeVisible()
    expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
      true,
    )
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await diagnosticScreenshot(page, {
      fullPage: true,
      path: `test-results/fleet-inventory-${width}.png`,
    })
    await cargo
      .getByRole('link', { name: 'Build more Small Cargo in Shipyard' })
      .click()
    await expect(page).toHaveURL(
      `/u/andromeda/b/${body.id}/shipyard/small-cargo`,
    )
    await withBootstrapResponse(page, () =>
      page.goto(`/u/andromeda/b/${body.id}/fleets`),
    )
    await expect(cargo.getByRole('cell').first()).toHaveText(
      '9,223,372,036,854,775,807',
    )
    options.bodies[0].inventories[0].count = '42'
    revision += 1
    await refreshGame(page)
    await expect(cargo.getByRole('cell').first()).toHaveText('42')
    const traffic = page.getByRole('heading', {
      name: 'Empire fleet traffic',
    })
    expect((await panel.boundingBox())!.y).toBeLessThan(
      (await traffic.boundingBox())!.y,
    )
    await diagnosticScreenshot(page, {
      fullPage: true,
      path: `test-results/fleets-world-${width}x900.png`,
    })
    await panel
      .getByRole('button', { name: 'Entire empire', exact: true })
      .click()
    const empire = page.getByRole('region', {
      name: 'Empire ships',
      exact: true,
    })
    await expect(empire.getByRole('columnheader')).toHaveText([
      'Ship',
      'Total',
      'Stationed',
      'Flying',
      'Queued',
    ])
    await expect(empire.getByRole('cell')).toHaveText(['56', '42', '14', '12'])
    await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/fleets`)
    await diagnosticScreenshot(page, {
      fullPage: true,
      path: `test-results/fleets-empire-${width}x900.png`,
    })
    await selectBody(page, id(6))
    await expect(page).toHaveURL(`/u/andromeda/b/${id(6)}/fleets`)
    await expect(empire.getByRole('cell')).toHaveText(['56', '42', '14', '12'])
    await empire
      .getByRole('button', { name: 'This world', exact: true })
      .click()
    await expect(cargo.getByRole('cell')).toHaveText(['0', '9', '7'])
    await diagnosticScreenshot(page, {
      fullPage: true,
      path: `test-results/fleets-moon-${width}x900.png`,
    })
    await selectBody(page, body.id)
    await diagnosticScreenshot(panel, {
      path: `test-results/fleet-inventory-compact-${width}.png`,
    })
    await selectBody(page, id(6))
    await expect(panel).toContainText('No ships stationed here.')
    await expect(cargo.getByRole('cell')).toHaveText(['0', '9', '7'])
    await expect(
      page.getByRole('button', {
        name: 'Fleet slots: 2 used / 8 total',
        exact: true,
      }),
    ).toBeVisible()
    await page
      .locator('main header')
      .getByRole('link', { name: 'Shipyard', exact: true })
      .click()
    await expect(page).toHaveURL(`/u/andromeda/b/${id(6)}/shipyard`)
    await withBootstrapResponse(page, () =>
      page.goto(`/u/andromeda/b/${body.id}/fleets/${id(30)}`),
    )
    await expect(panel).toHaveCount(0)
    await expect(
      page.getByRole('heading', { name: 'Mission details', exact: true }),
    ).toBeVisible()
  })
}

// Covers filter wiring/focus through a delivered snapshot, and wrapping at phone width.
for (const width of [390, 1280]) {
  test(`unified fleet traffic filters owned and detected movements at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    let revision = 1
    const options = {
      ...inventoryFixture(),
      viewerRevision: () => String(revision),
    }
    options.bodies[0].inventories[0].count = '42'
    options.missions.incoming = [
      {
        sender: id(99),
        target: body.id,
        origin: { galaxy: 1, system: 400, position: 9 },
        mission: 'Attack',
        arrival_at: Date.now() + 60000,
        ships: { visibility: 'Unknown' },
      },
    ]
    await installGameFixture(page, options)
    await withBootstrapResponse(page, () =>
      page.goto(`/u/andromeda/b/${body.id}/fleets`),
    )
    const traffic = page.getByRole('region', {
      name: 'Empire fleet traffic',
      exact: true,
    })
    const filters = traffic.getByRole('group', { name: 'Fleet traffic filter' })
    await expect(traffic.getByRole('article')).toHaveCount(3)
    await expect(traffic.getByRole('article').first()).toHaveAttribute(
      'aria-label',
      'Incoming attack fleet',
    )
    await expect(traffic.getByText('1 incoming', { exact: true })).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Incoming fleets', exact: true }),
    ).toHaveCount(0)
    await expect(
      page.getByRole('heading', { name: 'No active fleets.', exact: true }),
    ).toHaveCount(0)
    await expect(
      page.getByRole('heading', { name: 'Stationed ships', exact: true }),
    ).toHaveCount(0)
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
    const shipyard = page
      .locator('main header')
      .getByRole('link', { name: 'Shipyard', exact: true })
    await expect(shipyard).toHaveAttribute(
      'href',
      `/u/andromeda/b/${body.id}/shipyard`,
    )
    await diagnosticScreenshot(page, {
      path: `test-results/fleets-traffic-all-${width}x900.png`,
      fullPage: true,
    })
    await filters.getByRole('button', { name: 'Yours', exact: true }).click()
    await expect(traffic.getByRole('article')).toHaveCount(2)
    await expect(
      traffic.getByRole('article', {
        name: 'Incoming attack fleet',
        exact: true,
      }),
    ).toHaveCount(0)
    await diagnosticScreenshot(page, {
      path: `test-results/fleets-traffic-yours-${width}x900.png`,
      fullPage: true,
    })
    const others = filters.getByRole('button', { name: 'Others', exact: true })
    await others.focus()
    await others.press('Enter')
    await expect(others).toBeFocused()
    await expect(traffic.getByRole('article')).toHaveCount(1)
    await expect(
      traffic.getByRole('article', {
        name: 'Incoming attack fleet',
        exact: true,
      }),
    ).toBeVisible()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await diagnosticScreenshot(page, {
      path: `test-results/fleets-traffic-others-${width}x900.png`,
      fullPage: true,
    })
    options.missions.incoming = []
    revision++
    await withFixtureResponse(
      page,
      (response) => new URL(response.url()).pathname.endsWith('/overview'),
      () => refreshGame(page),
    )
    await expect(
      traffic.getByRole('heading', {
        name: 'No other fleets detected.',
        exact: true,
      }),
    ).toBeVisible()
    await expect(others).toBeFocused()
    await expect(others).toHaveAttribute('aria-pressed', 'true')
    await filters.getByRole('button', { name: 'All', exact: true }).click()
    await expect(traffic.getByRole('article')).toHaveCount(2)
    await expect(
      filters.getByRole('button', { name: 'All', exact: true }),
    ).toBeFocused()
    options.missions.fleets = []
    revision++
    await withFixtureResponse(
      page,
      (response) => new URL(response.url()).pathname.endsWith('/overview'),
      () => refreshGame(page),
    )
    await expect(
      traffic.getByRole('heading', { name: 'No active fleets.', exact: true }),
    ).toHaveCount(1)
    await expect(traffic.getByRole('article')).toHaveCount(0)
    await expect(
      page.getByText('No visible incoming fleets.', { exact: true }),
    ).toHaveCount(0)
    await diagnosticScreenshot(page, {
      path: `test-results/fleets-traffic-empty-${width}x900.png`,
      fullPage: true,
    })
  })
}
