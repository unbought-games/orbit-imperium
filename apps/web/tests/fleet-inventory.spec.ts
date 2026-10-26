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

type S = components['schemas']
function inventoryFixture() {
  const now = Date.now()
  const catalog: S['CatalogEntry3'][] = [
    {
      key: { kind: 'Ship', id: 'SmallCargo' },
      enabled: true,
      mobile: true,
      body_kinds: ['Planet', 'Moon'],
      requirements: [],
    },
    {
      key: { kind: 'Ship', id: 'LightFighter' },
      enabled: true,
      mobile: true,
      body_kinds: ['Planet', 'Moon'],
      requirements: [],
    },
    {
      key: { kind: 'Ship', id: 'SolarSatellite' },
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
      incoming: [],
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

for (const width of [320, 390, 1280]) {
  test(`stationed inventory separates exact counts and Shipyard links at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    let revision = 1
    const options = {
      ...inventoryFixture(),
      viewerRevision: () => String(revision),
    }
    await installGameFixture(page, options)
    await page.goto(`/u/andromeda/b/${body.id}/fleets`)
    await expect(page.locator('main h1')).toHaveText('Fleets')
    const panel = page.getByRole('region', {
      name: 'Stationed ships',
      exact: true,
    })
    const cargo = panel.getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'Build more Small Cargo in Shipyard', exact: true }) })
    await expect(cargo.getByRole('cell')).toHaveText([
      '9,223,372,036,854,775,807',
      '5',
      '5',
    ])
    await expect(panel.getByRole('columnheader')).toHaveText(['Ship', 'Stationed', 'Flying', 'Queued'])
    await expect(panel.getByRole('row')).toHaveCount(2)
    expect((await panel.getByRole('row').first().boundingBox())!.height).toBeLessThan(44)
    await expect(panel.getByRole('rowheader', { name: /Light Fighter|Solar Satellite/ })).toHaveCount(0)
    await expect(page.getByText('Fleet slots: 2 used / 8 total', { exact: true })).toBeVisible()
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
    await page.goto(`/u/andromeda/b/${body.id}/fleets`)
    await expect(cargo.getByRole('cell').first()).toHaveText(
      '9,223,372,036,854,775,807',
    )
    options.bodies[0].inventories[0].count = '42'
    revision += 1
    await refreshGame(page)
    await expect(cargo.getByRole('cell').first()).toHaveText('42')
    await panel.scrollIntoViewIfNeeded()
    await diagnosticScreenshot(panel, { path: `test-results/fleet-inventory-compact-${width}.png` })
    await selectBody(page, id(6))
    await expect(panel).toContainText('No ships stationed here.')
    await expect(cargo.getByRole('cell')).toHaveText(['0', '9', '7'])
    await expect(page.getByText('Fleet slots: 2 used / 8 total', { exact: true })).toBeVisible()
    await panel
      .getByRole('link', { name: 'Open Shipyard', exact: true })
      .click()
    await expect(page).toHaveURL(`/u/andromeda/b/${id(6)}/shipyard`)
    await page.goto(`/u/andromeda/b/${body.id}/fleets/${id(30)}`)
    await expect(panel).toHaveCount(0)
    await expect(
      page.getByRole('heading', { name: 'Mission details', exact: true }),
    ).toBeVisible()
  })
}

test('empty stationed inventory retains a useful Shipyard destination', async ({
  page,
}) => {
  await installGameFixture(page, {
    protocol: 4,
    bodies: [{ ...body, inventories: [] }],
  })
  await page.goto(`/u/andromeda/b/${body.id}/fleets`)
  const panel = page.getByRole('region', {
    name: 'Stationed ships',
    exact: true,
  })
  await expect(panel).toContainText('No ships stationed here.')
  await expect(panel).toContainText('Ship details are unavailable.')
  await expect(
    panel.getByRole('link', { name: 'Open Shipyard' }),
  ).toHaveAttribute('href', `/u/andromeda/b/${body.id}/shipyard`)
})

for (const source of ['stationed', 'flying', 'queued', 'empty'] as const) {
  test(`inventory retains ${source} ships without showing zero-only rows`, async ({ page }) => {
    const options = inventoryFixture()
    options.bodies[0].inventories = source === 'stationed'
      ? [{ item: { kind: 'Ship', id: 'SmallCargo' }, count: '1' }]
      : []
    options.missions.fleets = source === 'flying' ? options.missions.fleets.slice(0, 1) : []
    options.manufacturing = source === 'queued' ? options.manufacturing.slice(0, 1) : []
    await installGameFixture(page, options)
    await page.goto(`/u/andromeda/b/${body.id}/fleets`)
    const panel = page.getByRole('region', { name: 'Stationed ships', exact: true })
    await expect(panel.getByRole('table')).toHaveCount(source === 'empty' ? 0 : 1)
    if (source !== 'empty') {
      await expect(panel.getByRole('cell')).toHaveText([
        source === 'stationed' ? '1' : '0',
        source === 'flying' ? '5' : '0',
        source === 'queued' ? '3' : '0',
      ])
    }
    await expect(panel.getByRole('link', { name: 'Open Shipyard' })).toBeVisible()
  })
}
