import { test, expect, type Locator, type Page } from '@playwright/test'
import type { components } from '../src/contracts'
import { shellFixture, binding, body, id, resources } from './fixtures/game'

type S = components['schemas']
const now = Date.now()
const destination = { galaxy: 1, system: 372, position: 10 }
const fleet: S['OwnMission4'] = {
  id: id(30),
  intent: {
    origin: body.id,
    destination: {
      type: 'Body',
      id: id(6),
      expected_kind: 'Planet',
      expected_owner: binding.player,
    },
    mission: 'Transport',
    ships: [{ owner: binding.player, ship_type: 'SmallCargo', count: '12' }],
    cargo: { metal: '100000000', crystal: '0', deuterium: '0' },
    speed_percent: 100,
  },
  origin: body.coordinates,
  destination,
  leg: 'Outbound',
  ships: [{ ship_type: 'SmallCargo', count: '12' }],
  cargo: resources,
  due_at: now + 180000,
  launched_at: now - 180000,
  duration_ms: 360000,
  paid_fuel: '1000000',
  can_recall: true,
}

async function firstViewport(page: Page, controls: Locator[]) {
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  for (const control of controls) {
    await expect(control).toBeInViewport({ ratio: 1 })
    const box = (await control.boundingBox())!
    // Reserve space for the pinned mobile navigation as well as the browser edge.
    expect(box.y + box.height).toBeLessThan(page.viewportSize()!.height - 80)
  }
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width)
}

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
  { width: 320, height: 740 },
]) {
  test(`fleet tasks lead the first viewport at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await page.clock.setFixedTime(now)
    await shellFixture(page, {
      protocol: 4,
      missions: {
        fleets: [fleet],
        incoming: [],
        score_value_micro: '0',
        fleet_slots: '2',
      },
    })
    await page.goto(`/u/andromeda/fleets?body=${body.id}`)
    const recall = page.getByRole('button', {
      name: 'Review recall',
      exact: true,
    })
    await firstViewport(page, [
      recall,
      page.getByRole('link', { name: 'Dispatch a fleet' }),
      page.getByText('Arrival in', { exact: true }),
    ])
    await page.screenshot({
      path: `test-results/density-fleets-${viewport.width}.png`,
    })
    await page
      .getByRole('link', { name: 'Mission details', exact: true })
      .click()
    await firstViewport(page, [
      recall,
      page.getByRole('link', { name: 'All fleets' }),
    ])
    await expect(
      page.getByRole('navigation', { name: 'Fleet navigation' }),
    ).toHaveCount(0)
    await expect(
      page.getByRole('group', { name: 'Planet and resources' }),
    ).toBeVisible()
    const path = page
      .locator('details')
      .filter({ has: page.locator('summary', { hasText: 'Flight path' }) })
    await expect(path).not.toHaveAttribute('open')
    await page.screenshot({
      path: `test-results/density-mission-${viewport.width}.png`,
    })
    await recall.click()
    await expect(
      page.getByRole('region', { name: 'Review recall' }),
    ).toContainText('Fuel is not refunded')
    await page.getByRole('button', { name: 'Keep mission' }).click()
    await path.locator('summary').click()
    await expect(path.locator('figure')).toBeVisible()
    await page.getByRole('link', { name: 'All fleets' }).click()
    await expect(
      page.getByRole('navigation', { name: 'Fleet navigation' }),
    ).toBeVisible()
  })

  test(`combat outcome and follow-up lead the first viewport at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await page.clock.setFixedTime(now)
    await shellFixture(page, {
      protocol: 4,
      extraCapabilities: ['Reports', 'Harvest'],
    })
    const header: S['ReportHeader4'] = {
      id: id(62),
      kind: 'Combat',
      observed_at: now - 3600000,
      read: false,
      hidden: false,
    }
    const payload: S['CombatPayload4'] = {
      kind: 'Combat',
      at: header.observed_at,
      target: destination,
      outcome: 'AttackerVictory',
      mission: 'Attack',
      return_at: now + 180000,
      participants: [],
      rounds: [],
      survivors: [],
      gross_losses: [],
      recovered: [],
      debris: resources,
      loot: resources,
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
    await page.goto(`/u/andromeda/reports/${header.id}?body=${body.id}`)
    await firstViewport(page, [
      page.getByRole('heading', { name: 'Attacker Victory' }),
      page.getByRole('button', { name: 'Prepare harvest' }),
      page.getByRole('link', { name: 'Back to reports' }),
    ])
    await expect(
      page.getByRole('heading', { name: 'Dispatches from the frontier.' }),
    ).toHaveCount(0)
    await page.screenshot({
      path: `test-results/density-combat-${viewport.width}.png`,
    })
    await page.getByRole('button', { name: 'Prepare harvest' }).click()
    await expect(
      page.getByRole('combobox', { name: 'Mission', exact: true }),
    ).toHaveValue('Harvest')
    await expect(page.getByLabel('System', { exact: true })).toHaveValue('372')
    await expect(page.getByLabel('Position', { exact: true })).toHaveValue('10')
    await page.goto(`/u/andromeda/reports/${header.id}?body=${body.id}`)
    await page.getByRole('link', { name: 'Back to reports' }).click()
    await firstViewport(page, [
      page.getByRole('link', { name: 'Combat', exact: true }),
      page.getByRole('checkbox', { name: 'Show hidden reports' }),
    ])
  })

  test(`building choices precede optional artwork at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await shellFixture(page, {
      bodies: [body],
      catalog: [
        {
          key: { kind: 'Building', id: 'MetalMine' },
          requirements: [],
          enabled: true,
          mobile: false,
          body_kinds: ['Planet'],
        },
      ],
    })
    await page.goto(`/u/andromeda/b/${body.id}/resources`)
    const tile = page.getByRole('button', {
      name: 'Upgrade Metal Mine',
      exact: true,
    })
    await firstViewport(page, [tile])
    await expect(
      page.getByRole('button', { name: 'Resource settings', exact: true }),
    ).toHaveCount(0)
    await expect(page.getByLabel('Planet energy')).toBeHidden()
    await page.screenshot({
      path: `test-results/density-resources-${viewport.width}.png`,
    })
    await page.getByText('Industrial resource colony', { exact: true }).click()
    await expect(page.getByLabel('Planet energy')).toBeVisible()
  })
}

for (const width of [1280, 390]) {
  test(`legacy fleet details retain navigation from Empire at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 })
    const legacyFleet: S['Fleet'] = {
      id: id(61),
      origin: body.id,
      target: id(60),
      status: 'Outbound',
      due_at: Date.now() + 120000,
      payload: resources,
      paid_fuel: '3000000',
      ships: [{ ship_type: 'SmallCargo', count: '2' }],
    }
    await shellFixture(page, {
      protocol: 2,
      extraCapabilities: ['Transport'],
      fleets: [legacyFleet, { ...legacyFleet, id: id(62) }],
      destinations: [
        { id: body.id, coordinates: body.coordinates, kind: 'Planet' },
        { id: id(60), coordinates: destination, kind: 'Planet' },
      ],
    })
    const movements = page.getByRole('region', {
      name: 'Fleet movements',
      exact: true,
    })
    if (width < 768)
      await movements
        .getByRole('button', { name: 'Show 2 fleet movements' })
        .click()
    await movements
      .getByRole('link', { name: 'View Transport outbound fleet' })
      .first()
      .click()
    const detailUrl = `/u/andromeda/fleets/${legacyFleet.id}?body=${body.id}`
    await expect(page).toHaveURL(detailUrl)
    await expect(
      page.getByRole('button', { name: 'Review recall', exact: true }),
    ).toHaveCount(1)
    const navigation = page.getByRole('navigation', {
      name: 'Fleet navigation',
    })
    await expect(navigation).toBeInViewport({ ratio: 1 })
    const allFleets = navigation.getByRole('link', {
      name: 'Fleets',
      exact: true,
    })
    await expect(allFleets).toHaveAttribute(
      'href',
      `/u/andromeda/fleets?body=${body.id}`,
    )
    await expect(
      navigation.getByRole('button', { name: 'Galaxy', exact: true }),
    ).toBeDisabled()
    await allFleets.click()
    await expect(page).toHaveURL(`/u/andromeda/fleets?body=${body.id}`)
    await expect(
      page.getByRole('button', { name: 'Review recall', exact: true }),
    ).toHaveCount(2)
    // A direct load also preserves navigation and the selected funding planet.
    await page.goto(detailUrl)
    await navigation
      .getByRole('link', { name: 'Dispatch', exact: true })
      .click()
    await expect(page).toHaveURL(`/u/andromeda/dispatch?body=${body.id}`)
    await expect(
      page.getByRole('heading', { name: 'Dispatch fleet', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('combobox', { name: 'Selected body' }),
    ).toHaveValue(body.id)
  })

  test(`legacy fleet and dispatch headers stay compact at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 })
    await shellFixture(page, {
      protocol: 2,
      extraCapabilities: ['Transport'],
      bodies: [body],
      destinations: [{ id: id(6), coordinates: destination, kind: 'Planet' }],
    })
    for (const [route, title] of [
      ['fleets', 'Fleets'],
      ['dispatch', 'Dispatch fleet'],
    ]) {
      await page.goto(`/u/andromeda/${route}?body=${body.id}`)
      const heading = page.getByRole('heading', {
        name: title,
        level: 2,
        exact: true,
      })
      await expect(heading).toBeInViewport({ ratio: 1 })
      // Keep the task's styled title, without a second large shell heading.
      await expect(heading).toHaveCSS('margin', '0px')
      await expect(heading).toHaveCSS('font-size', '24px')
      expect(
        (await heading.locator('..').boundingBox())!.height,
      ).toBeLessThanOrEqual(64)
      expect(
        (await page.locator('main h1').locator('..').boundingBox())!.height,
      ).toBeLessThanOrEqual(1)
      await expect(
        page.getByRole('combobox', { name: 'Destination', exact: true }),
      ).toHaveValue(id(6))
      await expect(
        page.getByRole('button', { name: 'Calculate transport', exact: true }),
      ).toBeEnabled()
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width)
      await page.screenshot({
        path: `test-results/legacy-${route}-header-${width}.png`,
      })
    }
  })
}
