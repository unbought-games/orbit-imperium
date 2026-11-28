import { test, expect } from './fixture'
import {
  setup,
  review,
  selectBody,
  selectDestinationPlanet,
  snapshot,
  configure,
  hold,
  release,
} from './dispatch-driver'
import { body, id, binding } from '../../src/test-support/empire'
import type { EmpireSceneInput } from './empire-runtime'
import type {} from './empire.scenarios'

const moon = {
  ...body,
  id: id(80),
  kind: 'Moon' as const,
  name: 'Luna',
  moon: { parent: body.id, created_at: 1000 },
  inventories: [
    { item: { kind: 'Ship' as const, id: 'SmallCargo' as const }, count: '2' },
  ],
}
test('a delivered transport at shared coordinates preserves distinct planet and moon map destinations', async ({
  page,
  mount,
}) => {
  const at = body.coordinates
  const input: EmpireSceneInput = {
    bodies: [moon, { ...body, name: 'Terra' }],
    deliveredReport: {
      kind: 'Delivered',
      at: 1000,
      sender: binding.player,
      recipient: binding.player,
      origin: at,
      target: at,
      origin_name: 'Terra',
      target_name: 'Luna',
      origin_kind: 'Planet',
      target_kind: 'Moon',
      cargo: { metal: '1000000000', crystal: '0', deuterium: '1000000000' },
    },
  }
  await page.addInitScript((input) => {
    window.empireInput = input
  }, input)
  await mount('empire')
  const report = page.getByRole('region', { name: 'Report observation' })
  await expect(report).toContainText('Luna')
  const target = report.getByRole('link', {
    name: 'View destination [1:371:12] in galaxy',
    exact: true,
  })
  const origin = report.getByRole('link', {
    name: 'View origin [1:371:12] in galaxy',
    exact: true,
  })
  await expect(origin).not.toHaveAttribute('href', /target=moon/)
  await expect(target).toHaveAttribute('href', /target=moon/)
  await target.click()
  await expect(page.getByLabel('Scene destination')).toHaveText(
    new RegExp('/b/' + moon.id + '/galaxy.*target=moon'),
  )
})

test('a lunar Dispatch launch uses the local inventory and resolves the colocated home planet independently', async ({
  page,
  mount,
}) => {
  await setup(page, mount)
  const view = (await snapshot(page)).view
  const knownMoon = {
    ...view.bodies[1],
    kind: 'Moon' as const,
    name: 'Luna',
    coordinates: view.bodies[0].coordinates,
    moon: { parent: view.bodies[0].id, created_at: 1000 },
    colony: undefined,
  }
  await page.evaluate(
    (bodies) => window.dispatchScene!.configure({ view: { bodies } }),
    [view.bodies[0], knownMoon],
  )
  await selectBody(page, knownMoon.id)
  await page.getByLabel('Small Cargo · 2 available').fill('1')
  await selectDestinationPlanet(page, view.bodies[0].id)
  await expect(page.getByLabel('Destination preview')).toContainText(
    'Your Homeworld',
  )
  await review(page).click()
  const quote = page.getByRole('region', { name: 'Fleet quote' })
  await quote.getByRole('button', { name: /^Transport to / }).click()
  await expect.poll(async () => (await snapshot(page)).launches).toBe(1)
  expect((await snapshot(page)).lastLaunch?.intent).toMatchObject({
    origin: knownMoon.id,
    destination: {
      type: 'Body',
      id: view.bodies[0].id,
      expected_kind: 'Planet',
      expected_owner: view.binding.player,
    },
    ships: [
      { owner: view.binding.player, ship_type: 'SmallCargo', count: '1' },
    ],
  })
  await selectBody(page, view.bodies[0].id)
  await selectDestinationPlanet(page, knownMoon.id)
  await expect(page.getByLabel('Destination preview')).toContainText(
    'Your moon',
  )
})

test('hostile lunar Attack defers to the reviewed quote while Espionage exposes the known protection', async ({
  page,
  mount,
}) => {
  await setup(page, mount)
  await configure(page, {
    observedMoon: true,
    blocker: 'BeginnerProtected',
    quoteError: 'BeginnerProtected',
  })
  await page.getByRole('radio', { name: 'Attack', exact: true }).check()
  const input = page.getByLabel('Destination coordinates', { exact: true })
  await input.evaluate((el) => {
    const data = new DataTransfer()
    data.setData(
      'text/plain',
      location.origin + '/u/andromeda/location/1:1:1?target=moon',
    )
    el.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    )
  })
  await expect(page.getByLabel('Destination preview')).toContainText('Selene')
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Beginner protection prevents this mission' }),
  ).toHaveCount(0)
  await expect(review(page)).toBeEnabled()
  await hold(page, 'FleetQuote')
  try {
    await review(page).click()
    await expect
      .poll(async () =>
        (await snapshot(page)).calls
          .filter((q) => q.type === 'FleetQuote')
          .at(-1),
      )
      .toMatchObject({
        type: 'FleetQuote',
        intent: {
          mission: 'Attack',
          destination: {
            type: 'Body',
            id: id(70),
            expected_kind: 'Moon',
            expected_owner: id(30),
          },
        },
      })
  } finally {
    await release(page)
  }
  await expect(page.getByRole('alert')).toContainText(
    'Beginner protection prevents this mission',
  )
  await expect(page.getByRole('region', { name: 'Fleet quote' })).toHaveCount(0)
  await page.getByRole('radio', { name: 'Espionage', exact: true }).check()
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Beginner protection prevents this mission' }),
  ).toBeVisible()
  expect((await snapshot(page)).launches).toBe(0)
})
