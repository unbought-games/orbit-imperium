import { test, expect, type Page } from './fixtures/test'
import { shellFixture, binding, id } from './fixtures/game'
import { withReportResponse } from './fixtures/responses'
import { combatObservation } from './fixtures/combat-observation'
import { reportPath } from './fixtures/report-path'

async function openCombat(page: Page, deuteriumOnly = false) {
  await shellFixture(page, {
    protocol: 4,
    extraCapabilities: ['Reports', 'Attack', 'Harvest'],
    missions: {
      fleets: [],
      incoming: [],
      score_value_micro: '0',
      fleet_slots: '0',
    },
  })
  const payload = combatObservation(false, deuteriumOnly)
  const header = {
    id: id(62),
    kind: 'Combat',
    observed_at: payload.at,
    read: true,
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
          viewer_revision: '1',
          sampled_at: Date.now(),
          as_of_ms: Date.now(),
          data: { header, payload, player_names: { [id(9)]: 'Vega' } },
        },
      }),
  )
  await withReportResponse(page, header.id, () =>
    page.goto(reportPath(header.id)),
  )
}

test('combat origin menu opens the attacker moon in Galaxy', async ({
  page,
}) => {
  await openCombat(page)
  const report = page.getByRole('region', { name: 'Report observation' })
  await expect(
    report.getByRole('heading', { name: 'Vega profile details' }),
  ).toBeVisible()
  await expect(
    report.getByRole('link', { name: 'View target [1:372:10] in galaxy' }),
  ).toHaveAttribute('href', /galaxy=1&system=372&position=10/)
  await expect(
    report.getByRole('link', {
      name: 'View defender location [1:372:10] in galaxy',
    }),
  ).toBeVisible()
  const origin = report.getByRole('link', {
    name: 'View attacker origin [2:24:5] in galaxy',
  })
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await origin.click({ button: 'right' })
    await expect(
      page.getByRole('menuitem', { name: 'Copy coordinates', exact: true }),
    ).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu')).toHaveCount(0)
  }
  await origin.click()
  await expect(page).toHaveURL(
    /galaxy\?galaxy=2&system=24&position=5&target=moon/,
  )
})

test('deuterium-only combat debris prepares a Harvest dispatch', async ({
  page,
}) => {
  await openCombat(page, true)
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
