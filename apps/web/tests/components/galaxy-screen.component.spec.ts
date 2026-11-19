import type { components as Contract } from '../../src/contracts'
import { test, expect, type Page } from './fixture'
import type {} from './galaxy-screen.scenario'
import { id, player, now } from './dispatch-data'

type Input = NonNullable<Window['galaxyInput']>
async function open(page: Page, input: Input = {}) {
  await page.addInitScript((prepared) => {
    window.galaxyInput = prepared
  }, input)
  await page.goto('/?scenario=galaxy-screen')
  await expect(page.locator('html')).toHaveAttribute(
    'data-component-ready',
    'galaxy-screen',
  )
}
test.afterEach(async ({ page }) => {
  const unexpected = await page.evaluate(
    () => window.galaxyScene?.snapshot().unexpected ?? [],
  )
  expect(unexpected, 'unexpected Galaxy feature port operations').toEqual([])
})
const row = (page: Page, index = 0) =>
  page
    .getByRole('region', { name: 'Galaxy positions' })
    .getByRole('article')
    .nth(index)
const spy = (page: Page) =>
  row(page).getByRole('button', { name: /^(Spy on|Probe requested for)/ })
const baseBody = {
  id: id(20),
  owner: id(30),
  kind: 'Planet' as const,
  activity: { type: 'Recent' as const },
  inactivity: 'Active' as const,
  vacation: false,
  espionage_eligible: true,
}

test('viewed Galaxy badges and open action menus follow newly delivered protection', async ({
  page,
}) => {
  await open(page, {
    positions: {
      1: {
        body: {
          ...baseBody,
          attack_blocker: 'BeginnerProtected',
          espionage_eligible: false,
        },
      },
    },
  })
  const badge = row(page).getByRole('button', { name: 'Beginner protection' })
  await expect(row(page).getByText('Stargazer', { exact: true })).toHaveCSS(
    'color',
    'rgb(164, 232, 200)',
  )
  await expect(row(page)).toHaveCSS('border-left-width', '0px')
  await badge.focus()
  const tooltip = page.getByRole('tooltip')
  await expect(tooltip).toContainText(
    'blocks attacks and espionage between you and this player',
  )
  await expect(badge).toHaveAttribute(
    'aria-describedby',
    (await tooltip.getAttribute('id'))!,
  )
  await badge.press('Escape')
  await expect(tooltip).toBeHidden()
  await expect(spy(page)).toBeDisabled()
  await row(page)
    .getByRole('button', { name: /^Actions for \[/ })
    .press('Enter')
  const attack = page.getByRole('menuitem', { name: 'Attack', exact: true })
  await expect(attack).toBeDisabled()
  await expect(
    page.getByRole('menuitem', { name: 'Transport', exact: true }),
  ).toBeEnabled()
  await page.evaluate(async () => {
    const body = window.galaxyInput!.positions![1].body!
    body.attack_blocker = null
    body.espionage_eligible = true
    await window.galaxyScene.configure({ view: {} })
  })
  await expect(badge).toHaveCount(0)
  await expect(attack).toBeEnabled()
  await expect(spy(page)).toBeEnabled()
})

test('current alliance membership changes the marker on the same mounted Galaxy row', async ({
  page,
}) => {
  await page.clock.setFixedTime(now)
  const alliance = {
    id: id(60),
    universe: id(3),
    name: 'Star League',
    tag: 'STAR',
  }
  const stamp = { observed_at: now / 1000, expires_at: now / 1000 + 600 }
  await open(page, {
    profiles: [
      { player, username: 'You', alliance, ...stamp },
      { player: id(30), username: 'Alliance mate', alliance, ...stamp },
    ],
  })
  const badge = row(page).getByRole('button', {
    name: 'Your alliance',
    exact: true,
  })
  await expect(badge).toHaveText('Your alliance')
  await expect(row(page)).toHaveCSS(
    'box-shadow',
    'rgb(124, 185, 240) 3px 0px 0px 0px inset',
  )
  await expect(row(page).getByText('[STAR]', { exact: true })).toBeVisible()
  await badge.click()
  await expect(page.getByRole('tooltip')).toContainText(
    'member of Star League [STAR], like you',
  )
  await page.keyboard.press('Escape')
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 })
    expect(
      await row(page).evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true)
  }
  await page.evaluate(() => {
    delete window.galaxyInput!.profiles![1].alliance
    window.dispatchEvent(new Event('pageshow'))
  })
  await expect(badge).toHaveCount(0)
  await expect(row(page)).toHaveCSS('box-shadow', 'none')
  await page.evaluate((alliance) => {
    window.galaxyInput!.profiles![1].alliance = alliance
    window.dispatchEvent(new Event('pageshow'))
  }, alliance)
  await expect(badge).toBeVisible()
  await page.evaluate(() => {
    delete window.galaxyInput!.profiles![0].alliance
    window.dispatchEvent(new Event('pageshow'))
  })
  await expect(badge).toHaveCount(0)
})

test('vacation and inactivity retain separate native explanations and restrict the row menu', async ({
  page,
}) => {
  await open(page, {
    positions: {
      1: {
        body: {
          ...baseBody,
          vacation: true,
          inactivity: 'Inactive28',
          attack_blocker: 'TargetVacation',
          espionage_eligible: false,
        },
      },
      2: {
        body: {
          ...baseBody,
          id: id(21),
          owner: id(32),
          inactivity: 'Inactive7',
          activity: { type: 'Minutes', minutes: 28 },
        },
      },
    },
  })
  const inactive = row(page).getByRole('button', {
    name: 'Inactive for 28 days or more',
  })
  const vacation = row(page).getByRole('button', { name: 'Vacation mode' })
  const tooltip = page.getByRole('tooltip')
  await expect(row(page).getByText('Stargazer', { exact: true })).toHaveCSS(
    'color',
    'rgb(198, 184, 237)',
  )
  await expect(
    row(page, 1).getByText('Player 00000000', { exact: true }),
  ).toHaveCSS('color', 'rgb(160, 166, 173)')
  await inactive.hover()
  await expect(tooltip).toContainText('Inactive for 28 days')
  await inactive.press('Escape')
  await expect(tooltip).toHaveCount(0)
  await vacation.focus()
  await expect(tooltip).toContainText('Vacation mode')
  await vacation.press('Escape')
  await vacation.blur()
  await page.mouse.move(0, 0)
  await vacation.click()
  await expect(tooltip).toContainText('Attacks and espionage')
  await page.getByRole('textbox', { name: 'Galaxy', exact: true }).click()
  await expect(tooltip).toBeHidden()
  await row(page)
    .getByRole('button', { name: 'Activity within the last 15 minutes' })
    .click()
  await expect(tooltip).toContainText(
    'does not necessarily mean the player is online',
  )
  await page.keyboard.press('Escape')
  await expect(spy(page)).toBeDisabled()
  await row(page)
    .getByRole('button', { name: /^Actions for \[/ })
    .press('Enter')
  for (const name of ['Attack', 'Transport'])
    await expect(
      page.getByRole('menuitem', { name, exact: true }),
    ).toBeDisabled()
  await expect(
    page.getByRole('menuitem', { name: 'Harvest', exact: true }),
  ).toBeEnabled()
  await expect(page.getByRole('menu')).toContainText('vacation mode')
})

test.describe('touch Galaxy statuses', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } })
  test('each simultaneous status opens by tap and an outside tap dismisses it', async ({
    page,
  }) => {
    await open(page, {
      positions: {
        1: {
          body: {
            ...baseBody,
            vacation: true,
            inactivity: 'Inactive7',
            attack_blocker: 'TargetVacation',
          },
        },
      },
    })
    for (const [name, description] of [
      ['Vacation mode', 'Vacation mode'],
      [
        'Inactive for 7 days or more',
        'Visiting fleets can still cause activity',
      ],
    ]) {
      await row(page).getByRole('button', { name, exact: true }).tap()
      await expect(page.getByRole('tooltip')).toContainText(description)
      await page.getByRole('textbox', { name: 'Galaxy', exact: true }).tap()
      await expect(page.getByRole('tooltip')).toBeHidden()
    }
  })
})

for (const width of [390, 1280]) {
  test(`the coordinate menu hands focus to quick harvest and restores its own opener at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 })
    await open(page)
    const trigger = row(page).getByRole('link', {
      name: 'View [1:371:1] in galaxy',
      exact: true,
    })
    await trigger.click({ button: 'right' })
    await page
      .getByRole('menuitem', { name: 'Prepare harvest', exact: true })
      .click()
    const dialog = page.getByRole('dialog', {
      name: 'Harvest mission',
      exact: true,
    })
    await expect(
      dialog.getByRole('textbox', { name: 'Recyclers', exact: true }),
    ).toHaveValue('3')
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(trigger).toBeFocused()
  })
}

test('changing systems drops stale rows, fences the delayed read and retries the current missing system', async ({
  page,
}) => {
  await open(page, { holdSystem: 24 })
  await expect(row(page)).toContainText('[1:371:1]')
  const field = page.getByRole('textbox', { name: 'Solar system' })
  await field.fill('24')
  await field.press('Enter')
  await expect
    .poll(() => page.evaluate(() => !!window.releaseGalaxyRead))
    .toBe(true)
  try {
    await expect(
      page.getByRole('region', { name: 'Galaxy positions' }),
    ).toHaveCount(0)
    await page.evaluate(() => {
      window.galaxyInput!.failRead = true
    })
    await field.fill('25')
    await field.press('Enter')
    await expect(page.getByRole('alert')).toContainText('Galaxy unavailable')
    await expect(
      page.getByRole('region', { name: 'Galaxy positions' }),
    ).toHaveCount(0)
    await page.evaluate(() => {
      window.galaxyInput!.failRead = false
    })
    await page.getByRole('button', { name: 'Retry loading galaxy' }).click()
    await expect(row(page)).toContainText('[1:25:1]')
    await field.focus()
    await expect(field).toBeFocused()
  } finally {
    await page.evaluate(async () => {
      window.releaseGalaxyRead?.()
      await window.galaxyScene.release()
    })
  }
  await expect(row(page)).toContainText('[1:25:1]')
  await expect(field).toBeFocused()
  await expect(
    page.getByRole('region', { name: 'Galaxy positions' }),
  ).not.toContainText('[1:24:1]')
})

test('the real planet Actions menu prepares Attack and Transport at the chosen planet', async ({
  page,
}) => {
  await open(page)
  for (const mission of ['Transport', 'Attack']) {
    await row(page)
      .getByRole('button', { name: /^Actions for \[/ })
      .press('Enter')
    await page.getByRole('menuitem', { name: mission, exact: true }).click()
    const draft = page.getByLabel('Prepared fleet')
    await expect(draft).toContainText(`"mission":"${mission}"`)
    expect(JSON.parse(await draft.innerText())).toMatchObject({
      coordinates: { galaxy: 1, system: 371, position: 1 },
      mission,
    })
    expect(
      await page.evaluate(() => window.galaxyScene.snapshot().launches),
    ).toBe(0)
  }
})

test('Spy keeps one request and a fixed target while its pending quote outlives visual feedback', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.clock.install({ time: now - 1000 })
  await page.clock.pauseAt(now)
  await open(page, { positions: { 1: { body: baseBody } } })
  await expect(spy(page)).toBeEnabled()
  await page.evaluate(async () => {
    await window.galaxyScene.configure({
      options: { quoteError: 'InsufficientResources' },
    })
    window.galaxyScene.hold('FleetQuote')
  })
  const before = (await spy(page).boundingBox())!
  try {
    await spy(page).click()
    await expect(spy(page)).toHaveAccessibleName(
      'Probe requested for [1:371:1]',
    )
    const during = (await spy(page).boundingBox())!
    expect([during.width, during.height]).toEqual([before.width, before.height])
    await spy(page).evaluate((el) => (el as HTMLButtonElement).click())
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.galaxyScene
              .snapshot()
              .calls.filter((q) => q.type === 'FleetQuote').length,
        ),
      )
      .toBe(1)
    await page.clock.fastForward(1400)
    await expect(spy(page)).toHaveAttribute('data-feedback', 'false')
    await expect(spy(page)).toBeDisabled()
    const after = (await spy(page).boundingBox())!
    expect([after.width, after.height]).toEqual([before.width, before.height])
  } finally {
    await page.evaluate(() => window.galaxyScene.release())
  }
  await expect(
    page.getByTestId('game-error-banner').getByRole('alert'),
  ).toContainText('not enough resources')
  await expect(row(page).getByRole('alert')).toHaveCount(0)
  await expect(spy(page)).toBeEnabled()
  expect(
    await page.evaluate(() => window.galaxyScene.snapshot().launches),
  ).toBe(0)
})

test('Spy clears its optimistic check when the returned launch receipt rejects the order', async ({
  page,
}) => {
  await open(page)
  await expect(spy(page)).toBeEnabled()
  await page.evaluate(async () => {
    await window.galaxyScene.configure({
      options: {
        launchOutcome: 'Rejected',
        rejectionCode: 'InsufficientResources',
      },
    })
    window.galaxyScene.hold('LaunchFleet')
  })
  try {
    await spy(page).click()
    await expect(spy(page)).toHaveAttribute('data-feedback', 'true')
    await expect
      .poll(() => page.evaluate(() => window.galaxyScene.snapshot().launches))
      .toBe(1)
  } finally {
    await page.evaluate(() => window.galaxyScene.release())
  }
  await expect(
    page.getByTestId('game-error-banner').getByRole('alert'),
  ).toContainText('not enough resources')
  await expect(row(page).getByRole('alert')).toHaveCount(0)
  await expect(spy(page)).toHaveAttribute('data-feedback', 'false')
  await expect(spy(page)).toBeEnabled()
})

for (const mission of ['Espionage', 'Harvest']) {
  test(`${mission} shows a single cooldown and never resubmits on expiry`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await open(page)
    await expect(spy(page)).toBeEnabled()
    await page.evaluate(() =>
      window.galaxyScene.configure({
        options: { launchOutcome: 'RateLimited' },
      }),
    )
    if (mission === 'Espionage') await spy(page).click()
    else {
      await row(page)
        .getByRole('button', { name: /^Actions for \[/ })
        .press('Enter')
      await page.getByRole('menuitem', { name: 'Harvest', exact: true }).click()
      await page
        .getByRole('dialog', { name: 'Harvest mission' })
        .getByRole('button', { name: 'Send', exact: true })
        .click()
    }
    const banner = page.getByTestId('game-error-banner')
    await expect(banner).toContainText('Try again in 60 seconds.')
    await expect(
      page.getByText(
        /probe could not be sent|harvest mission could not be sent/,
      ),
    ).toHaveCount(0)
    if (mission === 'Espionage')
      await expect(spy(page)).toHaveAttribute('data-feedback', 'false')
    await page.evaluate(() => {
      window.galaxyInput!.elapsed = 61_000
      window.galaxyScene.model.tick()
    })
    await expect(banner).not.toContainText('Try again in')
    expect(
      await page.evaluate(() => window.galaxyScene.snapshot().launches),
    ).toBe(1)
  })
}

for (const width of [320, 390, 1280])
  test(`Galaxy toolbar preserves target sizes, control anchors and native slot focus at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 })
    await open(page)
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
      toolbar.getByRole('button', {
        name: 'Fleet slots: 0 used / 5 total',
        exact: true,
      }),
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
    const slots = controls[5]
    await expect(slots).toHaveText('Fleet slots0 / 5')
    expect(boxes[5].x).toBeGreaterThanOrEqual(boxes[4].x + boxes[4].width)
    expect(
      toolbarBox.x + toolbarBox.width - boxes[5].x - boxes[5].width,
    ).toBeLessThanOrEqual(12)
    await slots.click()
    const tooltip = page.getByRole('tooltip')
    await expect(tooltip).toContainText('Fleet slots: 0 used / 5 total')
    await expect(tooltip).toContainText(
      'Outbound and returning fleets, including pending departures',
    )
    await page.keyboard.press('Escape')
    await expect(tooltip).toHaveCount(0)
    await controls[4].focus()
    await page.keyboard.press('Tab')
    await expect(slots).toBeFocused()
    await expect(tooltip).toBeVisible()
    await page.keyboard.press('Escape')
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
  })

test('a held Spy request disables only its target and a second row sends its own coordinates', async ({
  page,
}) => {
  await open(page, {
    positions: { 2: { body: { ...baseBody, id: id(21), owner: id(31) } } },
  })
  await expect(spy(page)).toBeEnabled()
  await page.evaluate(async () => {
    await window.galaxyScene.configure({
      options: { quoteError: 'InsufficientResources' },
    })
    window.galaxyScene.hold('FleetQuote')
  })
  const second = row(page, 1).getByRole('button', {
    name: /^(Spy on|Probe requested for)/,
  })
  try {
    await spy(page).click()
    await expect(spy(page)).toBeDisabled()
    await expect(spy(page)).toHaveAttribute('title', 'Sending a probe…')
    await expect(second).toBeEnabled()
    await expect(second).toHaveAttribute('title', 'Send one espionage probe')
    await second.click()
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.galaxyScene
            .snapshot()
            .calls.flatMap((q) =>
              q.type === 'FleetQuote' && q.intent.destination.type === 'Body'
                ? [q.intent.destination.id]
                : [],
            ),
        ),
      )
      .toEqual([id(20), id(21)])
  } finally {
    await page.evaluate(() => window.galaxyScene.release())
  }
  await expect(spy(page)).toBeEnabled()
  await expect(second).toBeEnabled()
})

for (const width of [390, 1440]) {
  test(`a reviewed missile target survives an ordinary refresh and closes after an owner or body replacement at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await open(page, { missiles: true, positions: { 1: { body: baseBody } } })
    const actions = row(page).getByRole('button', { name: /^Actions for \[/ })
    const dialog = page.getByRole('dialog', {
      name: 'Launch missiles',
      exact: true,
    })
    for (const patch of [{ id: id(90) }, { owner: id(91) }]) {
      await actions.press('Enter')
      await page
        .getByRole('menuitem', { name: 'Launch missiles', exact: true })
        .click()
      const qty = dialog.getByLabel('Missile quantity', { exact: true })
      await qty.fill('2')
      await dialog
        .getByRole('button', { name: 'Review missile launch' })
        .click()
      const launch = dialog.getByRole('button', {
        name: 'Launch missiles — no recall',
      })
      await expect(launch).toBeEnabled()
      await page.evaluate(() => window.galaxyScene.configure({ view: {} }))
      await expect(launch).toBeEnabled()
      await expect(qty).toHaveValue('2')
      await page.evaluate(async (patch) => {
        Object.assign(window.galaxyInput!.positions![1].body!, patch)
        await window.galaxyScene.configure({ view: {} })
      }, patch)
      await expect(dialog).toBeHidden()
      await expect(actions).toBeVisible()
    }
    expect(
      await page.evaluate(() => window.galaxyScene.snapshot().unexpected),
    ).toEqual([])
    expect(
      await page.evaluate(() => window.galaxyScene.snapshot().launches),
    ).toBe(0)
  })
}

test('missile row action columns align at each tablet breakpoint and the panel has a single menu entry', async ({
  page,
}) => {
  await open(page, { missiles: true })
  const rows = page
    .getByRole('region', { name: 'Galaxy positions' })
    .getByRole('article')
  for (const width of [390, 600, 767, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(rows).toHaveCount(15)
    const bounds = await rows.evaluateAll((els) =>
      els.map((el) => {
        const box = el.getBoundingClientRect()
        return [
          box.left,
          box.right,
          el
            .querySelector('button[aria-label^="Actions for"]')!
            .getBoundingClientRect().left,
        ]
      }),
    )
    expect(new Set(bounds.map((b) => b[2])).size).toBe(1)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width)
    if (width <= 767)
      for (const [left, right] of bounds) {
        expect(left).toBe(0)
        expect(right).toBe(width)
      }
    await expect(
      page.getByRole('button', { name: /^Launch missiles at/ }),
    ).toHaveCount(0)
    await rows
      .first()
      .getByRole('button', { name: /^Actions for \[/ })
      .press('Enter')
    await expect(
      page.getByRole('menuitem', { name: 'Launch missiles', exact: true }),
    ).toBeVisible()
    await page.keyboard.press('Escape')
  }
})

const debris = { field_identity: id(42), metal: '900', crystal: '1500' }
const menuFor = (page: Page, index: number) =>
  row(page, index).getByRole('button', { name: /^Actions for \[/ })
test('changing to the viewed colony removes self missions but keeps its debris as the exact customizable destination', async ({
  page,
}) => {
  await open(page, {
    search: '?galaxy=1&system=371',
    positions: {
      1: { body: { ...baseBody, id: id(5), owner: player }, debris: null },
      3: { body: { ...baseBody, id: id(6), owner: player }, debris },
    },
  })
  await expect(
    page.getByRole('button', { name: /^Actions for \[/ }),
  ).toHaveCount(15)
  await expect(menuFor(page, 0)).toBeDisabled()
  await menuFor(page, 2).press('Enter')
  await expect(page.getByRole('menuitem')).toHaveText([
    'Transport',
    'Deploy',
    'Harvest',
  ])
  await page.keyboard.press('Escape')
  await page.evaluate((id) => window.setGalaxyOrigin(id), id(6))
  await menuFor(page, 2).press('Enter')
  await expect(page.getByRole('menuitem')).toHaveText(['Harvest'])
  await page.getByRole('menuitem', { name: 'Harvest', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Harvest mission' })
    .getByRole('button', { name: 'Customize', exact: true })
    .click()
  const draft = page.getByLabel('Prepared fleet')
  await expect(draft).toContainText('Harvest')
  expect(JSON.parse(await draft.innerText())).toMatchObject({
    mission: 'Harvest',
    coordinates: { galaxy: 1, system: 371, position: 3 },
  })
})

test('occupied and empty debris display exact amounts while Harvest and Colonize follow observed capabilities', async ({
  page,
}) => {
  await open(page, {
    positions: {
      1: { body: { ...baseBody, id: id(5), owner: player }, debris },
      4: { body: null, debris },
      5: { body: null, debris: null },
    },
  })
  const actions = row(page, 4).getByRole('button', { name: /^Actions for \[/ })
  await actions.press('Enter')
  await expect(
    page.getByRole('menuitem', { name: 'Colonize', exact: true }),
  ).toBeEnabled()
  await page.getByRole('menuitem', { name: 'Colonize', exact: true }).click()
  const prepared = page.getByLabel('Prepared fleet')
  await expect(prepared).toBeVisible()
  expect(JSON.parse(await prepared.innerText())).toEqual({
    mission: 'Colonize',
    coordinates: { galaxy: 1, system: 371, position: 5 },
  })
  const caps = await page.evaluate(
    () => window.galaxyScene.snapshot().view.capabilities,
  )
  await page.evaluate(() =>
    window.galaxyScene.configure({ view: { capabilities: [] } }),
  )
  await expect(actions).toBeDisabled()
  await expect(
    page.getByRole('button', { name: /^Actions for debris at/ }),
  ).toHaveCount(0)
  for (const i of [0, 3]) {
    await expect(row(page, i).getByTitle('Metal', { exact: true })).toHaveText(
      '900',
      { useInnerText: true },
    )
    await expect(
      row(page, i).getByTitle('Crystal', { exact: true }),
    ).toHaveText('1,500', { useInnerText: true })
  }
  await page.evaluate(
    (capabilities) => window.galaxyScene.configure({ view: { capabilities } }),
    caps,
  )
  for (const i of [0, 3]) {
    const trigger = row(page, i).getByRole('button', {
      name: /^Actions for debris at/,
    })
    await trigger.click()
    await page.getByRole('menuitem', { name: 'Harvest', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Harvest mission' })
    await expect(dialog).toContainText(`Debris at [1:371:${i + 1}]`)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(trigger).toBeFocused()
  }
})

test('mobile quick Harvest starts at the half stop without secure-context UUIDs and Customize prepares the reviewed field', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() =>
    Object.defineProperty(crypto, 'randomUUID', { value: undefined }),
  )
  await open(page)
  await menuFor(page, 0).press('Enter')
  await page.getByRole('menuitem', { name: 'Harvest', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Harvest mission' })
  const sheet = dialog.getByRole('region', { name: 'Harvest mission sheet' })
  // The half stop exposes 400px of the 844px viewport.
  await expect
    .poll(async () => (await sheet.boundingBox())?.y)
    .toBeCloseTo(444, 0)
  await expect(dialog.getByRole('textbox', { name: 'Recyclers' })).toHaveValue(
    '3',
  )
  await expect(dialog).toContainText('5 available · 3 needed')
  await expect(
    dialog.getByRole('button', { name: 'Send', exact: true }),
  ).toBeEnabled()
  await dialog.getByRole('button', { name: 'Customize' }).click()
  const prepared = page.getByLabel('Prepared fleet')
  await expect(prepared).toContainText('Harvest')
  expect(JSON.parse(await prepared.innerText())).toMatchObject({
    mission: 'Harvest',
    coordinates: { galaxy: 1, system: 371, position: 1 },
  })
  expect(
    await page.evaluate(() => window.galaxyScene.snapshot().launches),
  ).toBe(0)
})

test('desktop Enter on the edited Harvest quantity submits the quoted field exactly once', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await open(page)
  const trigger = menuFor(page, 0)
  await trigger.press('Enter')
  await page.getByRole('menuitem', { name: 'Harvest', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Harvest mission' })
  const count = dialog.getByRole('textbox', { name: 'Recyclers' })
  await expect(count).toBeFocused()
  await count.fill('2')
  await count.press('Enter')
  await expect(dialog).toBeHidden()
  const result = await page.evaluate(() => window.galaxyScene.snapshot())
  expect(result.launches).toBe(1)
  expect(result.lastLaunch?.intent).toMatchObject({
    origin: id(5),
    mission: 'Harvest',
    destination: { type: 'Debris', field_identity: id(42) },
    ships: [{ owner: player, ship_type: 'Recycler', count: '2' }],
  })
})

test('a refused quick Spy from the moon menu reports the moon and leaves launch untouched', async ({
  page,
}) => {
  await open(page, {
    positions: {
      1: {
        body: baseBody,
        moon: {
          id: id(70),
          name: 'Selene',
          diameter_km: 8500,
          activity: { type: 'None' },
        },
      },
    },
  })
  await page.evaluate(() =>
    window.galaxyScene.configure({
      options: { quoteError: 'InsufficientResources' },
    }),
  )
  await row(page)
    .getByRole('button', { name: 'Actions for moon [1:371:1]', exact: true })
    .click()
  await page.getByRole('menuitem', { name: 'Spy', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Espionage at moon')
  await expect(page.getByRole('alert')).toContainText('resources')
  const result = await page.evaluate(() => window.galaxyScene.snapshot())
  expect(result.launches).toBe(0)
  expect(
    result.calls.flatMap((q) =>
      q.type === 'FleetQuote' ? [q.intent.destination] : [],
    ),
  ).toMatchObject([{ type: 'Body', id: id(70), expected_kind: 'Moon' }])
})

test('the installed session ticker advances an open probe countdown without replacing its Galaxy row or reading the system again', async ({
  page,
}) => {
  await page.clock.install({ time: now - 1000 })
  await page.clock.pauseAt(now)
  await open(page, { liveTicker: true })
  await expect(row(page)).toBeVisible()
  const missions: Contract['schemas']['MissionView4'] = {
    incoming: [],
    score_value_micro: '0',
    fleet_slots: '3',
    fleets: [
      {
        id: id(80),
        intent: {
          origin: id(5),
          destination: {
            type: 'Body',
            id: id(20),
            expected_owner: id(30),
            expected_kind: 'Planet',
          },
          mission: 'Espionage',
          ships: [{ owner: player, ship_type: 'EspionageProbe', count: '1' }],
          cargo: { metal: '0', crystal: '0', deuterium: '0' },
          speed_percent: 100,
        },
        origin: { galaxy: 1, system: 371, position: 12 },
        destination: { galaxy: 1, system: 371, position: 1 },
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

  await page.evaluate(
    (missions) => window.galaxyScene.configure({ view: { missions } }),
    missions,
  )
  const target = row(page)
  const toggle = target.getByRole('button', { name: /^Your fleets to / })
  await expect(toggle).toHaveText('1–2m')
  await toggle.click()
  const detail = page.getByRole('dialog', {
    name: 'Your fleets to [1:371:1]',
    exact: true,
  })
  await expect(detail).toContainText('2m 0s')
  const original = await target.elementHandle()
  const reads = () =>
    page.evaluate(
      () =>
        window.galaxyScene.snapshot().calls.filter((q) => q.type === 'Galaxy')
          .length,
    )
  const count = await reads()
  await page.clock.fastForward(5000)
  await expect(detail).toContainText('1m 55s')
  await expect(toggle).toHaveText('1–2m')
  expect(await original!.evaluate((el) => el.isConnected)).toBe(true)
  await expect(
    target.getByRole('button', { name: /^Actions for \[/ }),
  ).toBeVisible()
  await expect(page.getByText('Loading system…', { exact: true })).toHaveCount(
    0,
  )
  expect(await reads()).toBe(count)
})

test('editing both coordinates commits one bounded system read and restores the displayed pair from history', async ({
  page,
}) => {
  await open(page, { dimensions: { galaxies: 3, systems_per_galaxy: 420 } })
  const href = () => page.evaluate(() => window.galaxyHistory.href())
  const reads = () =>
    page.evaluate(() =>
      window.galaxyScene
        .snapshot()
        .calls.flatMap((q) =>
          q.type === 'Galaxy' ? [`${q.galaxy}:${q.system}`] : [],
        ),
    )
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
    await expect.poll(href).toBe(`/u/andromeda/b/${id(5)}/galaxy`)
  }
  await galaxy.fill('3')
  await system.press('Tab')
  expect(await reads()).toEqual(['1:371'])
  await go.click()
  await expect.poll(href).toMatch(/galaxy=3&system=420$/)
  await expect(page.getByRole('button', { name: 'Next system' })).toBeDisabled()
  await expect.poll(reads).toEqual(['1:371', '3:420'])
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
  expect(await reads()).toEqual(['1:371', '3:420'])
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
  await expect.poll(href).toMatch(/galaxy=3&system=1$/)
  await system.fill('99')
  await page.evaluate(() => window.galaxyHistory.back())
  await expect(galaxy).toHaveValue('3')
  await expect(system).toHaveValue('420')
  await page.evaluate(() => window.galaxyHistory.back())
  await expect(galaxy).toHaveValue('1')
  await expect(system).toHaveValue('371')
  await page.evaluate(() => window.galaxyHistory.forward())
  await expect(galaxy).toHaveValue('3')
  await expect(system).toHaveValue('420')
  // Arrow navigation uses the displayed system, discarding unfinished edits.
  await system.fill('12')
  await page.getByRole('button', { name: 'Previous system' }).click()
  await expect(system).toHaveValue('419')
  await expect.poll(href).toMatch(/galaxy=3&system=419$/)
})
