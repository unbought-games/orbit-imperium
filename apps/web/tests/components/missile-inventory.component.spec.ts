import { test, expect } from './fixture'
import type {} from './progression.scenarios'
import { id } from '../../src/test-support/bootstrap'

test('missile stock and reserved capacity reach both Defense forms before an exact build and scrap', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await page.goto(
    '/?scenario=progression-detail&mode=missile-inventory&item=InterplanetaryMissile&list=yes',
  )
  await expect(page.locator('html')).toHaveAttribute(
    'data-component-ready',
    'progression-detail',
  )
  const capacity = page.getByRole('region', { name: 'Missile silo capacity' })
  await expect(capacity).toHaveCount(0)
  const pane = page.getByRole('region', { name: 'Progression quote' })
  const build = pane.getByRole('button', { name: 'Build', exact: true })
  const quantity = pane.getByLabel('Defenses quantity')
  for (const name of ['Anti Ballistic Missile', 'Interplanetary Missile']) {
    await page.getByRole('link', { name: 'Build ' + name, exact: true }).click()
    await expect(capacity.locator('dd')).toHaveText(['26', '2', '40'])
    await quantity.fill('2')
    await expect(build).toBeEnabled()
    if (name === 'Anti Ballistic Missile')
      await pane.getByRole('link', { name: 'Back to Defense' }).click()
  }
  await quantity.fill('20')
  await expect(build).toBeDisabled()
  await quantity.fill('2')
  await build.click()
  await expect(
    pane.getByRole('group', { name: 'Latest action result' }),
  ).toContainText('Order confirmed.')
  await pane.getByText('Scrap Interplanetary Missile', { exact: true }).click()
  await pane.getByLabel('Scrap quantity').fill('1')
  await pane.getByRole('button', { name: 'Scrap without refund' }).click()
  await expect(
    pane.getByRole('status').filter({ hasText: 'Missiles scrapped.' }),
  ).toBeVisible()
  expect(
    await page.evaluate(() =>
      window.progressionScene.sent.map((envelope) => envelope.command),
    ),
  ).toEqual([
    expect.objectContaining({
      type: 'StartManufacture',
      body: id(5),
      item: { kind: 'Missile', id: 'InterplanetaryMissile' },
      quantity: '2',
      expected_terms_hash: 'b'.repeat(64),
    }),
    {
      type: 'World',
      action: {
        type: 'ScrapMissiles',
        body: id(5),
        item: 'InterplanetaryMissile',
        count: '1',
      },
    },
  ])
})

test('the Missile Silo facility displays its own occupied, reserved and total slots', async ({
  page,
}) => {
  await page.goto(
    '/?scenario=progression-detail&mode=missile-inventory&item=MissileSilo',
  )
  await expect(page.locator('html')).toHaveAttribute(
    'data-component-ready',
    'progression-detail',
  )
  await expect(
    page.getByRole('heading', { name: 'Missile Silo', exact: true }).first(),
  ).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'Missile silo capacity' }).locator('dd'),
  ).toHaveText(['26', '2', '40'])
})
