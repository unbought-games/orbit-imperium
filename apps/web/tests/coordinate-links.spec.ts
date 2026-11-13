import { routeWorld } from './fixtures/game'
import { withGalaxyResponse } from './fixtures/galaxy'
import { selectBody } from './fixtures/body-selector'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { test, expect, type Page } from './fixtures/test'
import type { components } from '../src/contracts'
import { shellFixture, binding, body, id, resources } from './fixtures/game'
import { withBootstrapResponse, withReportResponse } from './fixtures/responses'

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
  await routeWorld(page, async (route) => {
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
  ).toHaveAttribute('data-value', body.id)
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
  test(`selected galaxy location retains its outline with focus inside at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await setup(page)
    await withGalaxyResponse(page, () => page.goto(path('galaxy?galaxy=1&system=5&position=12')))
    const selected = page.locator('li[aria-current="location"]')
    await expect(selected).toBeFocused()
    await expect(selected).toHaveCSS('outline-style', 'solid')
    const control = selected.getByRole('link', { name: 'View [1:5:12] in galaxy', exact: true })
    await expect(control).toHaveCSS('min-height', '24px')
    await control.focus()
    await expect(control).toBeFocused()
    await expect(selected).toHaveCSS('outline-style', 'solid')
    await expect(selected).toHaveCSS('outline-width', '2px')
    if (width < 768) await expect(control).toHaveCSS('outline-style', 'none')
  })

  test(`mission endpoints retain planet context and browser history at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 })
    const requests = await setup(page)
    await withBootstrapResponse(page, () => page.goto(path(`fleets/${fleet.id}`)))
    const target = page
      .getByRole('link', {
        name: 'View destination [1:5:12] in galaxy',
        exact: true,
      })
      .first()
    await expect(target).toBeVisible()
    const coordinate = target.locator('..')
    await expect(coordinate.getByRole('button')).toHaveCount(0)
    await target.click({ button: 'right' })
    await expect(
      page.getByRole('menuitem', { name: 'Copy coordinates', exact: true }),
    ).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu')).toHaveCount(0)
    await expect(target).toBeFocused()
    await target.blur()
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
    await withGalaxyResponse(page, () => page.reload())
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
      page.getByRole('textbox', { name: 'Solar system' }),
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
      page.getByRole('link', { name: /^View .* fleet$/ }),
    ).toBeVisible()
  })
}

test('returning mission keeps origin and destination labels unambiguous', async ({
  page,
}) => {
  await setup(page, 'Returning')
  await withBootstrapResponse(page, () => page.goto(path(`fleets/${fleet.id}`)))
  const mission = page.getByRole('article', { name: 'Attack fleet' })
  await expect(
    mission.getByRole('img', { name: /^Returning: .* ← / }),
  ).toBeVisible()
  await withGalaxyResponse(page, () =>
    mission.getByRole('link', { name: 'View destination [1:5:12] in galaxy' }).click(),
  )
  await assertLocation(page, 5, 12)
})

test('fleet card coordinates open Galaxy from the overview and the modal HUD', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await setup(page)
  const overview = path('overview')
  await withBootstrapResponse(page, () => page.goto(overview))
  const card = page.getByRole('region', { name: 'Fleet movements' })
    .getByRole('listitem', { name: 'Attack fleet' })
  const destination = { name: 'View destination [1:5:12] in galaxy', exact: true }
  await withGalaxyResponse(page, () => card.getByRole('link', destination).click())
  await assertLocation(page, 5, 12)
  await page.goBack()
  await expect(page).toHaveURL(overview)
  await expect(card).toBeVisible()

  await page.getByTestId('command-orb').click()
  const hud = page.getByRole('dialog', { name: 'Command uplink' })
  await hud.getByRole('button', { name: /^Fleets/ }).click()
  const link = hud.getByRole('link', destination)
  await link.click({ button: 'right' })
  const viewInGalaxy = hud.getByRole('menuitem', { name: 'View in Galaxy' })
  await expect(viewInGalaxy).toBeVisible()
  await expect(page).toHaveURL(overview)
  await diagnosticScreenshot(page, { path: 'test-results/hud-coordinate-menu-1280x900.png' })
  await page.keyboard.press('Escape')
  await expect(viewInGalaxy).toBeHidden()
  await page.setViewportSize({ width: 390, height: 844 })
  await link.click({ button: 'right' })
  await expect(viewInGalaxy).toBeVisible()
  await diagnosticScreenshot(page, { path: 'test-results/hud-coordinate-menu-390x844.png' })
  await withGalaxyResponse(page, () => viewInGalaxy.click())
  await assertLocation(page, 5, 12)
  await expect(hud).toBeHidden()
})

test('context-free direct links preserve coordinates and invalid locations are safe', async ({
  page,
}) => {
  const requests = await setup(page)
  await withGalaxyResponse(page, () => page.goto('/u/andromeda-prime/galaxy?galaxy=1&system=5&position=12'))
  await assertLocation(page, 5, 12)
  requests.length = 0
  await withBootstrapResponse(page, () => page.goto(path('galaxy?galaxy=1&system=500&position=12')))
  await expect(page.getByRole('alert')).toContainText('outside this universe')
  expect(requests).toEqual([])
  await withBootstrapResponse(page, () => page.goto(path('galaxy?galaxy=1&system=-1&position=12')))
  await expect(
    page.getByRole('heading', { name: 'Destination unavailable', exact: true }),
  ).toBeVisible()
  expect(requests).toEqual([])
})

test('planet selector is one target while empire coordinates browse without changing selection', async ({
  page,
}) => {
  await setup(page)
  await withBootstrapResponse(page, () => page.goto(path('overview')))
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    const selector = page.getByRole('combobox', { name: 'Selected body' })
    const controls = selector
    await expect(controls.getByRole('link')).toHaveCount(0)
    for (const label of [
      controls.locator('img'),
      controls.getByText('Planet', { exact: true }),
      controls.getByText('[1:371:12]', { exact: true }),
    ]) {
      const box = (await label.boundingBox())!
      const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
      expect(
        await selector.evaluate(
          (element, { x, y }) => document.elementFromPoint(x, y) === element,
          point,
        ),
      ).toBe(true)
      await page.mouse.click(point.x, point.y)
      await expect(page.getByRole('listbox')).toBeVisible()
      await page.keyboard.press('Escape')
      // Escape returns focus before the closing popup is hidden. Let that
      // visible state settle before clicking the trigger again.
      await expect(page.locator('[role="listbox"]:visible')).toHaveCount(0)
      await expect(selector).toBeFocused()
      await expect(page).toHaveURL(new RegExp(`/b/${body.id}/overview$`))
    }
    await selectBody(page, other.id)
    await expect(page).toHaveURL(new RegExp(`/b/${other.id}/overview$`))
    await selectBody(page, body.id)
    await expect(page).toHaveURL(new RegExp(`/b/${body.id}/overview$`))
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
  await selectBody(page, other.id)
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
    await withReportResponse(page, header.id, () => page.goto(`/u/andromeda-prime/b/${body.id}/reports/${header.id}`))
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

test('copy, menus and explicit dispatch actions preserve origin and recent copy', async ({
  page,
}) => {
  await setup(page)
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          ;(window as unknown as { copied: string }).copied = text
        },
      },
    })
  })
  await withBootstrapResponse(page, () => page.goto(path(`fleets/${fleet.id}`)))
  const target = page
    .getByRole('link', {
      name: 'View destination [1:5:12] in galaxy',
      exact: true,
    })
    .first()
  await target.click({ button: 'right' })
  await page
    .getByRole('menuitem', { name: 'Copy coordinates', exact: true })
    .click()
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { copied: string }).copied),
    )
    .toBe('[1:5:12]')
  await expect(target.locator('..').getByRole('status')).toHaveText(
    'Coordinates copied.',
  )
  await target.click({ button: 'right' })
  await page
    .getByRole('menuitem', { name: 'Copy location link', exact: true })
    .click()
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { copied: string }).copied),
    )
    .toContain('/u/andromeda-prime/location/1:5:12')
  await expect(page.getByRole('menu')).toHaveCount(0)
  await target.click({ button: 'right' })
  await page
    .getByRole('menuitem', { name: 'Prepare transport', exact: true })
    .click()
  await expect(page).toHaveURL(new RegExp(`/b/${body.id}/dispatch\\?`))
  const input = page.getByLabel('Destination coordinates', { exact: true })
  await expect(input).toHaveValue('1:5:12')
  await expect(
    page.getByText('Recently copied in game:', { exact: false }),
  ).toBeVisible()
  await input.fill('1:3:4')
  await expect(input).toHaveValue('1:3:4')
  await page
    .getByRole('button', { name: 'Use destination', exact: true })
    .click()
  await expect(input).toHaveValue('1:5:12')
  await withGalaxyResponse(page, () => page.reload())
  await expect(input).toHaveValue('1:5:12')
})

test('share URLs highlight deleted moon slots and preserve moon intent through reload and paste', async ({
  page,
}) => {
  await setup(page)
  await withGalaxyResponse(page, () => page.goto('/u/andromeda-prime/location/1:5:12?target=moon'))
  await expect(page).toHaveURL(
    /galaxy\?galaxy=1&system=5&position=12&target=moon/,
  )
  await expect(page.locator('li[aria-current="location"]')).toHaveAttribute(
    'id',
    'position-12',
  )
  await expect(page.locator('li[aria-current="location"]')).toContainText(
    'Empty position',
  )
  await withGalaxyResponse(page, () => page.goto(
    '/u/andromeda-prime/location/1:5:12?target=moon&mission=transport',
  ))
  const input = page.getByLabel('Destination coordinates', { exact: true })
  await expect(input).toHaveValue('1:5:12')
  await expect(page.getByLabel('Destination preview')).toContainText('Moon unavailable')
  await withGalaxyResponse(page, () => page.reload())
  await expect(page.getByLabel('Destination preview')).toContainText('Moon unavailable')
  await withGalaxyResponse(page, () => input.evaluate((element) => {
    const data = new DataTransfer()
    data.setData(
      'text/plain',
      location.origin + '/u/andromeda-prime/location/1:7:3?target=moon',
    )
    element.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    )
  }))
  await expect(input).toHaveValue('1:7:3')
  await expect(page.getByLabel('Destination preview')).toContainText('Moon unavailable')
  await input.evaluate((element) => {
    const data = new DataTransfer()
    data.setData(
      'text/plain',
      'https://other.test/u/andromeda-prime/location/1:2:3',
    )
    element.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    )
  })
  await expect(input).toHaveValue('1:7:3')
  await expect(page.getByRole('alert')).toContainText(
    'this server and universe',
  )
})

test('shared locations show an access error without offering enrollment', async ({
  page,
}) => {
  await setup(page)
  await page.route('**/api/v1/bootstrap', (route) =>
    route.fulfill({
      json: {
        version: 1,
        signup_enabled: true,
        result: {
          status: 'authenticated',
          session: {
            account: binding.account,
            csrf: 'test',
            expires_at: 9999999999,
            memberships: [],
          },
          game: { status: 'no_membership' },
        },
      },
    }),
  )
  await withBootstrapResponse(page, () => page.goto('/u/andromeda-prime/location/1:5:12'))
  await expect(
    page.getByRole('heading', { name: 'Destination unavailable', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('You do not have access to this universe.'),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: /join|enroll/i })).toHaveCount(
    0,
  )
})

test('closing a coordinate menu respects focus moved to its location link', async ({ page }) => {
  await setup(page)
  await withBootstrapResponse(page, () => page.goto(path(`fleets/${fleet.id}`)))
  const target = page.getByRole('link', { name: 'View destination [1:5:12] in galaxy', exact: true }).first()
  const origin = page.getByRole('link', { name: 'View origin [1:2:4] in galaxy', exact: true }).first()
  await target.click({ button: 'right' })
  const menu = page.getByRole('menu')
  await expect(menu).toBeVisible()
  await page.keyboard.press('Escape')
  await origin.focus()
  await expect(menu).toHaveCount(0)
  await expect(origin).toBeFocused()
  await page.keyboard.press('Enter')
  await assertLocation(page, 2, 4)
})

test.describe('coordinate actions on touch', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } })
  test('long-press opens location actions without following the link', async ({ page }) => {
    await setup(page)
    await withBootstrapResponse(page, () => page.goto(path(`fleets/${fleet.id}`)))
    const target = page.getByRole('link', { name: 'View destination [1:5:12] in galaxy', exact: true }).first()
    await expect(target).toBeVisible()
    await expect(target.locator('..').getByRole('button')).toHaveCount(0)
    const box = (await target.boundingBox())!
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] })
    await expect(page.getByRole('menuitem', { name: 'Copy coordinates', exact: true })).toBeVisible()
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await expect(page.getByRole('menuitem', { name: 'Copy location link', exact: true })).toBeVisible()
    await expect(page).toHaveURL(path(`fleets/${fleet.id}`))
    await diagnosticScreenshot(page, { path: 'test-results/coordinate-long-press-390.png' })
  })
})
