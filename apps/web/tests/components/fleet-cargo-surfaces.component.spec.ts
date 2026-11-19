import { test, expect, type Locator } from './fixture'

import type {} from './empire.scenarios'
import { empireFixture, id } from '../../src/test-support/empire'

for (const screen of ['overview', 'fleets'] as const)
  test(`${screen} shows current carried resources instead of the old launch cargo`, async ({
    page,
    mount,
  }) => {
    const now = new Date('2026-10-24T12:00:00Z')
    await page.setViewportSize({ width: 390, height: 1000 })
    const options = empireFixture(now.getTime())
    const base = options.missions.fleets[0]
    const cases = [
      {
        mission: 'Transport',
        leg: 'Outbound',
        cargo: {
          metal: '1250000000',
          crystal: '2000000',
          deuterium: '3500000',
        },
      },
      {
        mission: 'Deploy',
        leg: 'Outbound',
        cargo: { metal: '4000000', crystal: '5000000', deuterium: '6000000' },
      },
      {
        mission: 'Attack',
        leg: 'Returning',
        cargo: {
          metal: '9223372036854775807',
          crystal: '8000000',
          deuterium: '9000000',
        },
      },
      {
        mission: 'Transport',
        leg: 'Returning',
        cargo: {
          metal: '11000000',
          crystal: '12000000',
          deuterium: '13000000',
        },
      },
      {
        mission: 'Deploy',
        leg: 'Returning',
        cargo: { metal: '0', crystal: '0', deuterium: '0' },
      },
    ] as const
    options.missions.fleets = cases.map(({ mission, leg, cargo }, index) => ({
      ...base,
      id: id(300 + index),
      intent: {
        ...base.intent,
        mission,
        cargo: {
          metal: '999000000',
          crystal: '999000000',
          deuterium: '999000000',
        },
      },
      leg,
      cargo,
      can_recall: leg === 'Outbound',
    }))

    await page.addInitScript(
      (input) => {
        window.empireInput = input
      },
      {
        screen,
        sampledAt: now.getTime(),
        bodies: options.bodies,
        missions: options.missions,
      },
    )
    await mount('empire')
    const verifyCargo = async (container: Locator, index: number) => {
      const cargo = container.getByRole('group', { name: 'Carried resources' })
      await expect(cargo).toHaveCount(1)
      for (const [resource, value] of Object.entries(cases[index].cargo)) {
        const title = resource[0].toUpperCase() + resource.slice(1)
        const quantity = cargo.locator(`[title="${title}"]`)
        await expect(quantity.getByRole('img', { name: title })).toBeVisible()
        await expect(quantity).toHaveText(
          (BigInt(value) / 1000000n).toLocaleString('en-US'),
        )
      }
      await expect(cargo).not.toContainText('999')
      expect(
        await container.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true)
    }

    if (screen === 'overview') {
      const board = page.getByRole('region', {
        name: 'Fleet movements',
        exact: true,
      })
      for (const [index, entry] of cases.entries()) {
        const row = board.getByRole('listitem').filter({
          has: page.getByRole('link', {
            name: `View ${entry.mission} ${entry.leg.toLowerCase()} fleet`,
            exact: true,
          }),
        })
        await verifyCargo(row, index)
      }
    } else {
      const cards = page
        .getByRole('article')
        .filter({ has: page.getByRole('group', { name: 'Carried resources' }) })
      await expect(cards).toHaveCount(5)
      for (let i = 0; i < cases.length; i++) await verifyCargo(cards.nth(i), i)
      await expect(
        page
          .getByRole('article', { name: /^Incoming .* fleet$/ })
          .getByRole('group', { name: 'Carried resources' }),
      ).toHaveCount(0)
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
      await cards
        .nth(2)
        .getByRole('link', { name: /^View .* fleet$/ })
        .click()
      await expect(page.getByLabel('Scene destination')).toContainText(
        '/fleets/' + options.missions.fleets[2].id,
      )
      await verifyCargo(
        page.getByRole('article', { name: 'Attack fleet', exact: true }),
        2,
      )
    }
  })
