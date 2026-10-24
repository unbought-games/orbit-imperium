import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { test, expect, type Locator, type Page } from './fixtures/test'
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
    // Reserve space for the pinned mobile navigation as well as the browser edge.
    // A route reconciliation can replace the control after the visibility check.
    await expect
      .poll(async () => {
        const box = await control.boundingBox()
        return box ? box.y + box.height : Number.POSITIVE_INFINITY
      })
      .toBeLessThan(page.viewportSize()!.height - 80)
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
    await page.goto(`/u/andromeda/b/${body.id}/fleets`)
    const recall = page.getByRole('button', {
      name: 'Review recall',
      exact: true,
    })
    await firstViewport(page, [
      recall,
      page.getByRole('link', { name: 'Dispatch a fleet' }),
      page.getByText('Arrival in', { exact: true }),
    ])
    await diagnosticScreenshot(page, {
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
    await diagnosticScreenshot(page, {
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
    const back = page.getByRole('link', { name: 'Back to reports' })
    await expect(back).toHaveText('')
    await expect(back.locator('svg.lucide-arrow-left')).toBeVisible()
    const remove = page.getByRole('button', { name: 'Delete report' })
    await expect(remove).toHaveText('')
    await expect(remove.locator('svg.lucide-trash-2')).toBeVisible()
    const timestamp = page.getByRole('button', { name: 'Report time details' })
    await expect(timestamp).toHaveText('1 hour ago')
    await timestamp.click()
    const fullTime = page.getByRole('dialog', { name: 'Report time', exact: true })
    await expect(fullTime.locator('time')).toHaveAttribute('datetime', new Date(header.observed_at).toISOString())
    await page.keyboard.press('Escape')
    await expect(fullTime).toHaveCount(0)
    await timestamp.hover()
    await expect(fullTime).toBeVisible()
    await page.keyboard.press('Escape')
    const harvest = (await page.getByRole('button', { name: 'Prepare harvest' }).boundingBox())!
    const outcome = (await page.getByRole('region', { name: 'Report observation' }).locator('header').boundingBox())!
    expect(harvest.y).toBeGreaterThanOrEqual(outcome.y + outcome.height)
    expect(harvest.y - outcome.y - outcome.height).toBeLessThan(30)
    await diagnosticScreenshot(page, {
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
      page.getByRole('button', { name: 'Delete report' }),
    ])
  })

  test(`building choices remain visible without colony artwork at ${viewport.width}px`, async ({
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
    const tile = page.getByRole('link', {
      name: 'Upgrade Metal Mine',
      exact: true,
    })
    await firstViewport(page, [tile])
    await expect(
      page.getByRole('button', { name: 'Resource settings', exact: true }),
    ).toHaveCount(0)
    await expect(page.getByLabel('Planet energy')).toHaveCount(0)
    await expect(page.locator('main details')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Resources', level: 2 })).toHaveCount(0)
    await diagnosticScreenshot(page, {
      path: `test-results/density-resources-${viewport.width}.png`,
    })
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
    await movements
      .getByRole('link', { name: 'View Transport outbound fleet' })
      .first()
      .click()
    const detailUrl = `/u/andromeda/b/${body.id}/fleets/${legacyFleet.id}`
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
      `/u/andromeda/b/${body.id}/fleets`,
    )
    await expect(
      navigation.getByRole('button', { name: 'Galaxy', exact: true }),
    ).toBeDisabled()
    await allFleets.click()
    await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/fleets`)
    await expect(
      page.getByRole('button', { name: 'Review recall', exact: true }),
    ).toHaveCount(2)
    // A direct load also preserves navigation and the selected funding planet.
    await page.goto(detailUrl)
    await navigation
      .getByRole('link', { name: 'Dispatch', exact: true })
      .click()
    await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/dispatch`)
    await expect(
      page.getByRole('heading', { name: 'Send a transport', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('combobox', { name: 'Selected body' }),
    ).toHaveValue(body.id)
  })

  test(`legacy fleet and dispatch tabs replace page titles at ${width}px`, async ({
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
      // The legacy URL replaces the route's heading during canonicalization.
      // Measure the final planet-scoped screen, not the outgoing route.
      await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/${route}`)
      const heading = page.getByRole('heading', {
        name: title,
        level: 2,
        exact: true,
      })
      await expect(heading).toHaveCount(0)
      await expect(page.getByRole('navigation', { name: 'Fleet navigation' })).toBeVisible()
      // Preserve the accessible route heading without taking up visual space.
      await expect.poll(async () => {
        const box = await page.locator('main h1').locator('..').boundingBox()
        return box?.height ?? Number.POSITIVE_INFINITY
      }).toBeLessThanOrEqual(1)
      await expect(
        page.getByRole('combobox', { name: 'Destination', exact: true }),
      ).toHaveValue(id(6))
      await expect(
        page.getByRole('button', { name: 'Calculate transport', exact: true }),
      ).toBeEnabled()
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width)
      await diagnosticScreenshot(page, {
        path: `test-results/legacy-${route}-header-${width}.png`,
      })
    }
  })
}

for (const width of [390, 1280]) {
  test(`tabbed pages omit repeated titles and preserve route focus at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await shellFixture(page, { protocol: 4 })
    for (const [route, title, navigation] of [
      ['resources', 'Resources', 'Build'],
      ['facilities', 'Facilities', 'Build'],
      ['research', 'Research', 'Build'],
      ['shipyard', 'Shipyard', 'Build'],
      ['defense', 'Defense', 'Build'],
      ['fleets', 'Fleets', 'Fleet'],
      ['galaxy', 'Galaxy', 'Fleet'],
      ['dispatch', 'Dispatch', 'Fleet'],
    ]) {
      await page.goto(`/u/andromeda/b/${body.id}/${route}`)
      const tabs = page.getByRole('navigation', { name: `${navigation} navigation` })
      await expect(tabs).toBeVisible()
      await expect(tabs.getByRole('link', { name: title, exact: true })).toHaveAttribute('aria-current', 'page')
      await expect(page.locator('main h1')).toHaveText(title)
      await expect(page.locator('main h1')).toBeFocused()
      await expect.poll(async () => (await page.locator('main h1').locator('..').boundingBox())?.height ?? Infinity).toBeLessThanOrEqual(1)
      await expect(page.locator('main header').getByRole('heading', { level: 2, name: new RegExp(`^${title}( fleet| review)?$`) })).toHaveCount(0)
      if (route === 'fleets') {
        await expect(page.getByRole('link', { name: 'Dispatch a fleet' })).toBeVisible()
        await expect(page.getByText(/Fleet slots:/)).toBeVisible()
      }
      if (route === 'dispatch') {
        await expect(page.getByText(/Origin .*Fleet slots:/)).toBeVisible()
        await expect(page.getByRole('group', { name: 'Mission and destination' })).toBeVisible()
      }
    }
  })
}
