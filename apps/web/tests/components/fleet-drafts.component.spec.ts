import { test, expect } from './fixture'
import { setDestination } from '../fixtures/coordinates'
import { id, originId, colonyId, player } from './dispatch-data'
import {
  setup,
  snapshot,
  counts,
  hold,
  release,
  review,
  selectBody,
  selectDestinationPlanet,
} from './dispatch-driver'

test.afterEach(async ({ page }) => {
  const unexpected = await page.evaluate(
    () => window.dispatchScene?.snapshot().unexpected ?? [],
  )
  expect(unexpected, 'unexpected Dispatch feature port operations').toEqual([])
})

test('an edited historical attack can deploy to its own colony with the new origin, cargo and approved quote', async ({
  page,
  mount,
}) => {
  await setup(page, mount, { variant: 'historical' })
  await expect(
    page.getByRole('radio', { name: 'Attack', exact: true }),
  ).toBeChecked()
  await page.getByRole('radio', { name: 'Deploy', exact: true }).check()
  await selectDestinationPlanet(page, colonyId)
  await page.getByLabel('Small Cargo · 2 available').fill('1')
  await page.getByRole('textbox', { name: 'Metal', exact: true }).fill('42')
  await review(page).click()
  const panel = page.getByRole('region', { name: 'Fleet quote' })
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(panel).toBeVisible()
    expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
      true,
    )
  }
  await panel.getByRole('button', { name: /^Deploy to / }).click()
  await expect.poll(async () => (await snapshot(page)).launches).toBe(1)
  expect((await snapshot(page)).lastLaunch).toMatchObject({
    type: 'LaunchFleet',
    expected_terms_hash: 'b'.repeat(64),
    intent: {
      mission: 'Deploy',
      origin: originId,
      destination: {
        type: 'Body',
        id: colonyId,
        expected_owner: player,
        expected_kind: 'Planet',
      },
      cargo: { metal: '42000000', crystal: '0', deuterium: '0' },
    },
  })
  await expect(page.getByLabel('Small Cargo · 2 available')).toHaveValue('0')
})

test('a changed funding body discards pending review, ships and cargo while preserving the destination and mission', async ({
  page,
  mount,
}) => {
  await setup(page, mount)
  await hold(page, 'FleetQuote')
  try {
    await page.getByRole('radio', { name: 'Espionage', exact: true }).check()
  await setDestination(page, { galaxy: '1', system: '1', position: '1' })
  await page.getByLabel('Espionage Probe · 1 available').fill('1')
  await page.getByRole('textbox', { name: 'Metal', exact: true }).fill('42')
    await review(page).click()
    await expect(review(page)).toHaveCount(0)
    await expect(page.getByRole('button',{name:'Reviewing…'})).toBeDisabled()
    await expect.poll(async () => (await snapshot(page)).calls.some(query =>
      query.type === 'FleetQuote' && query.intent.origin === originId && query.intent.mission === 'Espionage' &&
      query.intent.cargo.metal === '42000000' && query.intent.ships.some(stack => stack.ship_type === 'EspionageProbe' && stack.count === '1')
    )).toBe(true)
    await selectBody(page, id(6))
    await expect(
      page.getByRole('radio', { name: 'Espionage', exact: true }),
    ).toBeChecked()
    await expect(
      page.getByLabel('Destination coordinates', { exact: true }),
    ).toHaveValue('1:1:1')
    await expect(page.getByLabel(/^Small Cargo · .* available/)).toHaveValue(
      '0',
    )
    await expect(
      page.getByRole('textbox', { name: 'Metal', exact: true }),
    ).toHaveValue('0')
  } finally {
    await release(page)
  }
  await expect(page.getByRole('region', { name: 'Fleet quote' })).toHaveCount(0)
  await page.getByRole('radio', { name: 'Transport', exact: true }).check()
  await selectDestinationPlanet(page, originId)
  await expect(page.getByLabel('Destination preview')).toContainText(
    'Your Homeworld',
  )
  expect((await counts(page)).launches).toBe(0)
})
