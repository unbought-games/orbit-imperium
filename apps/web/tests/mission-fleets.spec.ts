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
import type { components } from '../src/contracts'

type S = components['schemas']
const now = 1793275200000
function fleet(
  n: number,
  mission: S['Mission4'],
  due: number,
  leg: S['OwnMission4']['leg'] = 'Outbound',
): S['OwnMission4'] {
  return {
    id: id(n),
    intent: {
      origin: body.id,
      destination: {
        type: 'Body',
        id: id(99),
        expected_kind: 'Planet',
        expected_owner: id(90),
      },
      mission,
      ships: [
        { owner: binding.player, ship_type: 'LargeCargo', count: '2' },
        { owner: binding.player, ship_type: 'Cruiser', count: '11' },
      ],
      cargo: { metal: '1000000000', crystal: '2000000000', deuterium: '0' },
      speed_percent: 100,
    },
    origin: body.coordinates,
    destination: { galaxy: 1, system: 15, position: 7 },
    leg,
    ships: [
      { ship_type: 'LargeCargo', count: '2' },
      { ship_type: 'Cruiser', count: '11' },
    ],
    cargo: resources,
    due_at: now + due,
    launched_at: now - 180000,
    duration_ms: due + 180000,
    paid_fuel: '1000000',
    can_recall: leg === 'Outbound',
  }
}
for (const width of [320, 390, 1280]) {
  test(`active fleets sort next events and retain readable details and recall at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.clock.setFixedTime(now)
    let revision = 1
    const missions: S['MissionView4'] = {
      fleets: [
        fleet(30, 'Harvest', 1491000),
        fleet(31, 'Attack', 1810000),
        fleet(32, 'Transport', 1421000, 'Returning'),
        fleet(33, 'Deploy', 1810000),
      ],
      incoming: [],
      score_value_micro: '0',
      fleet_slots: '8',
    }
    await installGameFixture(page, {
      protocol: 4,
      sampledAt: now,
      missions,
      bodies: [{ ...body, name: 'Hades' }],
      viewerRevision: () => String(revision),
    })
    const path = `/u/andromeda/b/${body.id}/fleets`
    await page.goto(path)
    const cards = page.getByRole('article', { name: / fleet$/ })
    await expect(cards.getByRole('heading')).toHaveText([
      'Transport Returning',
      'Harvest Outbound',
      'Attack Outbound',
      'Deploy Outbound',
    ])
    const bounds = await Promise.all(
      (await cards.all()).map((card) => card.boundingBox()),
    )
    for (let index = 1; index < bounds.length; index++) {
      expect(bounds[index]!.y).toBeGreaterThanOrEqual(
        bounds[index - 1]!.y + bounds[index - 1]!.height,
      )
      expect(bounds[index]!.x).toBe(bounds[0]!.x)
      expect(bounds[index]!.width).toBe(bounds[0]!.width)
    }
    const returning = cards.first()
    await expect(returning).toContainText('Home in')
    await expect(
      returning.getByRole('button', { name: 'Review recall' }),
    ).toHaveCount(0)
    const attack = page.getByRole('article', {
      name: 'Attack fleet',
      exact: true,
    })
    const manifestToggle = attack.getByRole('button', {
      name: 'Attack ship composition: 13 ships',
      exact: true,
    })
    await expect(manifestToggle).toHaveAttribute('aria-expanded', 'false')
    await expect(
      attack.getByRole('list', { name: 'Ship composition' }),
    ).toBeHidden()
    await expect(
      attack.getByRole('img', {
        name: 'Outbound: Hades [1:371:12] → Planet [1:15:7]',
        exact: true,
      }),
    ).toBeVisible()
    expect((await attack.boundingBox())!.height).toBeLessThan(240)
    const marker = (await attack
      .getByRole('img', { name: /^Outbound:/ })
      .locator('.lucide-rocket')
      .boundingBox())!
    expect(Math.abs(marker.width - marker.height)).toBeLessThan(1)
    await expect(
      attack.getByRole('group', { name: 'Carried resources' }),
    ).toContainText('Cargo')
    for (const card of await cards.all()) {
      expect(
        await card.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true)
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    const recallBox = (await attack
      .getByRole('button', { name: 'Review recall' })
      .boundingBox())!
    const detailsBox = (await attack
      .getByRole('link', { name: 'Mission details' })
      .boundingBox())!
    expect(Math.abs(recallBox.y - detailsBox.y)).toBeLessThan(48)
    await page.evaluate(() => scrollTo(0, 0))
    await diagnosticScreenshot(page, {
      path: `test-results/active-fleets-list-${width}x900.png`,
    })
    await manifestToggle.click()
    await expect(manifestToggle).toHaveAttribute('aria-expanded', 'true')
    await expect(
      attack
        .getByRole('list', { name: 'Ship composition' })
        .getByRole('listitem'),
    ).toHaveText(['Large Cargo 2', 'Cruiser 11'])
    await expect(attack.locator('time')).toHaveAttribute(
      'datetime',
      new Date(now + 1810000).toISOString(),
    )
    await expect(
      attack.getByRole('link', { name: 'View destination [1:15:7] in galaxy' }),
    ).toBeVisible()
    await attack.evaluate((el) =>
      window.scrollBy(0, el.getBoundingClientRect().top - 80),
    )
    await diagnosticScreenshot(page, {
      path: `test-results/active-fleets-manifest-${width}x900.png`,
    })
    await manifestToggle.click()
    await expect(
      attack.getByRole('list', { name: 'Ship composition' }),
    ).toBeHidden()
    await attack.getByRole('button', { name: 'Review recall' }).click()
    const review = attack.getByRole('region', { name: 'Review recall' })
    await expect(review).toContainText('Estimated return if recalled now')
    const reviewHeight = width < 768 ? 1200 : 900
    await page.setViewportSize({ width, height: reviewHeight })
    await attack.evaluate((el) =>
      window.scrollBy(0, el.getBoundingClientRect().top - 80),
    )
    await diagnosticScreenshot(page, {
      path: `test-results/active-fleets-recall-${width}x${reviewHeight}.png`,
    })
    await page.setViewportSize({ width, height: 900 })
    await review.getByRole('button', { name: 'Keep mission' }).click()
    await expect(review).toHaveCount(0)
    await attack.getByRole('link', { name: 'Mission details' }).click()
    await expect(page).toHaveURL(`${path}/${id(31)}`)
    await expect(cards).toHaveCount(1)
    await expect(attack).toContainText('Fuel spent')
    await expect(attack).toContainText('Speed 100%')
    await page.evaluate(() => scrollTo(0, 0))
    await diagnosticScreenshot(page, {
      path: `test-results/active-fleets-details-${width}x900.png`,
      fullPage: true,
    })
    await page.getByRole('link', { name: 'All fleets', exact: true }).click()
    missions.fleets[1] = {
      ...missions.fleets[1],
      leg: 'Returning',
      can_recall: false,
      due_at: now - 1,
    }
    revision++
    await refreshGame(page)
    await expect(cards.first().getByRole('heading')).toHaveText(
      'Attack Returning',
    )
    await expect(cards.first()).toContainText('Awaiting confirmation')
    const address = cards.first().getByText('[1:371:12]', { exact: true })
    expect(
      await address.evaluate((el) => {
        const range = document.createRange()
        range.selectNodeContents(el)
        return range.getClientRects().length
      }),
    ).toBe(1)
    await expect(
      cards.first().getByRole('button', { name: 'Review recall' }),
    ).toHaveCount(0)
    await cards
      .first()
      .evaluate((el) => window.scrollBy(0, el.getBoundingClientRect().top - 80))
    await diagnosticScreenshot(page, {
      path: `test-results/active-fleets-awaiting-${width}x900.png`,
    })
    const harvest = page.getByRole('article', {
      name: 'Harvest fleet',
      exact: true,
    })
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let sent = 0
    await page.route('**/commands', async (route) => {
      sent++
      expect(route.request().postDataJSON().gameplay.command.action).toEqual({
        type: 'RecallMission',
        fleet: id(30),
      })
      await gate
      await route.fulfill({ status: 503, json: { code: 'Unavailable' } })
    })
    try {
      await harvest.getByRole('button', { name: 'Review recall' }).click()
      expect(sent).toBe(0)
      await harvest
        .getByRole('button', { name: 'Recall fleet', exact: true })
        .click()
      await expect.poll(() => sent).toBe(1)
      await expect(
        harvest.getByRole('button', { name: 'Recall requested', exact: true }),
      ).toBeDisabled()
      await harvest.evaluate((el) =>
        window.scrollBy(0, el.getBoundingClientRect().top - 80),
      )
      await diagnosticScreenshot(page, {
        path: `test-results/active-fleets-pending-recall-${width}x900.png`,
      })
    } finally {
      release()
    }
  })
}
