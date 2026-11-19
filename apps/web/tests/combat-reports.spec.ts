import { mkdirSync } from 'node:fs'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { smallCombatObservation } from './fixtures/small-combat-observation'
import { test, expect, type Page } from './fixtures/test'
import { shellFixture, installGameFixture, binding, id } from './fixtures/game'
import { withFixtureResponse } from './fixtures/responses'
import { combatObservation } from './fixtures/combat-observation'
import { reportPath } from './fixtures/report-path'

const combatGame = {
  protocol: 4,
  extraCapabilities: ['Reports', 'Attack', 'Harvest'],
  missions: {
    fleets: [],
    incoming: [],
    score_value_micro: '0',
    fleet_slots: '0',
  },
} satisfies Parameters<typeof installGameFixture>[1]

async function openCombat(
  page: Page,
  payload: typeof smallCombatObservation | ReturnType<typeof combatObservation>,
  initiallyRead: boolean,
) {
  const header = {
    id: id(62),
    kind: 'Combat',
    observed_at: payload.at,
    read: initiallyRead,
    hidden: false,
  }
  await page.route(
    `**/api/v4/universes/${binding.universe}/reports/${header.id}`,
    (route) =>
      route.fulfill({
        json: {
          protocol: 4,
          binding,
          request_id: route.request().postDataJSON().request_id,
          viewer_revision: header.read && !initiallyRead ? '2' : '1',
          sampled_at: Date.now(),
          as_of_ms: Date.now(),
          data: { header, payload, player_names: { [id(9)]: 'Vega' } },
        },
      }),
  )
  if (!initiallyRead) {
    await page.route(
      `**/api/v4/universes/${binding.universe}/reports/read`,
      (route) => {
        const { context, reports } = route.request().postDataJSON()
        expect(reports).toEqual([header.id])
        header.read = true
        return route.fulfill({
          json: { ...context, viewer_revision: '2', items: [header] },
        })
      },
    )
  }
  await withFixtureResponse(
    page,
    (response) =>
      new URL(response.url()).pathname ===
        `/api/v4/universes/${binding.universe}/reports/${header.id}` &&
      response.request().method() === 'POST',
    () => page.goto(reportPath(header.id)),
  )
}

test('combat small report preserves layout and contextual navigation', async ({
  page,
}) => {
  const screenshots = process.env.ORBIT_TEST_SCREENSHOTS === '1'
  const output = 'test-results/combat-redesign'
  if (screenshots) mkdirSync(output, { recursive: true })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.clock.setFixedTime(new Date('2026-10-22T18:00:00Z'))
  await shellFixture(page, combatGame)
  await openCombat(page, smallCombatObservation, false)
  const report = page.getByRole('region', { name: 'Report observation' })
  await expect(report.getByRole('heading', { level: 2 })).toHaveText(
    '✓ Victory',
  )
  const debris = report
    .getByRole('heading', { name: 'Debris created', exact: true })
    .locator('..')
  await expect(
    debris.getByRole('img', { name: 'Deuterium', exact: true }),
  ).toHaveCount(0)
  const identity = report.locator('header').first().locator('p').first()
  const targetName = 'Nova Roma · '
  await expect(identity).toContainText(`${targetName}[1:372:10]`)
  await expect(
    identity.getByRole('link', { name: 'View target [1:372:10] in galaxy' }),
  ).toHaveAttribute('href', /galaxy\?galaxy=1&system=372&position=10/)
  const forces = report.getByRole('region', { name: 'Forces and losses' })
  const attacker = forces.getByRole('article').nth(0)
  const defender = forces.getByRole('article').nth(1)
  await expect(
    defender.getByRole('rowgroup').filter({ hasText: 'Ships' }),
  ).toContainText('Light Fighter')
  await expect(
    defender.getByRole('rowgroup').filter({ hasText: 'Defenses' }),
  ).toContainText('Rocket Launcher')
  await expect(
    attacker.getByRole('rowheader', { name: 'Defenses', exact: true }),
  ).toHaveCount(0)
  await expect(
    defender.getByRole('link', {
      name: 'View defender location [1:372:10] in galaxy',
    }),
  ).toBeVisible()
  await expect(defender).toContainText(`${targetName}[1:372:10]`)
  await expect(attacker).toContainText('Origin · ')
  await expect(attacker).toContainText('(Moon) · [2:24:5]')
  await expect(
    attacker.getByRole('link', {
      name: 'View attacker origin [2:24:5] in galaxy',
    }),
  ).toHaveAttribute('href', /galaxy=2&system=24&position=5&target=moon/)
  await expect(page.getByText('Dispatches from the frontier.')).toHaveCount(0)
  await expect(
    report.getByText('Your cargo lost', { exact: true }),
  ).toHaveCount(0)
  await expect(
    report
      .locator('details')
      .filter({ has: page.locator('summary', { hasText: /^Round/ }) }),
  ).toHaveCount(2)
  await expect(
    report.getByRole('heading', { name: 'Vega profile details', exact: true }),
  ).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  expect(
    await report
      .locator('table')
      .evaluateAll((tables) =>
        tables.every(
          (table) => table.scrollWidth <= table.parentElement!.clientWidth,
        ),
      ),
  ).toBe(true)
  await diagnosticScreenshot(page, {
    path: `${output}/small-full.png`,
    fullPage: true,
  })
  await diagnosticScreenshot(forces, {
    path: `${output}/small-forces-1440.png`,
  })
  await report.locator('details').first().locator('summary').click()
  await diagnosticScreenshot(report.locator('details').first(), {
    path: `${output}/small-round.png`,
  })
  const attack = report.getByRole('article', {
    name: 'Round 1 Attacker You',
    exact: true,
  })
  await expect(attack.getByText('Shots fired', { exact: true })).toBeVisible()
  await expect(
    report.getByText(/Per-player damage is unavailable/),
  ).toHaveCount(0)
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await expect(report.getByRole('heading', { level: 2 })).toBeVisible()
    await expect(identity).toContainText(`${targetName}[1:372:10]`)
    if (screenshots) {
      if (width === 390 || width === 320) {
        await forces.evaluate((el) =>
          window.scrollTo(
            0,
            window.scrollY + el.getBoundingClientRect().top - 80,
          ),
        )
        await diagnosticScreenshot(forces, {
          path: `${output}/small-forces-${width}.png`,
        })
        await defender.evaluate((el) => el.scrollIntoView({ block: 'center' }))
        await diagnosticScreenshot(page, {
          path: `${output}/small-grouped-${width}x1000.png`,
        })
      }
      await page.evaluate(() => window.scrollTo(0, 0))
      await diagnosticScreenshot(page, {
        path: `${output}/small-${width}.png`,
        fullPage: true,
      })
    }
  }
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    const link = attacker.getByRole('link', {
      name: 'View attacker origin [2:24:5] in galaxy',
    })
    await link.click({ button: 'right' })
    await expect(
      page.getByRole('menuitem', { name: 'Copy coordinates', exact: true }),
    ).toBeVisible()
    await diagnosticScreenshot(page, {
      path: `${output}/origin-actions-${width}.png`,
    })
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu')).toHaveCount(0)
  }
  await attacker
    .getByRole('link', { name: 'View attacker origin [2:24:5] in galaxy' })
    .click()
  await expect(page).toHaveURL(
    /galaxy\?galaxy=2&system=24&position=5&target=moon/,
  )
})

test('deuterium-only combat debris prepares a Harvest dispatch', async ({
  page,
}) => {
  await installGameFixture(page, combatGame)
  await openCombat(page, combatObservation(false, true), true)
  const debris = page
    .getByRole('heading', { name: 'Debris created', exact: true })
    .locator('..')
  await expect(
    debris.getByRole('img', { name: 'Deuterium', exact: true }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Prepare harvest', exact: true })
    .click()
  await expect(page).toHaveURL(/dispatch/)
  await expect(page.getByRole('radio', { checked: true })).toHaveValue(
    'Harvest',
  )
})
