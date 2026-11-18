import { test, expect, type Page } from './fixture'
import { diagnosticScreenshot } from '../fixtures/diagnostic-screenshot'
import { empireFixture, body, id, binding } from '../../src/test-support/empire'
import type { components } from '../../src/contracts'
import type { EmpireSceneInput } from './empire-runtime'
import type {} from './empire.scenarios'
type S = components['schemas']
const optionsByPage = new WeakMap<Page, EmpireSceneInput>()
async function mountEmpire(page: Page, input: EmpireSceneInput) {
  optionsByPage.set(page, input)
  await page.addInitScript((input) => {
    window.empireInput = input
  }, input)
  await page.goto('/?scenario=empire')
  await expect(page.locator('html')).toHaveAttribute(
    'data-component-ready',
    'empire',
  )
}
async function deliverEmpire(page: Page) {
  const input = optionsByPage.get(page)!
  await page.evaluate(async (input) => {
    const { view } = window.empireScene
    if (input.bodies) view.bodies = input.bodies
    if (input.missions) view.missions = input.missions
    await window.empireScene.refresh()
  }, input)
}
test('phone balance rows keep a billion and small amounts intact in both resource panels', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const options = empireFixture()
  const amounts = {
    metal: '1000234567000000',
    crystal: '45000000',
    deuterium: '127000000',
  }
  await mountEmpire(page, {
    bodies: [{ ...options.bodies[0], amounts }],
    missions: { ...options.missions, fleets: [] },
  })
  const totals = ['1,000,234,567', '45', '127']
  for (const [name, details] of [
    [
      'Empire resource totals',
      [
        ['Worlds', totals],
        ['In flight', ['0', '0', '0']],
      ],
    ],
    [
      'Planet resources',
      [
        ['Capacity', ['40,000', '30,000', '15,000']],
        ['Per hour', ['0', '37', '0']],
      ],
    ],
  ] as const) {
    const panel = page.getByLabel(name)
    const panelBox = (await panel.boundingBox())!
    const balances = panel.locator('strong')
    await expect(balances).toHaveText(totals)
    const rects = await balances.evaluateAll((balances) =>
      balances.map((balance) => {
        const walker = document.createTreeWalker(balance, NodeFilter.SHOW_TEXT)
        const range = document.createRange()
        range.selectNodeContents(walker.nextNode()!)
        const lines = range.getClientRects()
        const rect = range.getBoundingClientRect()
        return {
          lines: lines.length,
          left: rect.left,
          top: rect.top,
          bottom: rect.bottom,
          right: rect.right,
        }
      }),
    )
    const [metal, crystal, deuterium] = rects
    expect(rects.map((r) => r.lines)).toEqual([1, 1, 1])
    expect(crystal.left).toBeCloseTo(metal.left, 0)
    expect(deuterium.left).toBeCloseTo(metal.left, 0)
    expect(crystal.top).toBeGreaterThan(metal.bottom)
    expect(deuterium.top).toBeGreaterThan(crystal.bottom)
    for (const [index, name] of ['Metal', 'Crystal', 'Deuterium'].entries()) {
      const label = panel.getByText(new RegExp(`^${name}$`, 'i'))
      await expect(label).toBeVisible()
      const labelBox = (await label.boundingBox())!
      const amount = rects[index]
      expect(labelBox.y + labelBox.height).toBeLessThanOrEqual(amount.top)
      expect(labelBox.x).toBeLessThan(amount.left)
      if (index > 0) expect(labelBox.y).toBeGreaterThan(rects[index - 1].bottom)
      const detailBoxes = await Promise.all(
        details.map(async ([caption, values]) => {
          const detail = panel.getByText(caption, { exact: true }).nth(index)
          await expect(detail).toBeVisible()
          const value = detail
            .locator('..')
            .getByText(values[index], { exact: true })
          await expect(value).toBeVisible()
          const box = (await value.boundingBox())!
          expect(box.x).toBeGreaterThan(amount.right)
          expect(box.x + box.width).toBeLessThanOrEqual(
            panelBox.x + panelBox.width + 1,
          )
          return (await detail.boundingBox())!
        }),
      )
      const [firstDetail, lastDetail] = detailBoxes
      expect(Math.min(firstDetail.x, lastDetail.x)).toBeGreaterThan(
        amount.right,
      )
      expect(firstDetail.y).toBeLessThan(amount.bottom)
      expect(lastDetail.y + lastDetail.height).toBeGreaterThan(labelBox.y)
    }
  }
})

test('each empire card centers idle construction beside Resources and Facilities', async ({
  page,
}) => {
  const options = empireFixture()
  await mountEmpire(page, options)
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    for (const body of options.bodies) {
      const { galaxy, system, position } = body.coordinates
      const card = page.getByRole('article', {
        name: `${body.kind} [${galaxy}:${system}:${position}] dossier`,
        exact: true,
      })
      const buildings = card.getByRole('region', {
        name: 'Buildings',
        exact: true,
      })
      const open = buildings.getByRole('link', {
        name: 'Resources',
        exact: true,
      })
      await expect(open).toHaveAttribute(
        'href',
        `/u/andromeda/b/${body.id}/resources`,
      )
      const facilities = buildings.getByRole('link', {
        name: 'Facilities',
        exact: true,
      })
      await expect(facilities).toHaveAttribute(
        'href',
        `/u/andromeda/b/${body.id}/facilities`,
      )
      await expect(
        card.getByRole('link', { name: 'Facilities', exact: true }),
      ).toHaveCount(1)
      const openBox = (await open.boundingBox())!
      const facilitiesBox = (await facilities.boundingBox())!
      expect(facilitiesBox.y).toBeGreaterThanOrEqual(openBox.y + openBox.height)
      const idle = buildings.getByText('No construction in progress.', {
        exact: true,
      })
      if (await idle.count()) {
        const idleBox = (await idle.boundingBox())!
        const actionsCenter =
          (openBox.y + facilitiesBox.y + facilitiesBox.height) / 2
        expect(
          Math.abs(idleBox.y + idleBox.height / 2 - actionsCenter),
        ).toBeLessThan(1)
      }
      if (
        width !== 320 &&
        (body === options.bodies[0] || (await idle.count()))
      ) {
        await diagnosticScreenshot(buildings, {
          path: `test-results/buildings-${(await idle.count()) ? 'idle' : 'active'}-${width}x900.png`,
        })
      }
    }
  }
  await page
    .getByRole('article')
    .first()
    .getByRole('link', { name: 'Facilities', exact: true })
    .click()
  await expect(page.getByLabel('Scene destination')).toHaveText(
    `/u/andromeda/b/${options.bodies[0].id}/facilities`,
  )
})

test('shipyard summary gives production full width with Shipyard and Defense below', async ({
  page,
}) => {
  const options = empireFixture()
  await mountEmpire(page, options)
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    for (const body of [options.bodies[0], options.bodies[2]]) {
      const { galaxy, system, position } = body.coordinates
      const card = page.getByRole('article', {
        name: `${body.kind} [${galaxy}:${system}:${position}] dossier`,
        exact: true,
      })
      const summary = card.getByRole('region', {
        name: 'Shipyard & defense',
        exact: true,
      })
      const shipyard = summary.getByRole('link', {
        name: 'Shipyard',
        exact: true,
      })
      const defense = summary.getByRole('link', {
        name: 'Defense',
        exact: true,
      })
      await expect(shipyard).toHaveAttribute(
        'href',
        `/u/andromeda/b/${body.id}/shipyard`,
      )
      await expect(defense).toHaveAttribute(
        'href',
        `/u/andromeda/b/${body.id}/defense`,
      )
      const active = body === options.bodies[0]
      const content = active
        ? summary.getByRole('list', { name: 'Manufacturing queue' })
        : summary.getByText('No ships or defenses in production.', {
            exact: true,
          })
      const contentBox = (await content.boundingBox())!
      const shipyardBox = (await shipyard.boundingBox())!
      const defenseBox = (await defense.boundingBox())!
      if (active) {
        expect(shipyardBox.y).toBeGreaterThanOrEqual(
          contentBox.y + contentBox.height,
        )
        expect(Math.abs(shipyardBox.y - defenseBox.y)).toBeLessThan(1)
        expect(shipyardBox.x + shipyardBox.width).toBeLessThanOrEqual(
          defenseBox.x,
        )
      } else {
        expect(defenseBox.y).toBeGreaterThanOrEqual(
          shipyardBox.y + shipyardBox.height,
        )
        expect(contentBox.x + contentBox.width).toBeLessThanOrEqual(
          shipyardBox.x,
        )
        const actionsCenter =
          (shipyardBox.y + defenseBox.y + defenseBox.height) / 2
        expect(
          Math.abs(contentBox.y + contentBox.height / 2 - actionsCenter),
        ).toBeLessThan(1)
      }
      expect(
        await summary.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true)
      if (width !== 320) {
        await diagnosticScreenshot(summary, {
          path: `test-results/shipyard-${active ? 'active' : 'idle'}-${width}x900.png`,
        })
      }
    }
  }
  const summary = page
    .getByRole('article')
    .first()
    .getByRole('region', { name: 'Shipyard & defense', exact: true })
  await summary.getByRole('link', { name: 'Shipyard', exact: true }).click()
  await expect(page.getByLabel('Scene destination')).toHaveText(
    new RegExp('/shipyard$'),
  )
  await summary.getByRole('link', { name: 'Defense', exact: true }).click()
  await expect(page.getByLabel('Scene destination')).toHaveText(
    new RegExp('/defense$'),
  )
})

test('a large empire keeps every network target reachable and phone movements visible', async ({
  page,
}) => {
  const options = empireFixture()
  options.bodies = Array.from({ length: 16 }, (_, i) => ({
    ...body,
    id: i === 0 ? body.id : id(100 + i),
    coordinates: { galaxy: 1, system: 371 + i, position: (i % 15) + 1 },
  }))
  await page.setViewportSize({ width: 1440, height: 1000 })
  await mountEmpire(page, options)
  await page.getByText('Empire orbital network', { exact: true }).click()
  const map = page.getByRole('region', { name: 'Empire orbital network' })
  await expect(map.getByRole('link', { name: /^Focus/ })).toHaveCount(16)
  const last = map.getByRole('link', {
    name: 'Focus Planet [1:386:1]',
    exact: true,
  })
  await last.focus()
  await expect(last).toBeInViewport()
  await page.keyboard.press('Enter')
  await expect(page.getByLabel('Scene destination')).toHaveText(
    new RegExp(`/b/${id(115)}/overview$`),
  )
  await expect(page.getByRole('article')).toHaveCount(16)
  await page.setViewportSize({ width: 390, height: 844 })
  const board = page.getByRole('region', {
    name: 'Fleet movements',
    exact: true,
  })
  await expect(board.getByRole('list')).toBeVisible()
  await expect(board.getByRole('listitem')).toHaveCount(4)
  await expect(
    board.getByRole('button', {
      name: 'Incoming Attack ship composition: unknown',
    }),
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
})

for (const width of [320, 390, 1280]) {
  test(`all fleet movements are visible by default with owned and hostile tints at ${width}px`, async ({
    page,
  }) => {
    const now = new Date('2026-10-24T12:00:00Z')
    await page.clock.install({ time: now })
    await page.setViewportSize({ width, height: 844 })
    const options = empireFixture(now.getTime())
    const missions: S['Mission4'][] = [
      'Transport',
      'Deploy',
      'Colonize',
      'Harvest',
      'Attack',
      'Espionage',
    ]
    options.missions.fleets = missions.flatMap((mission, index) =>
      (['Outbound', 'Returning'] as const).map((leg, legIndex) => ({
        ...options.missions.fleets[0],
        id: id(200 + index * 2 + legIndex),
        intent: { ...options.missions.fleets[0].intent, mission },
        leg,
        due_at: now.getTime() + 175000 + (index * 2 + legIndex) * 180000,
      })),
    )
    await mountEmpire(page, { ...options, sampledAt: now.getTime() })
    const board = page.getByRole('region', {
      name: 'Fleet movements',
      exact: true,
    })
    await expect(board.getByRole('listitem')).toHaveCount(13)
    const rows = await board.getByRole('listitem').all()
    for (let index = 1; index < rows.length; index++) {
      const previous = (await rows[index - 1].boundingBox())!
      const current = (await rows[index].boundingBox())!
      expect(current.y).toBeGreaterThanOrEqual(previous.y + previous.height)
    }
    await expect(board.getByRole('button', { name: /movements/ })).toHaveCount(
      0,
    )
    await expect(board).toContainText('1 incoming hostile fleet detected')
    const appearance = async (mission: string, leg: string) => {
      const row = board.getByRole('listitem').filter({
        has:
          leg === 'incoming'
            ? page.getByRole('heading', {
                name: `Incoming ${mission.toLowerCase()} · Hostile`,
                exact: true,
              })
            : page.getByRole('link', {
                name: `View ${mission} ${leg} fleet`,
                exact: true,
              }),
      })
      await expect(row).toBeVisible()
      return row.evaluate((el) => ({
        border: getComputedStyle(el).borderLeftColor,
        background: getComputedStyle(el).backgroundColor,
        gradient: getComputedStyle(el).backgroundImage,
        title: getComputedStyle(
          el.querySelector('h3') ?? el.querySelector('strong')!,
        ).color,
      }))
    }
    const peaceful = await appearance('Transport', 'outbound')
    const combat = await appearance('Attack', 'incoming')
    expect(peaceful.border).not.toBe(combat.border)
    expect(peaceful.gradient).not.toBe(combat.gradient)
    expect(peaceful.title).not.toBe(combat.title)
    for (const mission of missions) {
      for (const leg of ['outbound', 'returning']) {
        const owned = await appearance(mission, leg)
        expect(owned.border).toBe(peaceful.border)
        expect(owned.background).toBe(peaceful.background)
        expect(owned.gradient).not.toBe(combat.gradient)
        expect(owned.title).not.toBe(combat.title)
      }
    }
    // Every row participates in page scrolling, with no clipped inner panel.
    expect(
      await board.getByRole('list').evaluate((el) => {
        const list = el.getBoundingClientRect()
        const panel = el.closest('section')!.getBoundingClientRect()
        return list.top >= panel.top && list.bottom <= panel.bottom
      }),
    ).toBe(true)
    const last = board.getByRole('link', {
      name: 'View Espionage returning fleet',
    })
    await last.scrollIntoViewIfNeeded()
    await expect(last).toBeInViewport({ ratio: 1 })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    if (width === 390) {
      await diagnosticScreenshot(board, {
        path: 'test-results/fleet-movements-mission-tints-390.png',
      })
    }
  })
}

for (const width of [390, 1440]) {
  test(`empire labels only the saved homeworld at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    const options = empireFixture()
    // Put the homeworld after another planet to verify identity, not list order.
    options.bodies[1].name = 'Nova Roma'
    await mountEmpire(page, { ...options, homeworldId: options.bodies[1].id })
    const home = page.getByRole('article', {
      name: 'Nova Roma [1:380:8] dossier',
      exact: true,
    })
    const planet = page.getByRole('article', {
      name: 'Planet [1:371:4] dossier',
      exact: true,
    })
    const moon = page.getByRole('article', {
      name: 'Moon [1:371:4] dossier',
      exact: true,
    })
    await expect(
      home.locator('header').getByText('Homeworld', { exact: true }),
    ).toBeVisible()
    await expect(
      planet.locator('header').getByText('Planet', { exact: true }),
    ).toBeVisible()
    await expect(
      moon.locator('header span').filter({ hasText: /^Moon$/ }),
    ).toBeVisible()
    await expect(page.getByText('Homeworld', { exact: true })).toHaveCount(1)
    // Capture the normal server order, with the homeworld first.
    options.bodies.unshift(...options.bodies.splice(1, 1))
    await deliverEmpire(page)
    await expect(page.getByRole('article').first()).toHaveAttribute(
      'aria-label',
      'Nova Roma [1:380:8] dossier',
    )
    await home.locator('header').scrollIntoViewIfNeeded()
    await page.evaluate(() => scrollBy(0, -100))
    await diagnosticScreenshot(page, {
      path: `test-results/empire-homeworld-label-${width}x1000.png`,
    })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  })

  test(`empire wealth and physical metadata at ${width}px`, async ({
    page,
  }) => {
    const now = new Date('2026-10-29T12:00:00Z')
    await page.clock.install({ time: now })
    await page.clock.pauseAt(now)
    await page.setViewportSize({ width, height: 1000 })
    const options = empireFixture(now.getTime())
    options.missions.fleets[0].cargo = {
      metal: '1250000000',
      crystal: '2000000',
      deuterium: '3500000',
    }
    options.missions.fleets[1].cargo = {
      metal: '11000000',
      crystal: '12000000',
      deuterium: '13000000',
    }
    options.missions.fleets[2].cargo = {
      metal: '0',
      crystal: '0',
      deuterium: '0',
    }
    await mountEmpire(page, { ...options, sampledAt: now.getTime() })
    const ledger = page.getByLabel('Empire resource totals')
    for (const name of ['metal', 'crystal', 'deuterium'] as const) {
      const group = ledger.getByRole('group', {
        name: `${name} wealth`,
        exact: false,
      })
      await expect(group.locator('svg[data-resource]')).toHaveCount(1)
      await expect(group.locator('dl svg[data-resource]')).toHaveCount(0)
      await expect(group.locator('dt > svg')).toHaveCount(2)
      await expect(group.getByRole('term')).toHaveText(['Worlds', 'In flight'])
      await expect(
        group.locator('[title="On planets and moons"]'),
      ).toBeVisible()
      await expect(group.locator('[title="On active fleets"]')).toBeVisible()
      const iconCenters = await group.locator('dt > svg').evaluateAll((icons) =>
        icons.map((icon) => {
          const box = icon.getBoundingClientRect()
          return box.x + box.width / 2
        }),
      )
      expect(Math.max(...iconCenters) - Math.min(...iconCenters)).toBeLessThan(
        1,
      )
      const amountStarts = await group
        .locator('dd')
        .evaluateAll((amounts) =>
          amounts.map((amount) => amount.getBoundingClientRect().x),
        )
      expect(
        Math.max(...amountStarts) - Math.min(...amountStarts),
      ).toBeLessThan(1)
      const totalStart = (await group.locator('strong').boundingBox())!.x
      expect(amountStarts[0]).toBeGreaterThan(totalStart + 10)
      const resource = (await group
        .locator('svg[data-resource]')
        .boundingBox())!
      expect(iconCenters[0]).toBeGreaterThan(
        resource.x + resource.width / 2 + 10,
      )
      const onWorlds = options.bodies.reduce(
        (sum, b) => sum + BigInt(b.amounts[name]),
        0n,
      )
      const inTransit = options.missions.fleets.reduce(
        (sum, f) => sum + BigInt(f.cargo[name]),
        0n,
      )
      await expect(group.locator('strong')).toHaveText(
        ((onWorlds + inTransit) / 1000000n).toLocaleString('en-US'),
      )
      await expect(
        group.locator('dl > div').filter({ hasText: 'Worlds' }).locator('dd'),
      ).toHaveText((onWorlds / 1000000n).toLocaleString('en-US'))
      await expect(
        group
          .locator('dl > div')
          .filter({ hasText: 'In flight' })
          .locator('dd'),
      ).toHaveText((inTransit / 1000000n).toLocaleString('en-US'))
    }
    // Resume animation timers after checking the exact resource snapshot.
    await page.clock.resume()
    await diagnosticScreenshot(page, {
      path: `test-results/empire-wealth-${width}x1000.png`,
    })
    const home = page.getByRole('article', {
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
    // An unknown homeworld must not be inferred from the first planet.
    await expect(
      home.locator('header').getByText('Planet', { exact: true }),
    ).toBeVisible()
    await expect(page.getByText('Homeworld', { exact: true })).toHaveCount(0)
    await expect(home).toContainText('12800 km · -60 to -20 °C')
    await expect(colony).toContainText('15191 km · 24 to 64 °C')
    await expect(moon).not.toContainText('km')
    const physical = home.getByText('12800 km · -60 to -20 °C')
    const fields = home.getByText(/87\/163 fields/)
    expect((await physical.boundingBox())!.y).toBeGreaterThan(
      (await fields.boundingBox())!.y,
    )
    await home.locator('header').scrollIntoViewIfNeeded()
    await page.evaluate(() => scrollBy(0, -100))
    await diagnosticScreenshot(page, {
      path: `test-results/empire-homeworld-${width}x1000.png`,
    })
    const temperature = home.getByRole('button', {
      name: '-60 to -20 °C',
      exact: true,
    })
    await expect(home.getByText(/Maximum temperature:/)).toHaveCount(0)
    await expect(temperature).toHaveCSS('text-decoration-style', 'dotted')
    const target = (await temperature.boundingBox())!
    expect(target.width).toBeGreaterThanOrEqual(width < 1024 ? 44 : 24)
    expect(target.height).toBeGreaterThanOrEqual(width < 1024 ? 44 : 24)
    await expect(page.getByRole('tooltip')).toHaveCount(0)
    if (width === 1440) {
      await temperature.hover()
      await page.clock.runFor(250)
    } else {
      const touch = await page.context().newCDPSession(page)
      await touch.send('Emulation.setTouchEmulationEnabled', { enabled: true })
      const bounds = (await temperature.boundingBox())!
      await touch.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [
          { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
        ],
      })
      await touch.send('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
      })
      await touch.detach()
    }
    const tooltip = page.getByRole('tooltip')
    await expect(tooltip).toContainText(
      'Maximum temperature affects deuterium production and solar satellite energy output.',
    )
    await expect(tooltip).toContainText(
      'Each solar satellite produces 20 at 100% production.',
    )
    await expect(
      tooltip.getByRole('img', { name: 'Energy', exact: true }),
    ).toBeVisible()
    await diagnosticScreenshot(page, {
      path: `test-results/empire-homeworld-climate-${width}x1000.png`,
    })
    await page.keyboard.press('Escape')
    await expect(tooltip).toHaveCount(0)
    await page.mouse.move(0, 0)
    await temperature.blur()
    await temperature.focus()
    await expect(tooltip).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(tooltip).toHaveCount(0)
    await temperature.blur()
    const unavailable = page
      .getByRole('article', { name: 'Planet [1:402:2] dossier', exact: true })
      .getByRole('button', { name: 'Temperature unavailable', exact: true })
    await unavailable.click()
    await expect(tooltip).toContainText(
      'This server has not supplied temperature metadata for this planet.',
    )
    await page.keyboard.press('Escape')
    await colony.locator('header').scrollIntoViewIfNeeded()
    await page.evaluate(() => scrollBy(0, -100))
    await diagnosticScreenshot(colony.locator('header'), {
      path: `test-results/empire-colony-${width}x1000.png`,
    })
    options.missions.fleets = []
    await deliverEmpire(page)
    await page.clock.runFor(1000)
    await expect(
      ledger.locator('dl > div').filter({ hasText: 'In flight' }).locator('dd'),
    ).toHaveText(['0', '0', '0'])
    await diagnosticScreenshot(ledger, {
      path: `test-results/empire-wealth-empty-${width}x1000.png`,
    })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
  })
}

for (const width of [390, 1440]) {
  test(`Empire wealth guide slowly repeats at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    // Pause at animation start so captures do not depend on page-load speed.
    await page.addInitScript(() => {
      document.addEventListener('animationstart', (event) => {
        if (!(event as AnimationEvent).animationName.includes('wealthGuide'))
          return
        for (const animation of (event.target as Element).getAnimations({
          subtree: true,
        })) {
          animation.pause()
          animation.currentTime = 0
        }
      })
    })
    await mountEmpire(page, empireFixture())
    const ledger = page.getByLabel('Empire resource totals')
    const guide = ledger.locator('dl').first()
    const sample = async (time: number) => {
      await ledger.evaluate((element, time) => {
        for (const animation of element.getAnimations({ subtree: true })) {
          animation.pause()
          animation.currentTime = time
        }
      }, time)
      return guide.evaluate((element) => ({
        pulsePosition: getComputedStyle(element, '::after').backgroundPositionY,
        pulseOpacity: getComputedStyle(element, '::after').opacity,
        lineColor: getComputedStyle(element, '::before').borderLeftColor,
        glow: getComputedStyle(element, '::before').filter,
      }))
    }
    const resting = await sample(0)
    const early = await sample(1200)
    const late = await sample(4800)
    const percent = (position: string) =>
      Number(position.match(/(-?[\d.]+)%/)![1])
    expect(percent(late.pulsePosition)).toBeGreaterThan(
      percent(early.pulsePosition),
    )
    expect(Number(late.pulseOpacity)).toBeGreaterThan(0)
    await diagnosticScreenshot(ledger, {
      path: `test-results/empire-wealth-pulse-${width}x1000.png`,
    })
    const glowing = await sample(5400)
    expect(Number(glowing.pulseOpacity)).toBeGreaterThan(0)
    for (const group of await ledger.getByRole('group').all()) {
      const colors = await group.evaluate((element) => {
        const guide = element.querySelector('dl')!
        return {
          icon: getComputedStyle(element.querySelector('svg[data-resource]')!)
            .color,
          line: getComputedStyle(guide, '::before').borderLeftColor,
          branch: getComputedStyle(guide.querySelector('div')!, '::before')
            .borderTopColor,
          pulse: getComputedStyle(guide, '::after').backgroundImage,
          glow: getComputedStyle(guide, '::before').filter,
        }
      })
      expect(colors.line).toBe(colors.icon)
      expect(colors.branch).toBe(colors.icon)
      expect(colors.pulse).toContain(colors.icon)
      expect(colors.glow).toContain(colors.icon)
    }
    await diagnosticScreenshot(ledger, {
      path: `test-results/empire-wealth-glow-${width}x1000.png`,
    })
    const fading = await sample(8400)
    expect(fading.lineColor).not.toBe(glowing.lineColor)
    const settled = await sample(10800)
    expect(settled.pulseOpacity).toBe('0')
    expect(settled.lineColor).not.toBe(glowing.lineColor)
    expect(settled.glow).toBe(resting.glow)
    await diagnosticScreenshot(page, {
      path: `test-results/empire-wealth-settled-${width}x1000.png`,
    })
    for (const row of await ledger.locator('dl > div').all()) {
      await expect(row).toHaveCSS('border-top-width', '0px')
    }
    const repeated = await sample(16800)
    expect(repeated).toEqual(late)
  })

  test(`Empire wealth guide stops for reduced motion at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await mountEmpire(page, empireFixture())
    const ledger = page.getByLabel('Empire resource totals')
    const guide = ledger.locator('dl').first()
    // Exercise real running animations, without the sampling test's manual pauses.
    await expect
      .poll(() =>
        ledger.evaluate(
          (element) => element.getAnimations({ subtree: true }).length,
        ),
      )
      .toBeGreaterThan(0)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect
      .poll(() =>
        ledger.evaluate(
          (element) => element.getAnimations({ subtree: true }).length,
        ),
      )
      .toBe(0)
    expect(
      await guide.evaluate(
        (element) => getComputedStyle(element, '::after').opacity,
      ),
    ).toBe('0')
    await diagnosticScreenshot(ledger, {
      path: `test-results/empire-wealth-reduced-motion-${width}x1000.png`,
    })
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute(
      'data-component-ready',
      'empire',
    )
    await expect(ledger).toBeVisible()
    expect(
      await ledger.evaluate(
        (element) => element.getAnimations({ subtree: true }).length,
      ),
    ).toBe(0)
  })
}

for (const width of [390, 1440]) {
  test(`stationed inventory disclosure preserves updates and large totals at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    const input = empireFixture()
    input.bodies[0].inventories = [
      { item: { kind: 'Ship', id: 'LargeCargo' }, count: '9007199254740993' },
      { item: { kind: 'Ship', id: 'SolarSatellite' }, count: '3' },
      {
        item: { kind: 'Defense', id: 'RocketLauncher' },
        count: '9007199254740993',
      },
      { item: { kind: 'Defense', id: 'LightLaser' }, count: '2' },
    ]
    await mountEmpire(page, input)
    const planet = page.getByRole('article').first()
    for (const name of ['Orbital fleet', 'Planetary defenses']) {
      const summary = planet.locator('summary').filter({ hasText: name })
      await summary.press('Enter')
      await expect(
        planet.getByRole('region', { name, exact: true }),
      ).toBeVisible()
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    input.bodies[0].inventories = []
    await deliverEmpire(page)
    await expect(
      planet.getByRole('region', { name: 'Orbital fleet', exact: true }),
    ).toHaveText('No ships stationed here.')
    await expect(
      planet.getByRole('region', { name: 'Planetary defenses', exact: true }),
    ).toHaveText('No defenses stationed here.')
  })
}

for (const width of [1440, 390]) {
  test(`empire name receives focus after its loading overlay clears at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const data = {
      player: binding.player,
      profile: id(80),
      universe: binding.universe,
      epoch: binding.epoch,
      universe_name: 'Andromeda',
      username: 'Aurelia',
      display: null,
      owner: true,
      public: false,
      removed: false,
      closed: false,
      revision: 0,
      entries: [],
      next: null,
      identity: { name: 'Roman Empire', tagline: '', title_id: 'commander' },
      title: {
        id: 'commander',
        label: 'Commander',
        address: 'Commander',
        expires_at: null,
      },
      title_choices: [],
    }
    await page.route('**/api/v1/session', (route) =>
      route.fulfill({
        json: {
          account: binding.account,
          csrf: 'fixture',
          expires_at: Date.now() + 3600000,
          memberships: [],
        },
      }),
    )
    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/api/v4/empire-profiles/**', async (route) => {
      await held
      await route.fulfill({ json: data })
    })
    await mountEmpire(page, empireFixture())
    const pencil = page.getByRole('button', {
      name: 'Rename empire',
      exact: true,
    })
    await pencil.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('status')).toHaveText(
      'Loading empire identity…',
    )
    const delivered = page.waitForEvent('requestfinished', {
      predicate: (request) =>
        request.url().includes('/api/v4/empire-profiles/'),
    })
    release()
    await delivered
    const input = dialog.getByRole('textbox', { name: 'Empire name' })
    await expect(input).toBeFocused()
    await expect(input).toHaveValue('Roman Empire')
    await diagnosticScreenshot(page, {
      path: `test-results/empire-name-focus-${width}x1000.png`,
    })
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(pencil).toBeFocused()
  })
}
