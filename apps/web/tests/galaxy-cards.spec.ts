import { selectBody } from './fixtures/body-selector'
import { coordinatePattern } from './fixtures/coordinates'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { test, expect, type Page } from './fixtures/test'
import {
  installGameFixture,
  shellFixture,
  refreshGame,
  playerProfilesFixture,
  body,
  binding,
  id,
} from './fixtures/game'
import type { components } from '../src/contracts'

async function setup(
  page: Page,
  blocker: components['schemas']['GameError4'] | null = 'BeginnerProtected',
  options: Parameters<typeof shellFixture>[1] = {},
  overrides: Record<
    number,
    Partial<components['schemas']['GalaxyPosition4']>
  > = {},
) {
  let revision = 1
  await installGameFixture(page, {
    protocol: 4,
    viewerRevision: () => String(revision),
    extraCapabilities: ['Attack', 'Espionage', 'Harvest'],
    bodies: [
      {
        ...body,
        inventories: [
          ...body.inventories,
          { item: { kind: 'Ship', id: 'EspionageProbe' }, count: '2' },
        ],
      },
    ],
    ...options,
  })
  let fail = false
  await page.route('**/world', async (route) => {
    const { context, galaxy, system } = route.request().postDataJSON()
    const sampledAt =
      typeof options.sampledAt === 'function'
        ? options.sampledAt()
        : (options.sampledAt ?? Date.now())
    if (fail)
      return route.fulfill({ status: 503, json: { code: 'Unavailable' } })
    await route.fulfill({
      json: {
        protocol: 4,
        binding,
        request_id: context.request_id,
        viewer_revision: options.viewerRevision?.() ?? String(revision),
        sampled_at: sampledAt,
        as_of_ms: sampledAt,
        data: {
          galaxy,
          system,
          observed_at: sampledAt,
          player_names: {
            [id(31)]: 'CommanderAndromedaTheUnreasonablyLongName',
          },
          positions: Array.from({ length: 15 }, (_, i) => ({
            coordinates: { galaxy, system, position: i + 1 },
            body:
              i < 3
                ? {
                    id: i === 0 ? body.id : id(i + 20),
                    kind: 'Planet',
                    owner: i === 0 ? binding.player : id(i === 1 ? 31 : 32),
                    activity: { type: 'Recent' },
                    inactivity: 'Active',
                    vacation: false,
                    attack_blocker: i === 2 ? blocker : null,
                    espionage_eligible:
                      i === 1 || (i === 2 && blocker === null),
                  }
                : null,
            debris:
              i === 1 || i === 3
                ? {
                    field_identity: id(40),
                    // Galaxy returns whole units, unlike report Resources.
                    metal: '900',
                    crystal: '1500',
                  }
                : null,
            ...overrides[i + 1],
          })),
        },
      },
    })
  })
  await page.goto(`/u/andromeda/b/${body.id}/galaxy`)
  return {
    setFailure: (value: boolean) => {
      fail = value
    },
    clearProtection: () => {
      blocker = null
      revision++
    },
  }
}

const rows = (page: Page) =>
  page.getByRole('region', { name: 'Galaxy positions' }).getByRole('article')
const actions = (page: Page, position: number) =>
  rows(page)
    .nth(position - 1)
    .getByRole('button', { name: /^Actions for / })
const spy = (page: Page, position = 2) =>
  rows(page)
    .nth(position - 1)
    .getByRole('button', { name: /^(Spy on|Probe requested for) / })
const targetBody = (
  patch: Partial<
    NonNullable<components['schemas']['GalaxyPosition4']['body']>
  > = {},
): NonNullable<components['schemas']['GalaxyPosition4']['body']> => ({
  id: id(21),
  kind: 'Planet',
  owner: id(31),
  activity: { type: 'Recent' },
  inactivity: 'Active',
  vacation: false,
  attack_blocker: null,
  espionage_eligible: true,
  ...patch,
})
const debris = { field_identity: id(40), metal: '900', crystal: '1500' }

test('protection is a green player status with an accessible explanation and blocks hostile actions until refreshed', async ({
  page,
}) => {
  const fixture = await setup(page)
  const protectedCard = rows(page).nth(2)
  const badge = protectedCard.getByRole('button', {
    name: 'Beginner protection',
    exact: true,
  })
  await expect(badge).toBeVisible()
  await expect(
    rows(page).first().getByRole('button', { name: 'Beginner protection' }),
  ).toHaveCount(0)
  await expect(
    protectedCard.getByText('Player 00000000', { exact: true }),
  ).toHaveCSS('color', 'rgb(164, 232, 200)')
  await expect(protectedCard).toHaveCSS('border-left-width', '0px')
  await badge.focus()
  await expect(page.getByRole('tooltip')).toContainText(
    'blocks attacks and espionage between you and this player',
  )
  await expect(badge).toHaveAttribute(
    'aria-describedby',
    (await page.getByRole('tooltip').getAttribute('id')) as string,
  )
  await page.keyboard.press('Escape')
  await expect(page.getByRole('tooltip')).toBeHidden()
  await expect(spy(page, 3)).toBeDisabled()
  await expect(spy(page, 3)).toHaveAttribute('title', /Beginner protection/)
  await actions(page, 3).click()
  await expect(
    page.getByRole('menuitem', { name: 'Attack', exact: true }),
  ).toBeDisabled()
  await expect(
    page.getByRole('menuitem', { name: 'Transport', exact: true }),
  ).toBeEnabled()
  fixture.clearProtection()
  await refreshGame(page)
  await expect(badge).toHaveCount(0)
  await expect(
    page.getByRole('menuitem', { name: 'Attack', exact: true }),
  ).toBeEnabled()
  await expect(spy(page, 3)).toBeEnabled()
})

test('vacation and inactivity coexist; tooltips support hover, keyboard, tap and dismissal', async ({
  page,
}) => {
  await setup(
    page,
    null,
    {},
    {
      2: {
        body: targetBody({
          vacation: true,
          inactivity: 'Inactive28',
          attack_blocker: 'TargetVacation',
          espionage_eligible: false,
        }),
      },
      3: {
        body: targetBody({
          id: id(22),
          owner: id(32),
          inactivity: 'Inactive7',
          activity: { type: 'Minutes', minutes: 28 },
        }),
      },
    },
  )
  const card = rows(page).nth(1)
  const inactive = card.getByRole('button', {
    name: 'Inactive for 28 days or more',
  })
  const vacation = card.getByRole('button', { name: 'Vacation mode' })
  await expect(inactive).toBeVisible()
  await expect(vacation).toBeVisible()
  await expect(
    card.getByText('CommanderAndromedaTheUnreasonablyLongName', {
      exact: true,
    }),
  ).toHaveCSS('color', 'rgb(198, 184, 237)')
  await expect(
    rows(page).nth(2).getByText('Player 00000000', { exact: true }),
  ).toHaveCSS('color', 'rgb(160, 166, 173)')
  await inactive.hover()
  await expect(page.getByRole('tooltip')).toContainText('Inactive for 28 days')
  await page.keyboard.press('Escape')
  await vacation.focus()
  await expect(page.getByRole('tooltip')).toContainText('Vacation mode')
  await page.keyboard.press('Escape')
  await vacation.blur()
  await page.mouse.move(0, 0)
  await vacation.click()
  await expect(page.getByRole('tooltip')).toContainText('Attacks and espionage')
  await page
    .getByRole('heading', { name: 'Galaxy', exact: true })
    .click({ force: true })
  await expect(page.getByRole('tooltip')).toBeHidden()
  await card
    .getByRole('button', { name: 'Activity within the last 15 minutes' })
    .click()
  await expect(page.getByRole('tooltip')).toContainText(
    'does not necessarily mean the player is online',
  )
  await page.keyboard.press('Escape')
  await expect(spy(page)).toBeDisabled()
  await actions(page, 2).click()
  await expect(
    page.getByRole('menuitem', { name: 'Attack', exact: true }),
  ).toBeDisabled()
  await expect(
    page.getByRole('menuitem', { name: 'Transport', exact: true }),
  ).toBeDisabled()
  await expect(
    page.getByRole('menuitem', { name: 'Harvest', exact: true }),
  ).toBeEnabled()
  await expect(page.getByRole('menu')).toContainText('vacation mode')
})

test('every row keeps its Actions control and your selected planet can harvest its own debris', async ({
  page,
}) => {
  const colony = {
    ...body,
    id: id(77),
    name: 'Colony',
    coordinates: { galaxy: 1, system: 371, position: 3 },
  }
  await setup(
    page,
    null,
    {
      bodies: [body, colony],
      extraCapabilities: [
        'Attack',
        'Espionage',
        'Harvest',
        'Colonize',
        'Deploy',
      ],
    },
    {
      3: {
        body: targetBody({
          id: colony.id,
          owner: binding.player,
          name: 'Colony',
        }),
        debris,
      },
    },
  )
  await expect(rows(page)).toHaveCount(15)
  await expect(page.getByRole('button', { name: /^Actions for / })).toHaveCount(
    15,
  )
  await expect(actions(page, 1)).toBeDisabled()
  await actions(page, 3).click()
  await expect(page.getByRole('menuitem')).toHaveText([
    'Transport',
    'Deploy',
    'Harvest',
  ])
  await page.keyboard.press('Escape')
  await selectBody(page, colony.id)
  await actions(page, 3).click()
  await expect(page.getByRole('menuitem')).toHaveText(['Harvest'])
  await page.getByRole('menuitem', { name: 'Harvest', exact: true }).click()
  await page.getByRole('dialog', { name: 'Harvest mission', exact: true }).getByRole('button', { name: 'Customize', exact: true }).click()
  await expect(
    page.getByRole('combobox', { name: 'Mission', exact: true }),
  ).toHaveValue('Harvest')
  await expect(page.getByLabel('Destination preview')).toContainText('Debris field')
  await expect(
    page.getByLabel('Destination coordinates', { exact: true }),
  ).toHaveValue(coordinatePattern('position', '3'))
})

test('system navigation, unavailable worlds and retry preserve eligibility and exact debris amounts', async ({
  page,
}) => {
  const fixture = await setup(page)
  await expect(rows(page)).toHaveCount(15)
  await expect(page.getByLabel('Solar system')).toHaveValue('371')
  await expect(rows(page).first()).toContainText('Your planet')
  await expect(rows(page).nth(1)).toContainText(
    'CommanderAndromedaTheUnreasonablyLongName',
  )
  for (const index of [1, 3]) {
    expect(
      await rows(page)
        .nth(index)
        .getByTitle('Metal', { exact: true })
        .innerText(),
    ).toBe('900')
    expect(
      await rows(page)
        .nth(index)
        .getByTitle('Crystal', { exact: true })
        .innerText(),
    ).toBe('1,500')
  }
  await actions(page, 4).click()
  await page.getByRole('menuitem', { name: 'Harvest', exact: true }).click()
  await page.getByRole('dialog', { name: 'Harvest mission', exact: true }).getByRole('button', { name: 'Customize', exact: true }).click()
  await expect(
    page.getByLabel('Destination coordinates', { exact: true }),
  ).toHaveValue(coordinatePattern('position', '4'))
  await page.goto(`/u/andromeda/b/${body.id}/galaxy`)
  await page.getByLabel('Solar system').fill('499')
  await page.getByLabel('Solar system').press('Enter')
  await expect(rows(page).first()).toContainText('[1:499:1]')
  await expect(page.getByRole('button', { name: 'Next system' })).toBeDisabled()
  fixture.setFailure(true)
  await page.getByLabel('Solar system').fill('498')
  await page.getByLabel('Solar system').press('Enter')
  await expect(page.getByRole('alert')).toContainText('Galaxy unavailable')
  await expect(rows(page)).toHaveCount(0)
  fixture.setFailure(false)
  await page.getByRole('button', { name: 'Retry loading galaxy' }).click()
  await expect(rows(page)).toHaveCount(15)
})

for (const mission of ['Transport', 'Attack']) {
  test(`planet Actions opens the ${mission} draft`, async ({ page }) => {
    await setup(page)
    await actions(page, 2).click()
    await page.getByRole('menuitem', { name: mission, exact: true }).click()
    await expect(
      page.getByRole('combobox', { name: 'Mission', exact: true }),
    ).toHaveValue(mission)
    await expect(
      page.getByLabel('Destination coordinates', { exact: true }),
    ).toHaveValue(coordinatePattern('system', '371'))
    await expect(
      page.getByLabel('Destination coordinates', { exact: true }),
    ).toHaveValue(coordinatePattern('position', '2'))
  })
}

test('one coordinate control supports copy, navigation and keyboard focus restoration', async ({
  page,
}) => {
  await setup(page)
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  const card = rows(page).nth(1)
  const coordinate = card.getByRole('button', {
    name: 'Location actions for [1:371:2]',
  })
  await expect(
    card.getByRole('button', { name: /^Copy coordinates/ }),
  ).toHaveCount(0)
  await coordinate.focus()
  await page.keyboard.press('Enter')
  await page
    .getByRole('menuitem', { name: 'Copy coordinates', exact: true })
    .click()
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe('[1:371:2]')
  await expect(coordinate).toBeFocused()
  await coordinate.click()
  await page
    .getByRole('menuitem', { name: 'View in Galaxy', exact: true })
    .click()
  await expect(page.locator('li[aria-current="location"]')).toContainText(
    'Selected location [1:371:2]',
  )
  const trigger = actions(page, 2)
  await trigger.focus()
  await page.keyboard.press('Enter')
  await expect(
    page.getByRole('menuitem', { name: 'Transport', exact: true }),
  ).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(page.locator('button button, button a, a button')).toHaveCount(0)
})

test('shared columns align all debris and controls; mobile rows reach both edges without horizontal overflow', async ({
  page,
}) => {
  await setup(
    page,
    null,
    {},
    { 3: { debris: { ...debris, metal: '999999999', crystal: '123456789' } } },
  )
  const controls = page.getByRole('group', { name: 'Galaxy controls' })
  const nav = page.getByRole('navigation', { name: 'Fleet navigation' })
  for (const width of [320, 390, 599, 600, 767, 768, 1280, 1440]) {
    await page.setViewportSize({ width, height: 640 })
    await page.evaluate(() => window.scrollTo(0, 0))
    await expect(rows(page)).toHaveCount(15)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width)
    const measurements = await rows(page).evaluateAll((elements) =>
      elements.map((el) => {
        const rect = el.getBoundingClientRect()
        const art = el
          .querySelector('img[src*="/art/debris/"]')
          ?.getBoundingClientRect()
        const amounts = el
          .querySelector('[title="Metal"]')
          ?.getBoundingClientRect()
        const action = el
          .querySelector('button[aria-label^="Actions for"]')!
          .getBoundingClientRect()
        return {
          left: rect.left,
          right: rect.right,
          border: getComputedStyle(el).borderLeftWidth,
          art: art?.left,
          amounts: amounts?.left,
          action: action.left,
        }
      }),
    )
    expect(new Set(measurements.map((m) => m.action)).size).toBe(1)
    expect(
      new Set(measurements.filter((m) => m.art !== undefined).map((m) => m.art))
        .size,
    ).toBe(1)
    expect(
      new Set(
        measurements
          .filter((m) => m.amounts !== undefined)
          .map((m) => m.amounts),
      ).size,
    ).toBe(1)
    for (const measurement of measurements) {
      expect(measurement.border).toBe('0px')
      if (width <= 767) {
        expect(measurement.left).toBe(0)
        expect(measurement.right).toBe(width)
      }
    }
    const planet = await rows(page)
      .nth(1)
      .getByText('Planet', { exact: true })
      .boundingBox()
    const identity = await rows(page)
      .nth(1)
      .getByText('CommanderAndromedaTheUnreasonablyLongName', { exact: true })
      .boundingBox()
    expect(identity!.y).toBeGreaterThan(planet!.y)
    expect(measurements[1].art!).toBeGreaterThan(planet!.x + planet!.width)
    await expect(
      rows(page)
        .nth(1)
        .getByRole('button', { name: /^Spy on/ })
        .getByText('Spy', { exact: true }),
    ).toBeVisible({ visible: width >= 600 })
    await expect(
      actions(page, 2).getByText('Actions', { exact: true }),
    ).toBeVisible({ visible: width >= 600 })
    await page.evaluate(() => window.scrollTo(0, 400))
    await expect
      .poll(async () => {
        const tabs = (await nav.boundingBox())!,
          bar = (await controls.boundingBox())!
        return Math.abs(bar.y - tabs.y - tabs.height - (width >= 768 ? 1 : 0))
      })
      .toBeLessThanOrEqual(1)
    await expect(controls).toBeInViewport({ ratio: 1 })
    await expect(
      page.getByRole('region', { name: 'Galaxy positions' }),
    ).toHaveCSS('overflow', 'visible')
    await diagnosticScreenshot(page, {
      path: `test-results/galaxy-layout-${width}.png`,
    })
  }
})

test('empty positions offer Colonize only when supported, and preserve the coordinate draft', async ({
  page,
}) => {
  await setup(page)
  await expect(actions(page, 5)).toBeDisabled()
  await setup(page, null, { extraCapabilities: ['Colonize'] })
  await actions(page, 5).focus()
  await page.keyboard.press('Enter')
  const colonize = page.getByRole('menuitem', { name: 'Colonize', exact: true })
  await expect(colonize).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(actions(page, 5)).toBeFocused()
  await actions(page, 5).click()
  await colonize.click()
  await expect(
    page.getByRole('combobox', { name: 'Mission', exact: true }),
  ).toHaveValue('Colonize')
  await expect(
    page.getByLabel('Destination coordinates', { exact: true }),
  ).toHaveValue(coordinatePattern('position', '5'))
})

test('incoming fleets and report details use the supplied public name without an identity request', async ({
  page,
}) => {
  const playerNames = { [id(9)]: 'Commander Vega' }
  const identityRequests: string[] = []
  page.on('request', (request) => {
    if (/players|identities/.test(new URL(request.url()).pathname))
      identityRequests.push(request.url())
  })
  await shellFixture(page, { protocol: 4, playerNames })
  await page.getByRole('link', { name: 'Fleet', exact: true }).click()
  await page
    .getByRole('navigation', { name: 'Fleet navigation' })
    .getByRole('link', { name: 'Fleets', exact: true })
    .click()
  await expect(
    page.getByRole('region', { name: 'Incoming fleets' }),
  ).toContainText('From Commander Vega')
  const reportId = id(62)
  let names: Record<string, string> | undefined = playerNames
  await page.route('**/api/**/reports/**', async (route) => {
    const context = route.request().postDataJSON()
    await route.fulfill({
      json: {
        protocol: 4,
        binding,
        request_id: context.request_id,
        viewer_revision: '1',
        sampled_at: Date.now(),
        as_of_ms: Date.now(),
        data: {
          header: {
            id: reportId,
            kind: 'SpyContact',
            observed_at: Date.now() - 1000,
            read: false,
            hidden: false,
          },
          payload: {
            kind: 'SpyContact',
            at: Date.now() - 1000,
            sender: id(9),
            origin: body.coordinates,
            target: body.coordinates,
            probability_ppm: 0,
            detected: false,
          },
          player_names: names,
        },
      },
    })
  })
  await page.goto(`/u/andromeda/reports/${reportId}?body=${body.id}`)
  const report = page.getByRole('region', { name: 'Report observation' })
  await expect(report).toContainText('Commander Vega made espionage contact')
  names = undefined
  await page.reload()
  await expect(report).toContainText('Player 00000000 made espionage contact')
  expect(identityRequests).toEqual([])
})

test('supporter preview compares identities without a session or game requests', async ({
  page,
}) => {
  const apiRequests: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/'))
      apiRequests.push(request.url())
  })
  await page.goto('/supporter-preview')
  const account = page.getByRole('region', { name: 'Account preview' })
  const galaxy = page.getByRole('region', { name: 'Galaxy preview' })
  await expect(
    account.getByRole('img', { name: 'Supporter · $25 / month USD' }),
  ).toBeVisible()
  await expect(galaxy.getByRole('img', { name: /Supporter/ })).toHaveCount(3)
  await expect(galaxy.getByText('Wayfarer', { exact: true })).toBeVisible()
  await page
    .getByLabel('03 / Try your name')
    .fill('ACommanderWithAnExtraordinarilyLongName')
  await page
    .getByRole('button', { name: 'Preview $100 / month', exact: true })
    .click()
  await expect(
    account.getByRole('img', { name: 'Supporter · $100 / month USD' }),
  ).toBeVisible()
  const name = account.getByText('ACommanderWithAnExtraordinarilyLongName', {
    exact: true,
  })
  await expect(name.locator('..')).toHaveCSS('color', 'rgb(242, 187, 131)')
  await page.getByRole('button', { name: /Aurora/ }).click()
  await expect(name.locator('..')).toHaveCSS('color', 'rgb(240, 203, 122)')
  await page.getByRole('button', { name: /Celestial/ }).click()
  await page.getByRole('button', { name: /Signature star/ }).click()
  await expect(
    page.getByRole('button', { name: /Signature star/ }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(
    account
      .getByRole('img', { name: 'Supporter · $100 / month USD' })
      .locator('svg'),
  ).toHaveClass(/lucide-star/)
  await galaxy
    .getByRole('button', { name: /^Actions for/ })
    .first()
    .click()
  await page.getByRole('menuitem', { name: 'Transport', exact: true }).click()
  await expect(page.getByRole('status')).toContainText(
    'No mission has been sent',
  )
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  }
  expect(apiRequests).toEqual([])
  await page.getByLabel('03 / Try your name').fill('StellarNomad')
  await page.getByRole('button', { name: /Starlight/ }).click()
  await page.getByRole('button', { name: /Signature star/ }).click()
  await page
    .getByRole('button', { name: 'Preview $25 / month', exact: true })
    .click()
  await page.setViewportSize({ width: 1440, height: 1200 })
  await diagnosticScreenshot(page, {
    path: 'test-results/supporter-preview-desktop.png',
    fullPage: true,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await diagnosticScreenshot(page, {
    path: 'test-results/supporter-preview-mobile.png',
    fullPage: true,
  })
})

test('Galaxy uses the signed-in supporter identity for the owned planet', async ({
  page,
}) => {
  await setup(page)
  await page.route('**/api/auth/config', (route) =>
    route.fulfill({ json: { mode: 'oidc', universes: [] } }),
  )
  await playerProfilesFixture(page, () => [
    { player: binding.player, username: 'StellarNomad', supporter_tier: 2 },
    { player: id(32), username: 'ProtectedCommander', supporter_tier: 1 },
  ])
  await page.reload()
  const cards = page
    .getByRole('region', { name: 'Galaxy positions' })
    .getByRole('listitem')
  await expect(
    cards.first().getByText('StellarNomad', { exact: true }),
  ).toBeVisible()
  await expect(
    cards.first().getByRole('button', { name: 'Supporter · $25 / month USD' }),
  ).toBeVisible()
  await expect(
    cards
      .nth(1)
      .getByText('CommanderAndromedaTheUnreasonablyLongName', { exact: true }),
  ).toBeVisible()
  await expect(
    cards.nth(1).getByRole('button', { name: /Supporter/ }),
  ).toHaveCount(0)
  await expect(
    cards.first().getByText('StellarNomad', { exact: true }),
  ).toHaveCSS('color', 'rgb(244, 244, 242)')
  const supporter = cards
    .first()
    .getByRole('button', { name: 'Supporter · $25 / month USD' })
  await expect(supporter).toHaveCSS('color', 'rgb(240, 172, 212)')
  await supporter.click()
  await expect(page.getByRole('tooltip')).toContainText(
    'does not affect gameplay strength or protection',
  )
  await page.keyboard.press('Escape')
  await expect(
    cards.nth(2).getByText('ProtectedCommander', { exact: true }),
  ).toHaveCSS('color', 'rgb(164, 232, 200)')
  await expect(
    cards.nth(2).getByRole('button', { name: 'Supporter · $10 / month USD' }),
  ).toHaveCSS('color', 'rgb(133, 214, 239)')
  await expect(
    cards
      .nth(2)
      .getByRole('button', { name: 'Beginner protection', exact: true }),
  ).toBeVisible()
  await diagnosticScreenshot(page, {
    path: 'test-results/supporter-live-galaxy.png',
    fullPage: true,
  })
})

for (const width of [320, 390, 1280]) {
  test(`galaxy controls stay compact with touch-sized targets at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 })
    await setup(page)
    const toolbar = page.getByRole('group', { name: 'Galaxy controls' })
    await expect(toolbar).toBeVisible()
    await expect(
      page.getByText(
        /Browsing is free|Activity can be caused by fleets|fleet slots|System map/,
      ),
    ).toHaveCount(0)
    await expect(
      page.getByRole('navigation', { name: 'System atlas' }),
    ).toHaveCount(0)
    const positions = page.getByRole('region', { name: 'Galaxy positions' })
    await expect(positions.getByRole('listitem')).toHaveCount(15)
    const toolbarBox = (await toolbar.boundingBox())!
    expect(
      (await positions.boundingBox())!.y - toolbarBox.y - toolbarBox.height,
    ).toBeLessThanOrEqual(1)
    const controls = [
      toolbar.getByRole('textbox', { name: 'Galaxy', exact: true }),
      toolbar.getByRole('button', { name: 'Previous system' }),
      toolbar.getByRole('textbox', { name: 'Solar system' }),
      toolbar.getByRole('button', { name: 'Next system' }),
      toolbar.getByRole('button', { name: 'Go', exact: true }),
    ]
    const boxes = []
    for (const control of controls) {
      await expect(control).toBeVisible()
      const box = (await control.boundingBox())!
      expect(box.height).toBeGreaterThanOrEqual(44)
      expect(box.width).toBeGreaterThanOrEqual(44)
      boxes.push(box)
    }
    expect(
      Math.max(...boxes.map((box) => box.y)) -
        Math.min(...boxes.map((box) => box.y)),
    ).toBeLessThanOrEqual(1)
    expect((await toolbar.boundingBox())!.height).toBeLessThanOrEqual(80)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width)
    await controls[3].click()
    await expect(controls[2]).toHaveValue('372')
    await controls[1].click()
    await expect(controls[2]).toHaveValue('371')
    await expect(
      page.getByRole('button', { name: /Refresh galaxy|Retry loading galaxy/ }),
    ).toHaveCount(0)
    await expect(
      page
        .getByRole('region', { name: 'Galaxy positions' })
        .getByRole('listitem'),
    ).toHaveCount(15)
    await diagnosticScreenshot(page, {
      path: `test-results/galaxy-compact-controls-${width}.png`,
    })
  })
}

test('one-click espionage stays in Galaxy, reserves one departure and tracks the outbound and return legs', async ({
  page,
}) => {
  let revision = 1
  const missions: components['schemas']['MissionView4'] = {
    fleets: [],
    incoming: [],
    score_value_micro: '0',
    fleet_slots: '3',
  }
  await setup(page, null, { missions, viewerRevision: () => String(revision) })
  const slots = page.getByText(/^Fleet slots: \d+ used \/ 3 total$/)
  await expect(slots).toHaveText('Fleet slots: 0 used / 3 total')
  let quotes = 0,
    launches = 0
  let releaseQuote!: () => void, releaseLaunch!: () => void
  const quoteGate = new Promise<void>((resolve) => {
    releaseQuote = resolve
  })
  const launchGate = new Promise<void>((resolve) => {
    releaseLaunch = resolve
  })
  const intents: components['schemas']['FleetIntent4'][] = []
  await page.route('**/world', async (route) => {
    const request = route.request().postDataJSON()
    if (request.type !== 'FleetQuote') return route.fallback()
    quotes++
    intents.push(request.intent)
    await quoteGate
    await route.fulfill({
      json: {
        protocol: 4,
        binding,
        request_id: request.context.request_id,
        viewer_revision: String(revision),
        sampled_at: Date.now(),
        as_of_ms: Date.now(),
        data: {
          intent: request.intent,
          profile_hash: 'a'.repeat(64),
          terms_hash: 'b'.repeat(64),
          distance: 1000,
          speeds: [['EspionageProbe', '100000000']],
          duration_ms: 120000,
          fuel: '1000000',
          capacity: '5000000',
          maximum_payload: '4000000',
          slot_limit: '3',
        },
      },
    })
  })
  await page.route('**/commands', async (route) => {
    launches++
    const { gameplay, presence } = route.request().postDataJSON()
    expect(presence.command.action.paired_command_id).toBe(gameplay.command_id)
    expect(gameplay.command.action.intent).toEqual(intents[0])
    await launchGate
    missions.fleets.push({
      id: id(80),
      intent: intents[0],
      origin: body.coordinates,
      destination: { galaxy: 1, system: 371, position: 2 },
      leg: 'Outbound',
      ships: [{ ship_type: 'EspionageProbe', count: '1' }],
      cargo: { metal: '0', crystal: '0', deuterium: '0' },
      due_at: Date.now() + 120000,
      launched_at: Date.now(),
      duration_ms: 120000,
      paid_fuel: '1000000',
      can_recall: true,
    })
    revision++
    await route.fulfill({
      json: {
        protocol: 4,
        binding,
        command_id: gameplay.command_id,
        admitted_at: Date.now(),
        executed_at: Date.now(),
        status: 'Committed',
        result_ids: [id(80)],
        minimum_viewer_revision: String(revision),
      },
    })
  })
  const rows = page
    .getByRole('region', { name: 'Galaxy positions' })
    .getByRole('listitem')
  const target = rows.nth(1)
  const originalRows = await rows.elementHandles()
  const pendingRefreshes: (() => void)[] = []
  await page.route('**/world', async (route) => {
    if (route.request().postDataJSON().type !== 'Galaxy')
      return route.fallback()
    await new Promise<void>((resolve) => {
      pendingRefreshes.push(resolve)
    })
    await route.fallback()
  })
  const finishRefresh = async (count: number) => {
    await expect.poll(() => pendingRefreshes.length).toBe(count)
    await expect(rows).toHaveCount(15)
    await expect(
      page.getByText('Loading system…', { exact: true }),
    ).toHaveCount(0)
    await expect(
      target.getByRole('button', { name: /^Actions for/ }),
    ).toBeVisible()
    for (const row of originalRows)
      expect(await row.evaluate((node) => node.isConnected)).toBe(true)
    const response = page.waitForResponse(
      (response) =>
        response.url().endsWith('/world') &&
        response.request().postDataJSON().type === 'Galaxy',
    )
    pendingRefreshes[count - 1]()
    await response
    await expect(
      target.getByRole('button', { name: /^Actions for/ }),
    ).toBeVisible()
  }
  const spy = target.getByRole('button', {
    name: /^(Spy on|Probe requested for) /,
  })
  await spy.evaluate((button) => {
    ;(button as HTMLButtonElement).click()
    ;(button as HTMLButtonElement).click()
  })
  await expect.poll(() => quotes).toBe(1)
  await expect(spy).toHaveAttribute('data-feedback', 'true')
  await expect(spy).toBeDisabled()
  releaseQuote()
  await expect.poll(() => launches).toBe(1)
  await expect(
    target.getByRole('group', { name: /^Your fleets to / }),
  ).toContainText('Espionage departure pending')
  await expect(slots).toHaveText('Fleet slots: 1 used / 3 total')
  expect(intents[0]).toEqual({
    origin: body.id,
    destination: {
      type: 'Body',
      id: id(21),
      expected_owner: id(31),
      expected_kind: 'Planet',
    },
    mission: 'Espionage',
    ships: [{ owner: binding.player, ship_type: 'EspionageProbe', count: '1' }],
    cargo: { metal: '0', crystal: '0', deuterium: '0' },
    speed_percent: 100,
  })
  releaseLaunch()
  await finishRefresh(1)
  await expect(slots).toHaveText('Fleet slots: 1 used / 3 total')
  await expect(
    target.getByRole('group', { name: /^Your fleets to / }),
  ).toHaveText(/Espionage en route · \d/)
  await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/galaxy`)
  await expect(page.getByRole('region', { name: 'Fleet quote' })).toHaveCount(0)
  await diagnosticScreenshot(page, {
    path: 'test-results/galaxy-espionage-outbound.png',
  })
  await target.getByRole('button', { name: /^Actions for/ }).focus()
  const scrollY = await page.evaluate(() => window.scrollY)
  missions.fleets[0].leg = 'Returning'
  revision++
  await refreshGame(page)
  await finishRefresh(2)
  await expect(slots).toHaveText('Fleet slots: 1 used / 3 total')
  await expect(
    target.getByRole('button', { name: /^Actions for/ }),
  ).toBeFocused()
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY)
  await expect(
    target.getByRole('group', { name: /^Your fleets to / }),
  ).toHaveCount(0)
  await expect(
    rows.first().getByRole('group', { name: /^Your fleets to / }),
  ).toHaveText(/Espionage returning · \d/)
  missions.fleets = []
  revision++
  await refreshGame(page)
  await finishRefresh(3)
  await expect(slots).toHaveText('Fleet slots: 0 used / 3 total')
  await expect(
    target.getByRole('button', { name: /^Actions for/ }),
  ).toBeFocused()
  await expect(
    rows.first().getByRole('group', { name: /^Your fleets to / }),
  ).toHaveCount(0)
  expect(quotes).toBe(1)
  expect(launches).toBe(1)
})

test('galaxy espionage explains quote failures inline without navigating or launching', async ({
  page,
}) => {
  await setup(page)
  await page.route('**/world', async (route) => {
    if (route.request().postDataJSON().type !== 'FleetQuote')
      return route.fallback()
    await route.fulfill({
      status: 409,
      json: { code: 'InsufficientResources' },
    })
  })
  const target = page
    .getByRole('region', { name: 'Galaxy positions' })
    .getByRole('listitem')
    .nth(1)
  await target
    .getByRole('button', { name: /^(Spy on|Probe requested for) / })
    .click()
  await expect(target.getByRole('alert')).toContainText('not enough resources')
  await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/galaxy`)
  await expect(
    target.getByRole('button', { name: /^(Spy on|Probe requested for) / }),
  ).toBeEnabled()
})

test('galaxy espionage is unavailable without a stationed probe', async ({
  page,
}) => {
  await setup(page, null, { bodies: [body] })
  const target = page
    .getByRole('region', { name: 'Galaxy positions' })
    .getByRole('listitem')
    .nth(1)
  const spy = target.getByRole('button', {
    name: /^(Spy on|Probe requested for) /,
  })
  await expect(spy).toBeDisabled()
  await expect(spy).toHaveAttribute(
    'title',
    'No espionage probes available on the selected planet.',
  )
  await expect(target.getByRole('alert')).toHaveCount(0)
})

test('galaxy probe countdown ticks without reloading rows or fetching the system', async ({
  page,
}) => {
  const now = Date.now()
  await page.clock.install({ time: now - 1000 })
  await page.clock.pauseAt(now)
  const missions: components['schemas']['MissionView4'] = {
    incoming: [],
    score_value_micro: '0',
    fleet_slots: '3',
    fleets: [
      {
        id: id(80),
        intent: {
          origin: body.id,
          destination: {
            type: 'Body',
            id: id(21),
            expected_owner: id(31),
            expected_kind: 'Planet',
          },
          mission: 'Espionage',
          ships: [
            { owner: binding.player, ship_type: 'EspionageProbe', count: '1' },
          ],
          cargo: { metal: '0', crystal: '0', deuterium: '0' },
          speed_percent: 100,
        },
        origin: body.coordinates,
        destination: { galaxy: 1, system: 371, position: 2 },
        leg: 'Outbound',
        ships: [{ ship_type: 'EspionageProbe', count: '1' }],
        cargo: { metal: '0', crystal: '0', deuterium: '0' },
        due_at: now + 120000,
        launched_at: now,
        duration_ms: 120000,
        paid_fuel: '1000000',
        can_recall: true,
      },
    ],
  }
  await setup(page, null, { missions, sampledAt: now })
  const target = page
    .getByRole('region', { name: 'Galaxy positions' })
    .getByRole('listitem')
    .nth(1)
  await expect(
    target.getByRole('group', { name: /^Your fleets to / }),
  ).toHaveText('Espionage en route · 2m 0s')
  const row = await target.elementHandle()
  let requests = 0
  page.on('request', (request) => {
    if (
      request.url().endsWith('/world') &&
      request.postDataJSON().type === 'Galaxy'
    )
      requests++
  })
  await page.clock.fastForward(5000)
  await expect(
    target.getByRole('group', { name: /^Your fleets to / }),
  ).toHaveText('Espionage en route · 1m 55s')
  expect(await row!.evaluate((node) => node.isConnected)).toBe(true)
  await expect(
    target.getByRole('button', { name: /^Actions for/ }),
  ).toBeVisible()
  await expect(page.getByText('Loading system…', { exact: true })).toHaveCount(
    0,
  )
  expect(requests).toBe(0)
})

test('typed coordinates commit together, validate universe bounds, and follow history', async ({
  page,
}) => {
  const requests: string[] = []
  page.on('request', (request) => {
    if (
      request.url().endsWith('/world') &&
      request.postDataJSON().type === 'Galaxy'
    ) {
      const { galaxy, system } = request.postDataJSON()
      requests.push(`${galaxy}:${system}`)
    }
  })
  await setup(page, null, {
    dimensions: { galaxies: 3, systems_per_galaxy: 420 },
  })
  const galaxy = page.getByRole('textbox', { name: 'Galaxy', exact: true })
  const system = page.getByRole('textbox', { name: 'Solar system' })
  const go = page.getByRole('button', { name: 'Go', exact: true })
  await expect(
    page.getByRole('region', { name: 'Galaxy positions' }),
  ).toBeVisible()
  await expect(galaxy).toHaveAttribute('inputmode', 'numeric')
  await expect(system).toHaveAttribute('enterkeyhint', 'go')
  for (const value of ['', '4', '42', '420']) {
    await system.fill(value)
    await expect(system).toHaveValue(value)
    await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/galaxy`)
  }
  await galaxy.fill('3')
  await system.press('Tab')
  expect(requests).toEqual(['1:371'])
  await go.click()
  await expect(page).toHaveURL(/galaxy=3&system=420$/)
  await expect(page.getByRole('button', { name: 'Next system' })).toBeDisabled()
  await expect.poll(() => requests).toEqual(['1:371', '3:420'])
  await system.fill('')
  await system.press('Enter')
  await expect(system).toBeFocused()
  await expect(system).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByRole('alert')).toHaveText(
    'Enter a whole system number from 1 to 420.',
  )
  for (const value of ['0', '421', '-1', '1.5', '1e2', 'abc']) {
    await system.fill(value)
    await system.press('Enter')
    await expect(system).toHaveValue(value)
    await expect(system).toHaveAttribute('aria-invalid', 'true')
  }
  await galaxy.fill('4')
  await go.click()
  await expect(page.getByRole('alert')).toContainText(
    'Enter a whole galaxy number from 1 to 3.',
  )
  expect(requests).toEqual(['1:371', '3:420'])
  await galaxy.press('Escape')
  await expect(galaxy).toHaveValue('3')
  await expect(system).toHaveValue('420')
  await expect(page.getByRole('alert')).toHaveCount(0)
  await system.fill('001')
  await system.press('Enter')
  await expect(system).toBeFocused()
  await expect(system).toHaveValue('1')
  await expect(
    page.getByRole('button', { name: 'Previous system' }),
  ).toBeDisabled()
  await expect(page).toHaveURL(/galaxy=3&system=1$/)
  await system.fill('99')
  await page.goBack()
  await expect(galaxy).toHaveValue('3')
  await expect(system).toHaveValue('420')
  await page.goBack()
  await expect(galaxy).toHaveValue('1')
  await expect(system).toHaveValue('371')
  await page.goForward()
  await expect(galaxy).toHaveValue('3')
  await expect(system).toHaveValue('420')
  // Arrow navigation uses the displayed system, discarding unfinished edits.
  await system.fill('12')
  await page.getByRole('button', { name: 'Previous system' }).click()
  await expect(system).toHaveValue('419')
  await expect(page).toHaveURL(/galaxy=3&system=419$/)
})

test('a delayed response never replaces a newer typed destination', async ({
  page,
}) => {
  await setup(page)
  await expect(
    page.getByRole('region', { name: 'Galaxy positions' }),
  ).toBeVisible()
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let pending = false
  await page.route('**/world', async (route) => {
    const request = route.request().postDataJSON()
    if (request.type === 'Galaxy' && request.system === 24) {
      pending = true
      await gate
    }
    await route.fallback()
  })
  const system = page.getByRole('textbox', { name: 'Solar system' })
  await system.fill('24')
  await system.press('Enter')
  await expect.poll(() => pending).toBe(true)
  await expect(
    page.getByRole('region', { name: 'Galaxy positions' }),
  ).toHaveCount(0)
  await system.fill('25')
  await system.press('Enter')
  const rows = page.getByRole('region', { name: 'Galaxy positions' })
  await expect(rows).toContainText('[1:25:1]')
  const response = page.waitForResponse(
    (response) =>
      response.url().endsWith('/world') &&
      response.request().postDataJSON().system === 24,
  )
  release()
  await response
  await expect(rows).toContainText('[1:25:1]')
  await expect(rows).not.toContainText('[1:24:1]')
  await expect(system).toBeFocused()
})

function probeFleet(
  index: number,
  now: number,
): components['schemas']['OwnMission4'] {
  return {
    id: id(80 + index),
    intent: {
      origin: body.id,
      destination: {
        type: 'Body',
        id: id(21),
        expected_owner: id(31),
        expected_kind: 'Planet',
      },
      mission: 'Espionage',
      ships: [
        { owner: binding.player, ship_type: 'EspionageProbe', count: '1' },
      ],
      cargo: { metal: '0', crystal: '0', deuterium: '0' },
      speed_percent: 100,
    },
    origin: body.coordinates,
    destination: { galaxy: 1, system: 371, position: 2 },
    leg: 'Outbound',
    ships: [{ ship_type: 'EspionageProbe', count: '1' }],
    cargo: { metal: '0', crystal: '0', deuterium: '0' },
    due_at: now + (index + 1) * 60000,
    launched_at: now,
    duration_ms: (index + 1) * 60000,
    paid_fuel: '1000000',
    can_recall: true,
  }
}

test('six fleets collapse to one summary, expand individually, and preserve expansion during refresh', async ({
  page,
}) => {
  const now = 1793000000000
  await page.clock.install({ time: now - 1000 })
  await page.clock.pauseAt(now)
  let revision = 1
  const missions: components['schemas']['MissionView4'] = {
    incoming: [],
    score_value_micro: '0',
    fleet_slots: '8',
    fleets: Array.from({ length: 6 }, (_, i) => probeFleet(i, now)),
  }
  let sampledAt = now
  const options = {
    missions,
    viewerRevision: () => String(revision),
    sampledAt: () => sampledAt,
  }
  await setup(page, null, options)
  const target = rows(page).nth(1)
  const summary = target.getByLabel('Show 6 fleets to [1:371:2]', {
    exact: true,
  })
  await expect(summary).toHaveText('6 fleets · next in 1m 0sDetails')
  await expect(target.getByRole('listitem')).toHaveCount(0)
  await summary.focus()
  await page.keyboard.press('Enter')
  await expect(target.getByRole('listitem')).toHaveCount(6)
  await expect(target.getByRole('listitem').first()).toHaveText(
    'Espionage en route · 1m 0s',
  )
  await page.clock.fastForward(5000)
  await expect(summary).toContainText('next in 55s')
  missions.fleets[0].leg = 'Returning'
  revision++
  sampledAt = now + 5000
  await refreshGame(page)
  await page.clock.runFor(1)
  await expect(target.getByRole('listitem')).toHaveCount(5)
  await expect(target.getByLabel('Show 5 fleets to [1:371:2]')).toContainText(
    'next in 1m 55s',
  )
  await expect(
    rows(page)
      .first()
      .getByRole('group', { name: /^Your fleets/ }),
  ).toContainText('returning')
  await expect(rows(page)).toHaveCount(15)
})

for (const width of [390, 1280])
  test(`Spy acknowledges optimistically at a fixed size and fades back at ${width}px`, async ({
    page,
  }) => {
    const now = 1793000000000
    await page.setViewportSize({ width, height: 844 })
    await page.clock.install({ time: now - 1000 })
    await page.clock.pauseAt(now)
    await setup(page, null, { sampledAt: now })
    let quotes = 0,
      launches = 0
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/world', async (route) => {
      const request = route.request().postDataJSON()
      if (request.type !== 'FleetQuote') return route.fallback()
      quotes++
      await gate
      await route.fulfill({
        status: 409,
        json: { code: 'InsufficientResources' },
      })
    })
    page.on('request', (request) => {
      if (request.url().endsWith('/commands')) launches++
    })
    const button = spy(page)
    const before = (await button.boundingBox())!
    await button.click()
    await expect(button).toHaveAttribute('data-feedback', 'true')
    await expect(button).toHaveAccessibleName('Probe requested for [1:371:2]')
    await expect(rows(page).nth(1).getByRole('alert')).toHaveCount(0)
    const during = (await button.boundingBox())!
    expect([during.width, during.height]).toEqual([before.width, before.height])
    await button.evaluate((button) => (button as HTMLButtonElement).click())
    await expect.poll(() => quotes).toBe(1)
    await page.clock.fastForward(1400)
    await expect(button).toHaveAttribute('data-feedback', 'false')
    await expect(button).toBeDisabled() // Still awaiting the original quote.
    const after = (await button.boundingBox())!
    expect([after.width, after.height]).toEqual([before.width, before.height])
    release()
    await expect(rows(page).nth(1).getByRole('alert')).toContainText(
      'not enough resources',
    )
    await expect(button).toBeEnabled()
    expect(launches).toBe(0)
    await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/galaxy`)
  })

test('a rejected launch clears the optimistic check and reports the authoritative error inline', async ({
  page,
}) => {
  const now = 1793000000000
  await page.clock.install({ time: now - 1000 })
  await page.clock.pauseAt(now)
  await setup(page, null, { sampledAt: now })
  await page.route('**/world', async (route) => {
    const request = route.request().postDataJSON()
    if (request.type !== 'FleetQuote') return route.fallback()
    await route.fulfill({
      json: {
        protocol: 4,
        binding,
        request_id: request.context.request_id,
        viewer_revision: '1',
        sampled_at: now,
        as_of_ms: now,
        data: {
          intent: request.intent,
          profile_hash: 'a'.repeat(64),
          terms_hash: 'b'.repeat(64),
          distance: 1000,
          speeds: [['EspionageProbe', '100000000']],
          duration_ms: 120000,
          fuel: '1000000',
          capacity: '0',
          maximum_payload: '0',
          slot_limit: '3',
        },
      },
    })
  })
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/commands', async (route) => {
    const { gameplay } = route.request().postDataJSON()
    await gate
    await route.fulfill({
      json: {
        protocol: 4,
        binding,
        command_id: gameplay.command_id,
        admitted_at: now,
        executed_at: now,
        status: 'Rejected',
        code: 'InsufficientResources',
      },
    })
  })
  const button = spy(page)
  await button.click()
  await expect(button).toHaveAttribute('data-feedback', 'true')
  release()
  await expect(rows(page).nth(1).getByRole('alert')).toContainText(
    'not enough resources',
  )
  await expect(button).toHaveAttribute('data-feedback', 'false')
  await expect(button).toBeEnabled()
})

test.describe('touch status tooltips', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } })
  test('a tap opens each simultaneous status and an outside tap dismisses it', async ({
    page,
  }) => {
    await setup(
      page,
      null,
      {},
      {
        2: {
          body: targetBody({
            vacation: true,
            inactivity: 'Inactive7',
            attack_blocker: 'TargetVacation',
          }),
        },
      },
    )
    const card = rows(page).nth(1)
    await card.getByRole('button', { name: 'Vacation mode', exact: true }).tap()
    await expect(page.getByRole('tooltip')).toContainText('Vacation mode')
    await rows(page).first().getByText('Your planet', { exact: true }).tap()
    await expect(page.getByRole('tooltip')).toBeHidden()
    await card
      .getByRole('button', { name: 'Inactive for 7 days or more', exact: true })
      .tap()
    await expect(page.getByRole('tooltip')).toContainText(
      'Visiting fleets can still cause activity',
    )
    await rows(page).first().getByText('Your planet', { exact: true }).tap()
    await expect(page.getByRole('tooltip')).toBeHidden()
  })
})

const recyclerCatalog: components['schemas']['CatalogEntry3'][] = [{
  key: { kind: 'Ship', id: 'Recycler' }, enabled: true, mobile: true,
  body_kinds: ['Planet'], requirements: [],
  ship_statistics: { combat: null, propulsion: { cargo_capacity: '20000', base_speed: '2000', fuel_consumption: '300', drive: 'CombustionDrive', impulse_upgrade: null } },
}]
async function setupHarvest(page: Page, count = '5', slots = '3') {
  await page.setViewportSize({ width: 390, height: 844 })
  await setup(page, null, {
    catalog: recyclerCatalog,
    bodies: [{ ...body, inventories: [{ item: { kind: 'Ship', id: 'Recycler' }, count }] }],
    missions: { fleets: [], incoming: [], fleet_slots: slots, score_value_micro: '0' },
  }, { 2: { debris: { field_identity: id(42), metal: '40000', crystal: '1' } } })
}
async function openHarvest(page: Page) {
  await actions(page, 2).click()
  await page.getByRole('menuitem', { name: 'Harvest', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'Harvest mission', exact: true })
  await expect(sheet).toBeVisible()
  return sheet
}
function harvestTerms(intent: components['schemas']['FleetIntent4']) {
  return { intent, profile_hash: 'a'.repeat(64), terms_hash: 'b'.repeat(64), distance: 1000, speeds: [['Recycler', '2000']], duration_ms: 120000, fuel: '1000000', capacity: '60000000000', maximum_payload: '60000000000', slot_limit: '3' }
}

test('mobile harvest opens at half height, derives the count, and Customize preserves destination', async ({ page }) => {
  // LAN HTTP does not expose secure-context randomUUID. UI sessions need no UUID.
  await page.addInitScript(() => Object.defineProperty(crypto, 'randomUUID', { value: undefined }))
  await setupHarvest(page)
  const requests: string[] = []
  page.on('request', request => { if (request.url().endsWith('/commands')) requests.push(request.url()) })
  const sheet = await openHarvest(page)
  const panel = sheet.getByRole('region', { name: 'Harvest mission sheet', exact: true })
  await expect.poll(async () => (await panel.boundingBox())?.y).toBeCloseTo(444, 0)
  await expect(sheet.getByRole('textbox', { name: 'Recyclers', exact: true })).toHaveValue('3')
  await expect(sheet).toContainText('5 available · 3 needed')
  await expect(sheet.getByRole('button', { name: 'Send', exact: true })).toBeEnabled()
  await expect(page).toHaveURL(/\/galaxy$/)
  expect(requests).toEqual([])
  await sheet.getByRole('button', { name: 'Customize', exact: true }).click()
  await expect(page).toHaveURL(/\/dispatch\?/)
  await expect(page.getByRole('combobox', { name: 'Mission', exact: true })).toHaveValue('Harvest')
  await expect(page.getByRole('combobox', { name: 'Destination type' })).toHaveValue('debris')
  await expect(page.getByLabel('Destination coordinates', { exact: true })).toHaveValue(coordinatePattern('position', '2'))
})

for (const [count, slots, reason] of [
  ['0', '3', 'No recyclers available on the selected planet.'],
  ['5', '0', 'No fleet slots available. Wait for a fleet to return.'],
] as const) {
  test(`mobile harvest explains ${reason}`, async ({ page }) => {
    await setupHarvest(page, count, slots)
    const sheet = await openHarvest(page)
    await expect(sheet).toContainText(reason)
    await expect(sheet.getByRole('textbox', { name: 'Recyclers', exact: true })).toBeDisabled()
    await expect(sheet.getByRole('button', { name: 'Send', exact: true })).toBeDisabled()
    await expect(sheet.getByRole('button', { name: 'Customize', exact: true })).toBeEnabled()
  })
}

test('mobile harvest caps the default and validates manual quantities', async ({ page }) => {
  await setupHarvest(page, '2')
  const sheet = await openHarvest(page), input = sheet.getByRole('textbox', { name: 'Recyclers', exact: true })
  await expect(input).toHaveValue('2')
  await expect(sheet).toContainText('2 available · 3 needed')
  for (const value of ['0', '', '1.5', '3']) {
    await input.fill(value)
    await expect(sheet.getByRole('button', { name: 'Send', exact: true })).toBeDisabled()
  }
  await input.fill('1')
  await expect(sheet.getByRole('button', { name: 'Send', exact: true })).toBeEnabled()
  await page.keyboard.press('Escape')
  await expect(sheet).not.toBeVisible()
  await expect(actions(page, 2)).toBeFocused()
})

test('mobile harvest quotes and sends one departure, stays in Galaxy and reserves ships and slots', async ({ page }) => {
  await setupHarvest(page)
  let quotes = 0, launches = 0
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/world', async route => {
    const request = route.request().postDataJSON()
    if (request.type !== 'FleetQuote') return route.fallback()
    quotes++
    expect(request.intent).toEqual({ origin: body.id, mission: 'Harvest', destination: { type: 'Debris', coordinates: { galaxy: 1, system: 371, position: 2 }, field_identity: id(42) }, ships: [{ owner: binding.player, ship_type: 'Recycler', count: '3' }], cargo: { metal: '0', crystal: '0', deuterium: '0' }, speed_percent: 100 })
    await gate
    await route.fulfill({ json: { protocol: 4, binding, request_id: request.context.request_id, viewer_revision: '1', sampled_at: Date.now(), as_of_ms: Date.now(), data: harvestTerms(request.intent) } })
  })
  await page.route('**/commands', async route => {
    const { gameplay } = route.request().postDataJSON()
    if (gameplay.command.type !== 'World' || gameplay.command.action.type !== 'LaunchFleet') return route.fallback()
    launches++
    await route.fulfill({ json: { protocol: 4, binding, command_id: gameplay.command_id, admitted_at: Date.now(), executed_at: Date.now(), status: 'Committed', result_ids: [id(90)], minimum_viewer_revision: '2' } })
  })
  const sheet = await openHarvest(page)
  await sheet.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(sheet.getByRole('button', { name: 'Sending…', exact: true })).toBeDisabled()
  await expect.poll(() => quotes).toBe(1)
  release()
  await expect(sheet).not.toBeVisible()
  await expect(page).toHaveURL(/\/galaxy$/)
  expect(launches).toBe(1)
  await expect(page.getByText('Fleet slots: 1 used / 3 total')).toBeVisible()
  const reopened = await openHarvest(page)
  await expect(reopened.getByRole('textbox', { name: 'Recyclers', exact: true })).toHaveValue('2')
})

test('closing mobile harvest while quoting never launches a stale selection', async ({ page }) => {
  await setupHarvest(page)
  let release!: () => void, quotes = 0, launches = 0
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/world', async route => {
    const request = route.request().postDataJSON()
    if (request.type !== 'FleetQuote') return route.fallback()
    quotes++
    await gate
    await route.fulfill({ json: { protocol: 4, binding, request_id: request.context.request_id, viewer_revision: '1', sampled_at: Date.now(), as_of_ms: Date.now(), data: harvestTerms(request.intent) } })
  })
  page.on('request', request => { if (request.url().endsWith('/commands') && request.postDataJSON().gameplay?.command?.action?.type === 'LaunchFleet') launches++ })
  const sheet = await openHarvest(page)
  await sheet.getByRole('button', { name: 'Send', exact: true }).click()
  await expect.poll(() => quotes).toBe(1)
  await page.keyboard.press('Escape')
  await expect(sheet).not.toBeVisible()
  const response = page.waitForResponse(response => response.url().endsWith('/world') && response.request().postDataJSON().type === 'FleetQuote')
  release()
  await response
  await openHarvest(page)
  expect(launches).toBe(0)
})

test('desktop Harvest opens an anchored popover, selects the quantity and preserves explicit Customize', async ({ page }) => {
  await setupHarvest(page)
  await page.setViewportSize({ width: 1280, height: 900 })
  const before = await rows(page).nth(1).boundingBox()
  const popover = await openHarvest(page)
  const input = popover.getByRole('textbox', { name: 'Recyclers', exact: true })
  await expect(input).toBeFocused()
  await expect(input).toHaveValue('3')
  expect(await input.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd])).toEqual([0, 1])
  await expect(page).toHaveURL(/\/galaxy$/)
  expect(await rows(page).nth(1).boundingBox()).toEqual(before)
  const anchor = (await actions(page, 2).boundingBox())!, box = (await popover.boundingBox())!
  expect(box.width).toBe(340)
  expect(box.x + box.width).toBeCloseTo(anchor.x + anchor.width, 0)
  expect(box.y).toBeCloseTo(anchor.y + anchor.height + 8, 0)
  expect(await page.evaluate(() => document.body.style.position)).toBe('')
  await expect(page.getByRole('button', { name: 'Resize action sheet' })).toHaveCount(0)
  await input.fill('2')
  await page.keyboard.press('Escape')
  await expect(popover).not.toBeVisible()
  await expect(actions(page, 2)).toBeFocused()
  await openHarvest(page)
  await page.mouse.click(20, 150)
  await expect(popover).not.toBeVisible()
  await openHarvest(page)
  await popover.getByRole('button', { name: 'Customize', exact: true }).click()
  await expect(page).toHaveURL(/\/dispatch\?/)
  await expect(page.getByRole('combobox', { name: 'Mission', exact: true })).toHaveValue('Harvest')
})

for (const width of [390, 1280]) {
test(`coordinate Harvest shares the quick form and restores its opener at ${width}px`, async ({ page }) => {
  await setupHarvest(page)
  await page.setViewportSize({ width, height: 844 })
  const trigger = rows(page).nth(1).getByRole('button', { name: 'Location actions for [1:371:2]', exact: true })
  await trigger.click()
  await page.getByRole('menuitem', { name: 'Prepare harvest', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'Harvest mission', exact: true })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('textbox', { name: 'Recyclers', exact: true })).toHaveValue('3')
  await expect(page).toHaveURL(/\/galaxy$/)
  await page.keyboard.press('Escape')
  await expect(sheet).not.toBeVisible()
  await expect(trigger).toBeFocused()
})
}


test('mobile harvest displays fuel quote failures without creating a departure', async ({ page }) => {
  await setupHarvest(page)
  let launches = 0
  await page.route('**/world', route => route.request().postDataJSON().type === 'FleetQuote' ? route.fulfill({ status: 409, json: { code: 'InsufficientResources' } }) : route.fallback())
  page.on('request', request => { if (request.url().endsWith('/commands') && request.postDataJSON().gameplay?.command?.action?.type === 'LaunchFleet') launches++ })
  const sheet = await openHarvest(page)
  await sheet.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(sheet.getByRole('alert')).toContainText(/fuel|deuterium|resources/i)
  await expect(sheet.getByRole('button', { name: 'Send', exact: true })).toBeEnabled()
  expect(launches).toBe(0)
})

test('Harvest preserves the edited quantity when switching between popover and sheet', async ({ page }) => {
  await setupHarvest(page)
  await page.setViewportSize({ width: 1280, height: 900 })
  const surface = await openHarvest(page)
  await surface.getByRole('textbox', { name: 'Recyclers', exact: true }).fill('2')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('button', { name: 'Resize action sheet', exact: true })).toBeFocused()
  await expect(surface.getByRole('textbox', { name: 'Recyclers', exact: true })).toHaveValue('2')
  await page.setViewportSize({ width: 1280, height: 900 })
  await expect(surface.getByRole('textbox', { name: 'Recyclers', exact: true })).toBeFocused()
  await expect(surface.getByRole('textbox', { name: 'Recyclers', exact: true })).toHaveValue('2')
  expect(await page.evaluate(() => document.body.style.position)).toBe('')
})

test('desktop Harvest shares blocked-state explanations and fits near the viewport edge', async ({ page }) => {
  await setupHarvest(page, '0', '0')
  await page.setViewportSize({ width: 800, height: 550 })
  const popover = await openHarvest(page)
  await expect(popover).toContainText('No recyclers available')
  await expect(popover).toContainText('No fleet slots available')
  await expect(popover.getByRole('button', { name: 'Send', exact: true })).toBeDisabled()
  await expect(popover.getByRole('button', { name: 'Dismiss popover', exact: true })).toBeFocused()
  const box = (await popover.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(12)
  expect(box.y).toBeGreaterThanOrEqual(12)
  expect(box.x + box.width).toBeLessThanOrEqual(788)
  expect(box.y + box.height).toBeLessThanOrEqual(538)
  await popover.getByRole('button', { name: 'Dismiss popover', exact: true }).click()
  await expect(popover).not.toBeVisible()
})

test('desktop Harvest sends the edited quantity with Enter through the shared launch path', async ({ page }) => {
  await setupHarvest(page)
  await page.setViewportSize({ width: 1280, height: 900 })
  let launches = 0
  await page.route('**/world', async route => {
    const request = route.request().postDataJSON()
    if (request.type !== 'FleetQuote') return route.fallback()
    expect(request.intent.ships).toEqual([{ owner: binding.player, ship_type: 'Recycler', count: '2' }])
    await route.fulfill({ json: { protocol: 4, binding, request_id: request.context.request_id, viewer_revision: '1', sampled_at: Date.now(), as_of_ms: Date.now(), data: harvestTerms(request.intent) } })
  })
  await page.route('**/commands', async route => {
    const { gameplay } = route.request().postDataJSON()
    if (gameplay.command.action?.type !== 'LaunchFleet') return route.fallback()
    launches++
    await route.fulfill({ json: { protocol: 4, binding, command_id: gameplay.command_id, admitted_at: Date.now(), executed_at: Date.now(), status: 'Committed', result_ids: [id(90)], minimum_viewer_revision: '2' } })
  })
  const popover = await openHarvest(page)
  const input = popover.getByRole('textbox', { name: 'Recyclers', exact: true })
  await input.fill('2')
  await input.press('Enter')
  await expect(popover).not.toBeVisible()
  expect(launches).toBe(1)
  await expect(page).toHaveURL(/\/galaxy$/)
  await expect(page.getByText('Fleet slots: 1 used / 3 total')).toBeVisible()
})
