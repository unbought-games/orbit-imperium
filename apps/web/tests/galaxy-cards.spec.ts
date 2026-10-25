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
) {
  let revision = 1
  await installGameFixture(page, {
    protocol: 4,
    viewerRevision: () => String(revision),
    extraCapabilities: ['Attack', 'Espionage', 'Harvest'],
    bodies: [{ ...body, inventories: [...body.inventories, { item: { kind: 'Ship', id: 'EspionageProbe' }, count: '2' }] }],
    ...options,
  })
  let fail = false
  await page.route('**/world', async (route) => {
    const { context, galaxy, system } = route.request().postDataJSON()
    if (fail)
      return route.fulfill({ status: 503, json: { code: 'Unavailable' } })
    await route.fulfill({
      json: {
        protocol: 4,
        binding,
        request_id: context.request_id,
        viewer_revision: String(revision),
        sampled_at: Date.now(),
        as_of_ms: Date.now(),
        data: {
          galaxy,
          system,
          observed_at: Date.now(),
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

test('beginner protection is visible on collapsed cards and blocks both hostile missions until refreshed eligibility changes', async ({
  page,
}) => {
  const fixture = await setup(page)
  const cards = page
    .getByRole('region', { name: 'Galaxy positions' })
    .getByRole('listitem')
  const protectedCard = cards.nth(2)
  const badge = protectedCard.getByText('Beginner protection', { exact: true })
  const explanation = protectedCard.getByText(
    'Beginner protection blocks attacks and espionage between you and this player because of the difference in empire strength.',
    { exact: true },
  )
  await expect(badge).toBeVisible()
  await expect(explanation).toBeVisible()
  await expect(protectedCard.locator('details')).not.toHaveAttribute('open', '')
  await expect(
    cards.nth(0).getByText('Beginner protection', { exact: true }),
  ).toHaveCount(0)
  await expect(
    cards.nth(1).getByText('Beginner protection', { exact: true }),
  ).toHaveCount(0)
  expect(
    await protectedCard
      .locator('details')
      .evaluate((el) => getComputedStyle(el).borderLeftWidth),
  ).toBe('3px')
  const protectedColor = await protectedCard
    .getByText('Player 00000000', { exact: true })
    .evaluate((el) => getComputedStyle(el).color)
  const normalColor = await cards
    .nth(1)
    .getByText('CommanderAndromedaTheUnreasonablyLongName', { exact: true })
    .evaluate((el) => getComputedStyle(el).color)
  expect(protectedColor).not.toBe(normalColor)

  await protectedCard.locator('summary').click()
  for (const mission of ['Attack', 'Espionage']) {
    const action = protectedCard.getByRole('button', {
      name: mission,
      exact: true,
    })
    await expect(action).toBeDisabled()
    await expect(action).toHaveAttribute('title', await explanation.innerText())
  }
  await expect(
    protectedCard.getByRole('button', { name: 'Transport', exact: true }),
  ).toBeEnabled()

  fixture.clearProtection()
  await refreshGame(page)
  await expect(badge).toHaveCount(0)
  await expect(explanation).toHaveCount(0)
  await expect(protectedCard.locator('details')).toHaveAttribute('open', '')
  await expect(
    protectedCard.getByRole('button', { name: 'Attack', exact: true }),
  ).toBeEnabled()
  await expect(
    protectedCard.getByRole('button', { name: 'Espionage', exact: true }),
  ).toBeEnabled()
})

test('other target blockers disable attack with their own reason without a beginner protection badge', async ({
  page,
}) => {
  await setup(page, 'TargetVacation')
  const card = page
    .getByRole('region', { name: 'Galaxy positions' })
    .getByRole('listitem')
    .nth(2)
  await expect(
    card.getByText('Beginner protection', { exact: true }),
  ).toHaveCount(0)
  await card.locator('summary').click()
  const attack = card.getByRole('button', { name: 'Attack', exact: true })
  await expect(attack).toBeDisabled()
  await expect(attack).toHaveAttribute(
    'title',
    'This player is in vacation mode. Choose another target or try again after they return.',
  )
})

test('galaxy cards preserve system navigation, eligibility, debris and mission drafts', async ({
  page,
}) => {
  const fixture = await setup(page)
  const positions = page.getByRole('region', { name: 'Galaxy positions' })
  const cards = positions.getByRole('listitem')
  await expect(cards).toHaveCount(15)
  await expect(positions.getByRole('table')).toHaveCount(0)
  await expect(page.getByLabel('Solar system')).toHaveValue('371')
  await expect(cards.nth(0)).toContainText('Your planet')
  await expect(cards.nth(0)).toContainText('You')
  await expect(cards.nth(1)).toContainText(
    'CommanderAndromedaTheUnreasonablyLongName',
  )
  await expect(cards.nth(2)).toContainText('Player 00000000')
  await expect(cards.nth(0).locator('summary')).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Transport', exact: true }),
  ).toHaveCount(0)
  await cards.nth(1).locator('summary').click()
  await expect(
    cards.nth(1).getByRole('button', { name: 'Espionage', exact: true }),
  ).toBeEnabled()
  await cards.nth(2).locator('summary').click()
  await expect(
    cards.nth(1).getByRole('button', { name: 'Transport', exact: true }),
  ).toHaveCount(0)
  await expect(
    cards.nth(2).getByRole('button', { name: 'Espionage', exact: true }),
  ).toBeDisabled()
  for (const index of [1, 3]) {
    await expect(cards.nth(index).getByTitle('Metal', { exact: true })).toHaveText(
      '900',
    )
    await expect(cards.nth(index).getByTitle('Crystal', { exact: true })).toHaveText(
      '1,500',
    )
  }
  await cards.nth(3).locator('summary').click()
  await cards
    .nth(3)
    .getByRole('button', { name: 'Harvest', exact: true })
    .click()
  await expect(page.locator('main h1')).toHaveText('Dispatch')
  await expect(
    page.getByRole('combobox', { name: 'Mission', exact: true }),
  ).toHaveValue('Harvest')
  await expect(page.getByLabel('Destination coordinates', { exact: true })).toHaveValue(coordinatePattern('position', '4'))
  await page.goto(`/u/andromeda/b/${body.id}/galaxy`)
  await expect(cards).toHaveCount(15)
  await page.getByLabel('Solar system').selectOption('499')
  await expect(cards.first()).toContainText('[1:499:1]')
  await expect(page.getByRole('button', { name: 'Next system' })).toBeDisabled()
  fixture.setFailure(true)
  await page.getByLabel('Solar system').selectOption('498')
  await expect(page.getByRole('alert')).toContainText('Galaxy unavailable')
  await expect(cards).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Transport', exact: true }),
  ).toHaveCount(0)
  fixture.setFailure(false)
  await page.getByRole('button', { name: 'Retry loading galaxy' }).click()
  await expect(page.getByRole('button', { name: 'Retry loading galaxy' })).toHaveCount(0)
  await expect(cards).toHaveCount(15)
})

for (const mission of ['Transport', 'Attack']) {
  test(`planet card opens dispatch with ${mission} and the selected destination`, async ({
    page,
  }) => {
    await setup(page)
    const card = page
      .getByRole('region', { name: 'Galaxy positions' })
      .getByRole('listitem')
      .nth(1)
    await card.locator('summary').click()
    await card.getByRole('button', { name: mission, exact: true }).click()
    await expect(page.locator('main h1')).toHaveText('Dispatch')
    await expect(
      page.getByRole('combobox', { name: 'Mission', exact: true }),
    ).toHaveValue(mission)
    await expect(page.getByLabel('Destination coordinates', { exact: true })).toHaveValue(coordinatePattern('system', '371'))
    await expect(page.getByLabel('Destination coordinates', { exact: true })).toHaveValue(coordinatePattern('position', '2'))
  })
}

test('galaxy cards use page scrolling and keep debris beside planets at every width', async ({
  page,
}) => {
  await setup(page)
  const positions = page.getByRole('region', { name: 'Galaxy positions' })
  const cards = positions.getByRole('listitem')
  await cards.nth(1).locator('summary').click()
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(cards).toHaveCount(15)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    expect(
      await positions.evaluate((el) => ({
        vertical: el.scrollHeight <= el.clientHeight,
        horizontal: el.scrollWidth <= el.clientWidth,
        overflow: getComputedStyle(el).overflow,
      })),
    ).toEqual({ vertical: true, horizontal: true, overflow: 'visible' })
    const planet = await cards
      .nth(1)
      .getByText('Planet', { exact: true })
      .boundingBox()
    const player = await cards
      .nth(1)
      .getByText('CommanderAndromedaTheUnreasonablyLongName', { exact: true })
      .boundingBox()
    const debris = await cards
      .nth(1)
      .getByText('Debris field', { exact: true })
      .boundingBox()
    expect(player!.y).toBeGreaterThan(planet!.y)
    expect(debris!.x).toBeGreaterThan(planet!.x + planet!.width)
    await cards.last().scrollIntoViewIfNeeded()
    expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0)
    await diagnosticScreenshot(page, {
      path: `test-results/galaxy-cards-${width}.png`,
      fullPage: true,
    })
  }
})

test('planet actions support keyboard opening and Escape focus restoration', async ({
  page,
}) => {
  await setup(page)
  const card = page
    .getByRole('region', { name: 'Galaxy positions' })
    .getByRole('listitem')
    .nth(1)
  const trigger = card.locator('summary')
  await trigger.focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  await expect(card.getByRole('link', { name: /View .*in galaxy/ })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(card.getByRole('button', { name: /Copy coordinates/ })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(card.getByRole('button', { name: /Location actions for/ })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(
    card.getByRole('button', { name: 'Transport', exact: true }),
  ).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  await expect(
    card.getByRole('button', { name: 'Transport', exact: true }),
  ).toHaveCount(0)
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
  await galaxy.locator('summary').first().click()
  await galaxy.getByRole('button', { name: 'Transport', exact: true }).click()
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
  ])
  await page.reload()
  const cards = page
    .getByRole('region', { name: 'Galaxy positions' })
    .getByRole('listitem')
  await expect(
    cards.first().getByText('StellarNomad', { exact: true }),
  ).toBeVisible()
  await expect(
    cards.first().getByRole('img', { name: 'Supporter · $25 / month USD' }),
  ).toBeVisible()
  await expect(
    cards
      .nth(1)
      .getByText('CommanderAndromedaTheUnreasonablyLongName', { exact: true }),
  ).toBeVisible()
  await expect(
    cards.nth(1).getByRole('img', { name: /Supporter/ }),
  ).toHaveCount(0)
  await diagnosticScreenshot(page, {
    path: 'test-results/supporter-live-galaxy.png',
    fullPage: true,
  })
})

for (const width of [320, 390, 1280]) {
  test(`galaxy controls stay compact with touch-sized targets at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await setup(page)
    const toolbar = page.getByRole('group', { name: 'Galaxy controls' })
    await expect(toolbar).toBeVisible()
    await expect(page.getByText(/Browsing is free|Activity can be caused by fleets|fleet slots|System map/)).toHaveCount(0)
    await expect(page.getByRole('navigation', { name: 'System atlas' })).toHaveCount(0)
    const positions = page.getByRole('region', { name: 'Galaxy positions' })
    await expect(positions.getByRole('listitem')).toHaveCount(15)
    const toolbarBox = (await toolbar.boundingBox())!
    expect((await positions.boundingBox())!.y - toolbarBox.y - toolbarBox.height).toBeLessThanOrEqual(1)
    const controls = [
      toolbar.getByRole('combobox', { name: 'Galaxy', exact: true }),
      toolbar.getByRole('button', { name: 'Previous system' }),
      toolbar.getByRole('combobox', { name: 'Solar system' }),
      toolbar.getByRole('button', { name: 'Next system' }),
    ]
    const boxes = []
    for (const control of controls) {
      await expect(control).toBeVisible()
      const box = (await control.boundingBox())!
      expect(box.height).toBeGreaterThanOrEqual(44)
      expect(box.width).toBeGreaterThanOrEqual(44)
      boxes.push(box)
    }
    expect(Math.max(...boxes.map(box => box.y)) - Math.min(...boxes.map(box => box.y))).toBeLessThanOrEqual(1)
    expect((await toolbar.boundingBox())!.height).toBeLessThanOrEqual(80)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    await controls[3].click()
    await expect(controls[2]).toHaveValue('372')
    await controls[1].click()
    await expect(controls[2]).toHaveValue('371')
    await expect(page.getByRole('button', { name: /Refresh galaxy|Retry loading galaxy/ })).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Galaxy positions' }).getByRole('listitem')).toHaveCount(15)
    await diagnosticScreenshot(page, { path: `test-results/galaxy-compact-controls-${width}.png` })
  })
}


test('galaxy rows keep coordinates first, inline player facts, inset art and pinned controls across resizing', async ({ page }) => {
  await setup(page)
  const controls = page.getByRole('group', { name: 'Galaxy controls' })
  const nav = page.getByRole('navigation', { name: 'Fleet navigation' })
  const rows = page.getByRole('region', { name: 'Galaxy positions' }).getByRole('listitem')
  const owned = rows.first()
  await expect(owned).toContainText('[1:371:1] Your planet')
  await expect(page.getByText(/Observed |No system observation available/)).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Enter a destination manually' })).toHaveCount(0)
  for (const width of [1280, 390, 320, 768, 1440]) {
    await page.setViewportSize({ width, height: 640 })
    await page.evaluate(() => window.scrollTo(0, 0))
    const player = owned.getByText('You', { exact: true })
    const status = owned.getByText('Active', { exact: true })
    const activity = owned.getByTitle('Activity within the last 15 minutes')
    const positions = await Promise.all([player, status, activity].map(locator => locator.boundingBox()))
    expect(Math.max(...positions.map(box => box!.y)) - Math.min(...positions.map(box => box!.y))).toBeLessThanOrEqual(4)
    const empty = rows.nth(4).locator('summary')
    expect((await empty.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    expect((await empty.boundingBox())!.height).toBeLessThanOrEqual(46)
    const summary = rows.nth(1).locator('summary')
    await summary.hover()
    const art = await summary.locator('img').evaluate(image => {
      const box = image.getBoundingClientRect()
      const style = getComputedStyle(image)
      return { x: box.x, y: box.y, right: box.right, bottom: box.bottom, ring: parseFloat(style.outlineOffset) + parseFloat(style.outlineWidth) }
    })
    const hover = (await summary.boundingBox())!
    expect(art.x - art.ring).toBeGreaterThanOrEqual(hover.x)
    expect(art.y - art.ring).toBeGreaterThanOrEqual(hover.y)
    expect(art.right + art.ring).toBeLessThanOrEqual(hover.x + hover.width)
    expect(art.bottom + art.ring).toBeLessThanOrEqual(hover.y + hover.height)
    await page.evaluate(() => window.scrollTo(0, 400))
    await expect.poll(async () => {
      const tabs = (await nav.boundingBox())!
      const bar = (await controls.boundingBox())!
      return Math.abs(bar.y - tabs.y - tabs.height - (width >= 768 ? 1 : 0))
    }).toBeLessThanOrEqual(1)
    await expect(controls).toBeInViewport({ ratio: 1 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    await diagnosticScreenshot(page, { path: `test-results/galaxy-pinned-${width}.png` })
  }
})

test('empty slots reveal an explicit Colonize action before opening a draft', async ({ page }) => {
  await setup(page)
  const slot = page.getByRole('region', { name: 'Galaxy positions' }).getByRole('listitem').nth(4)
  const summary = slot.locator('summary')
  await summary.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/galaxy`)
  const colonize = slot.getByRole('button', { name: 'Colonize', exact: true })
  await expect(colonize).toBeVisible()
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 })
    const height = (await colonize.boundingBox())!.height
    expect(height).toBeGreaterThanOrEqual(44)
    expect(height).toBeLessThanOrEqual(45)
    const actions = slot.getByRole('group', { name: 'Missions to [1:371:5]' })
    const actionBox = (await actions.boundingBox())!
    const contentBottom = await actions.evaluate(element => Math.max(...Array.from(element.children, child => child.getBoundingClientRect().bottom)))
    expect(actionBox.y + actionBox.height - contentBottom).toBeLessThanOrEqual(8)
    if (width === 1280) expect(actionBox.height).toBeLessThanOrEqual(53)
  }
  await page.keyboard.press('Tab')
  await expect(slot.getByRole('link', { name: /View .*in galaxy/ })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(slot.getByRole('button', { name: /Copy coordinates/ })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(slot.getByRole('button', { name: /Location actions for/ })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(colonize).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(summary).toBeFocused()
  await expect(colonize).toBeHidden()
  await summary.click()
  await colonize.click()
  await expect(page.getByRole('combobox', { name: 'Mission', exact: true })).toHaveValue('Colonize')
  await expect(page.getByLabel('Destination coordinates', { exact: true })).toHaveValue(coordinatePattern('galaxy', '1'))
  await expect(page.getByLabel('Destination coordinates', { exact: true })).toHaveValue(coordinatePattern('system', '371'))
  await expect(page.getByLabel('Destination coordinates', { exact: true })).toHaveValue(coordinatePattern('position', '5'))
  await expect(page.getByRole('status').filter({ hasText: 'Colonization is unavailable in this universe.' }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Review fleet', exact: true })).toBeDisabled()
})

test('one-click espionage stays in Galaxy, reserves one departure and tracks the outbound and return legs', async ({ page }) => {
  let revision = 1
  const missions: components['schemas']['MissionView4'] = { fleets: [], incoming: [], score_value_micro: '0', fleet_slots: '3' }
  await setup(page, null, { missions, viewerRevision: () => String(revision) })
  let quotes = 0, launches = 0
  let releaseQuote!: () => void, releaseLaunch!: () => void
  const quoteGate = new Promise<void>(resolve => { releaseQuote = resolve })
  const launchGate = new Promise<void>(resolve => { releaseLaunch = resolve })
  const intents: components['schemas']['FleetIntent4'][] = []
  await page.route('**/world', async route => {
    const request = route.request().postDataJSON()
    if (request.type !== 'FleetQuote') return route.fallback()
    quotes++
    intents.push(request.intent)
    await quoteGate
    await route.fulfill({ json: { protocol: 4, binding, request_id: request.context.request_id, viewer_revision: String(revision), sampled_at: Date.now(), as_of_ms: Date.now(), data: {
      intent: request.intent, profile_hash: 'a'.repeat(64), terms_hash: 'b'.repeat(64), distance: 1000, speeds: [['EspionageProbe', '100000000']], duration_ms: 120000, fuel: '1000000', capacity: '5000000', maximum_payload: '4000000', slot_limit: '3',
    } } })
  })
  await page.route('**/commands', async route => {
    launches++
    const { gameplay, presence } = route.request().postDataJSON()
    expect(presence.command.action.paired_command_id).toBe(gameplay.command_id)
    expect(gameplay.command.action.intent).toEqual(intents[0])
    await launchGate
    missions.fleets.push({ id: id(80), intent: intents[0], origin: body.coordinates, destination: { galaxy: 1, system: 371, position: 2 }, leg: 'Outbound', ships: [{ ship_type: 'EspionageProbe', count: '1' }], cargo: { metal: '0', crystal: '0', deuterium: '0' }, due_at: Date.now() + 120000, launched_at: Date.now(), duration_ms: 120000, paid_fuel: '1000000', can_recall: true })
    revision++
    await route.fulfill({ json: { protocol: 4, binding, command_id: gameplay.command_id, admitted_at: Date.now(), executed_at: Date.now(), status: 'Committed', result_ids: [id(80)], minimum_viewer_revision: String(revision) } })
  })
  const rows = page.getByRole('region', { name: 'Galaxy positions' }).getByRole('listitem')
  const target = rows.nth(1)
  await target.locator('summary').click()
  const originalRows = await rows.elementHandles()
  const pendingRefreshes: (() => void)[] = []
  await page.route('**/world', async route => {
    if (route.request().postDataJSON().type !== 'Galaxy') return route.fallback()
    await new Promise<void>(resolve => { pendingRefreshes.push(resolve) })
    await route.fallback()
  })
  const finishRefresh = async (count: number) => {
    await expect.poll(() => pendingRefreshes.length).toBe(count)
    await expect(rows).toHaveCount(15)
    await expect(page.getByText('Loading system…', { exact: true })).toHaveCount(0)
    await expect(target.locator('details')).toHaveAttribute('open', '')
    for (const row of originalRows) expect(await row.evaluate(node => node.isConnected)).toBe(true)
    const response = page.waitForResponse(response => response.url().endsWith('/world') && response.request().postDataJSON().type === 'Galaxy')
    pendingRefreshes[count - 1]()
    await response
    await expect(target.locator('details')).toHaveAttribute('open', '')
  }
  const spy = target.getByRole('button', { name: 'Espionage', exact: true })
  await spy.evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click() })
  await expect.poll(() => quotes).toBe(1)
  await expect(target.getByRole('button', { name: 'Sending probe…' })).toBeDisabled()
  releaseQuote()
  await expect.poll(() => launches).toBe(1)
  await expect(target.getByRole('status')).toContainText('Espionage departure pending')
  expect(intents[0]).toEqual({ origin: body.id, destination: { type: 'Body', id: id(21), expected_owner: id(31), expected_kind: 'Planet' }, mission: 'Espionage', ships: [{ owner: binding.player, ship_type: 'EspionageProbe', count: '1' }], cargo: { metal: '0', crystal: '0', deuterium: '0' }, speed_percent: 100 })
  releaseLaunch()
  await finishRefresh(1)
  await expect(target.getByRole('status')).toHaveText(/Espionage en route · \d/)
  await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/galaxy`)
  await expect(page.getByRole('region', { name: 'Fleet quote' })).toHaveCount(0)
  await diagnosticScreenshot(page, { path: 'test-results/galaxy-espionage-outbound.png' })
  await target.locator('summary').focus()
  const scrollY = await page.evaluate(() => window.scrollY)
  missions.fleets[0].leg = 'Returning'; revision++
  await refreshGame(page)
  await finishRefresh(2)
  await expect(target.locator('summary')).toBeFocused()
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY)
  await expect(target.getByRole('status')).toHaveCount(0)
  await expect(rows.first().getByRole('status')).toHaveText(/Espionage returning · \d/)
  missions.fleets = []; revision++
  await refreshGame(page)
  await finishRefresh(3)
  await expect(target.locator('summary')).toBeFocused()
  await expect(rows.first().getByRole('status')).toHaveCount(0)
  expect(quotes).toBe(1)
  expect(launches).toBe(1)
})

test('galaxy espionage explains quote failures inline without navigating or launching', async ({ page }) => {
  await setup(page)
  await page.route('**/world', async route => {
    if (route.request().postDataJSON().type !== 'FleetQuote') return route.fallback()
    await route.fulfill({ status: 409, json: { code: 'InsufficientResources' } })
  })
  const target = page.getByRole('region', { name: 'Galaxy positions' }).getByRole('listitem').nth(1)
  await target.locator('summary').click()
  await target.getByRole('button', { name: 'Espionage', exact: true }).click()
  await expect(target.getByRole('alert')).toContainText('not enough resources')
  await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/galaxy`)
  await expect(target.getByRole('button', { name: 'Espionage', exact: true })).toBeEnabled()
})

test('galaxy espionage is unavailable without a stationed probe', async ({ page }) => {
  await setup(page, null, { bodies: [body] })
  const target = page.getByRole('region', { name: 'Galaxy positions' }).getByRole('listitem').nth(1)
  await target.locator('summary').click()
  const spy = target.getByRole('button', { name: 'Espionage', exact: true })
  await expect(spy).toBeDisabled()
  await expect(spy).toHaveAttribute('title', 'No espionage probes available on the selected planet.')
  await expect(target.getByRole('status')).toHaveText('No espionage probes available on the selected planet.')
})

test('galaxy probe countdown ticks without reloading rows or fetching the system', async ({ page }) => {
  const now = Date.now()
  await page.clock.install({ time: now - 1000 })
  await page.clock.pauseAt(now)
  const missions: components['schemas']['MissionView4'] = {
    incoming: [], score_value_micro: '0', fleet_slots: '3',
    fleets: [{
      id: id(80),
      intent: { origin: body.id, destination: { type: 'Body', id: id(21), expected_owner: id(31), expected_kind: 'Planet' }, mission: 'Espionage', ships: [{ owner: binding.player, ship_type: 'EspionageProbe', count: '1' }], cargo: { metal: '0', crystal: '0', deuterium: '0' }, speed_percent: 100 },
      origin: body.coordinates, destination: { galaxy: 1, system: 371, position: 2 },
      leg: 'Outbound', ships: [{ ship_type: 'EspionageProbe', count: '1' }],
      cargo: { metal: '0', crystal: '0', deuterium: '0' },
      due_at: now + 120000, launched_at: now, duration_ms: 120000, paid_fuel: '1000000', can_recall: true,
    }],
  }
  await setup(page, null, { missions, sampledAt: now })
  const target = page.getByRole('region', { name: 'Galaxy positions' }).getByRole('listitem').nth(1)
  await expect(target.getByRole('status')).toHaveText('Espionage en route · 2m 0s')
  await target.locator('summary').click()
  const row = await target.elementHandle()
  let requests = 0
  page.on('request', request => {
    if (request.url().endsWith('/world') && request.postDataJSON().type === 'Galaxy') requests++
  })
  await page.clock.fastForward(5000)
  await expect(target.getByRole('status')).toHaveText('Espionage en route · 1m 55s')
  expect(await row!.evaluate(node => node.isConnected)).toBe(true)
  await expect(target.locator('details')).toHaveAttribute('open', '')
  await expect(page.getByText('Loading system…', { exact: true })).toHaveCount(0)
  expect(requests).toBe(0)
})
