import { routeWorld } from './fixtures/game'
import { withGalaxyResponse } from './fixtures/galaxy'
import { selectBody } from './fixtures/body-selector'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { test, expect, type Page } from './fixtures/test'
import type { components } from '../src/contracts'
import { shellFixture, binding, body, id, resources } from './fixtures/game'
import { withBootstrapResponse } from './fixtures/responses'

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
  await expect(
    selected.getByRole('link', {
      name: `View [1:${system}:${position}] in galaxy`,
      exact: true,
    }),
  ).toBeVisible()
  await expect(selected).toBeInViewport()
  await expect(selected).toBeFocused()
  await expect(selected).toContainText('Empty position')
  await expect(page.locator('a a, button a, a button')).toHaveCount(0)
}
for (const width of [390]) {
  test(`mission endpoints retain planet context and browser history at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 })
    const requests = await setup(page)
    await withBootstrapResponse(page, () =>
      page.goto(path(`fleets/${fleet.id}`)),
    )
    // A fleet is empire-wide. Changing the funding body must retain the selected fleet detail.
    await selectBody(page, other.id)
    await expect(page).toHaveURL(
      `/u/andromeda-prime/b/${other.id}/fleets/${fleet.id}`,
    )
    await withBootstrapResponse(page, () => page.reload())
    await expect(
      page.getByRole('heading', { name: 'Mission details', exact: true }),
    ).toBeVisible()
    await expect(
      page
        .getByRole('list', { name: 'Ship composition' })
        .getByRole('listitem'),
    ).toHaveText(['Small Cargo 3'])
    await selectBody(page, body.id)
    await expect(page).toHaveURL(path(`fleets/${fleet.id}`))
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

test('fleet card coordinates open Galaxy from the overview and the modal HUD', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await setup(page)
  const overview = path('overview')
  await withBootstrapResponse(page, () => page.goto(overview))
  const card = page
    .getByRole('region', { name: 'Fleet movements' })
    .getByRole('listitem', { name: 'Attack fleet' })
  const destination = {
    name: 'View destination [1:5:12] in galaxy',
    exact: true,
  }
  await withGalaxyResponse(page, () =>
    card.getByRole('link', destination).click(),
  )
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
  await diagnosticScreenshot(page, {
    path: 'test-results/hud-coordinate-menu-1280x900.png',
  })
  await page.keyboard.press('Escape')
  await expect(viewInGalaxy).toBeHidden()
  await page.setViewportSize({ width: 390, height: 844 })
  await link.click({ button: 'right' })
  await expect(viewInGalaxy).toBeVisible()
  await diagnosticScreenshot(page, {
    path: 'test-results/hud-coordinate-menu-390x844.png',
  })
  await withGalaxyResponse(page, () => viewInGalaxy.click())
  await assertLocation(page, 5, 12)
  await expect(hud).toBeHidden()
})

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
  await withGalaxyResponse(page, () =>
    page.goto('/u/andromeda-prime/location/1:5:12?target=moon'),
  )
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
  await withGalaxyResponse(page, () =>
    page.goto(
      '/u/andromeda-prime/location/1:5:12?target=moon&mission=transport',
    ),
  )
  const input = page.getByLabel('Destination coordinates', { exact: true })
  await expect(input).toHaveValue('1:5:12')
  await expect(page.getByLabel('Destination preview')).toContainText(
    'Moon unavailable',
  )
  await withGalaxyResponse(page, () => page.reload())
  await expect(page.getByLabel('Destination preview')).toContainText(
    'Moon unavailable',
  )
  await withGalaxyResponse(page, () =>
    input.evaluate((element) => {
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
    }),
  )
  await expect(input).toHaveValue('1:7:3')
  await expect(page.getByLabel('Destination preview')).toContainText(
    'Moon unavailable',
  )
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
            csrf: 'fixture',
            expires_at: 9999999999,
            memberships: [],
          },
          game: { status: 'no_membership' },
        },
      },
    }),
  )
  await withBootstrapResponse(page, () =>
    page.goto('/u/andromeda-prime/location/1:5:12'),
  )
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
