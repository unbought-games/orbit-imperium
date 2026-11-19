import { test, expect } from './fixture'
import { body, binding, id, resources } from '../../src/test-support/empire'
import type { components } from '../../src/contracts'
import type {} from './empire.scenarios'
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

for (const width of [320, 1280])
  test(`the active fleet list preserves ordered trajectories and recall review at ${width}px`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.clock.setFixedTime(now)
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

    await page.addInitScript(
      (input) => {
        window.empireInput = input
      },
      {
        screen: 'fleets' as const,
        bodies: [{ ...body, name: 'Hades' }],
        missions,
        sampledAt: now,
      },
    )
    await mount('empire')
    const path = `/u/andromeda/b/${body.id}/fleets`
    const cards = page.getByRole('article', { name: / fleet$/ })
    await expect(cards.getByRole('heading')).toHaveText([
      'Transport Returning',
      'Harvest Outbound',
      'Attack Outbound',
      'Deploy Outbound',
    ])
    await expect(page.getByText('Fleet slots and protection')).toHaveCount(0)
    await expect(page.getByText('Completed-asset score:')).toHaveCount(0)
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
    await expect(
      attack.getByRole('link', { name: 'View destination [1:15:7] in galaxy' }),
    ).toBeVisible()
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
    await expect(
      attack.getByText('Mission details', { exact: true }),
    ).toHaveCount(0)
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
    await manifestToggle.click()
    await expect(
      attack.getByRole('list', { name: 'Ship composition' }),
    ).toBeHidden()
    await attack.getByRole('button', { name: 'Review recall' }).click()
    const review = attack.getByRole('region', { name: 'Review recall' })
    await expect(review).toContainText('Estimated return if recalled now')
    await review.getByRole('button', { name: 'Keep mission' }).click()
    await expect(review).toHaveCount(0)
    await attack.getByRole('group', { name: 'Carried resources' }).click()
    await expect(page.getByLabel('Scene destination')).toHaveText(
      `${path}/${id(31)}`,
    )
    await expect(cards).toHaveCount(1)
    await expect(attack).toContainText('Fuel spent')
    await expect(attack).toContainText('Speed 100%')
    await expect(page.getByText('Fleet slots and protection')).toHaveCount(0)
    await expect(page.getByText('Completed-asset score:')).toHaveCount(0)
    await page.getByRole('link', { name: 'All fleets', exact: true }).click()
    missions.fleets[1] = {
      ...missions.fleets[1],
      leg: 'Returning',
      can_recall: false,
      due_at: now - 1,
    }
    await page.evaluate(async (missions) => {
      window.empireScene.view.missions = missions
      await window.empireScene.refresh()
    }, missions)
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
    if (width !== 320) return
    const harvest = page.getByRole('article', {
      name: 'Harvest fleet',
      exact: true,
    })

    await page.evaluate(() => {
      window.empireScene.setOutcome('uncertain')
      window.empireScene.hold()
    })
    try {
      await harvest.getByRole('button', { name: 'Review recall' }).click()
      expect(await page.evaluate(() => window.empireScene.sent)).toEqual([])
      await harvest
        .getByRole('button', { name: 'Recall fleet', exact: true })
        .click()
      await expect(
        harvest.getByRole('button', { name: 'Recall requested', exact: true }),
      ).toBeDisabled()
      expect(
        await page.evaluate(() =>
          window.empireScene.sent.map(({ command }) => command),
        ),
      ).toEqual([
        { type: 'World', action: { type: 'RecallMission', fleet: id(30) } },
      ])
    } finally {
      await page.evaluate(() => window.empireScene.release())
    }
  })
