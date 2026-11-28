import type { Response } from '@playwright/test'
import type { components } from '../src/contracts'
import {
  withFixtureResponse,
  withFixtureResponseStatus,
  withReportResponse,
} from './fixtures/responses'

import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { test, expect } from './fixtures/test'
import {
  fixtureReportContext,
  fixtureReportPath,
  routeWorld,
  installGameFixture,
  refreshGame,
  binding,
  body,
  id,
} from './fixtures/game'

import observation from '../../../contracts/fixtures/espionage-expanded.json' with { type: 'json' }

import { catalog } from './fixtures/simulation-observation-catalog'

type S = components['schemas']

function estimateGate(speed: number, duration?: number) {
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  return { speed, duration, release, pending, requestId: '' }
}

function fleetRead(
  type: 'FleetQuote' | 'FleetEstimate',
  speed: number,
  requestId?: string,
) {
  return (response: Response) => {
    if (
      !response.url().endsWith('/world') ||
      response.request().method() !== 'POST'
    )
      return false
    const payload = response.request().postDataJSON()
    return (
      payload.type === type &&
      payload.intent.speed_percent === speed &&
      (requestId === undefined || payload.context.request_id === requestId)
    )
  }
}

test('prepares an editable observed-planet attack with advisory hypothetical estimates and authoritative launch validation', async ({
  page,
}) => {
  let revision = 1
  await installGameFixture(page, {
    protocol: 4,
    viewerRevision: () => String(revision),
    catalog,
    bodies: [
      {
        ...body,
        inventories: [
          { item: { kind: 'Ship', id: 'LightFighter' }, count: '3' },
        ],
      },
    ],
    extraCapabilities: ['Reports', 'Attack'],
  })
  const report = {
    ...observation,
    observed_at: Date.now() - 7200000,
    target: { ...observation.target, kind: 'Planet' },
  }
  const header = {
    id: id(63),
    kind: 'Espionage',
    observed_at: 6000,
    read: true,
    hidden: false,
  }
  await page.route(
    (url) => url.pathname === fixtureReportPath(header.id),
    async (route) => {
      const context = fixtureReportContext(route, header.id)
      await route.fulfill({
        json: {
          protocol: 4,
          binding,
          request_id: context.request_id,
          viewer_revision: String(revision),
          sampled_at: Date.now(),
          as_of_ms: Date.now(),
          data: { header, payload: report },
        },
      })
    },
  )
  const quotes: S['FleetIntent4'][] = []
  let launches = 0
  let held: ReturnType<typeof estimateGate> | undefined
  let changedTarget = false
  const destination: S['MissionDestination4'] = {
    type: 'Body',
    id: report.target.body,
    expected_kind: 'Planet',
    expected_owner: report.target.owner,
  }
  await routeWorld(page, async (route) => {
    const request: S['WorldQuery4'] = route.request().postDataJSON()
    const responseRevision = String(revision)
    let data: S['BoundWorld4']['data']
    if (request.type === 'ResolveDestination') {
      expect(request.selection).toMatchObject({ type: 'BodyAt', kind: 'Planet' })
      data = { ...destination, id: changedTarget ? id(91) : destination.id }
    } else if (request.type === 'Galaxy') {
      data = {
        galaxy: 1,
        system: 1,
        observed_at: 1000,
        player_names: {},
        positions: Array.from({ length: 15 }, (_, i) => ({
          coordinates: { galaxy: 1, system: 1, position: i + 1 },
          body: null,
          debris: null,
        })),
      }
    } else if (
      request.type === 'FleetQuote' ||
      request.type === 'FleetEstimate'
    ) {
      quotes.push(request.intent)
      const speed = request.intent.speed_percent
      const gate =
        request.type === 'FleetEstimate' && held?.speed === speed
          ? held
          : undefined
      const rejection =
        request.type === 'FleetEstimate' && speed === 30
          ? 'BeginnerProtected'
          : request.type === 'FleetQuote' &&
              request.intent.ships[0].count === '2'
            ? 'NoFleetSlot'
            : undefined
      if (gate) {
        held = undefined
        gate.requestId = request.context.request_id
        await gate.pending
      }
      if (rejection)
        return route.fulfill({
          status: 422,
          json: { code: 'GameRejected', game_code: rejection },
        })
      const flight = {
        intent: request.intent,
        profile_hash: 'a'.repeat(64),
        duration_ms: gate?.duration ?? Math.ceil((100000 * 100) / speed),
        fuel: '2000000',
        capacity: '5000000000',
        maximum_payload: '4998000000',
      }
      data =
        request.type === 'FleetEstimate'
          ? ({ ...flight, estimate: true } satisfies S['FleetEstimate4'])
          : ({
              ...flight,
              distance: 1000,
              speeds: [],
              slot_limit: '1',
              terms_hash: 'b'.repeat(64),
            } satisfies S['FleetTerms4'])
    } else {
      throw new Error('Unexpected world query: ' + request.type)
    }
    await route.fulfill({
      json: {
        protocol: 4,
        binding,
        request_id: request.context.request_id,
        viewer_revision: responseRevision,
        sampled_at: Date.now(),
        as_of_ms: Date.now(),
        data,
      },
    })
  })
  page.on('request', (request) => {
    if (request.url().endsWith('/commands')) launches++
  })
  await withReportResponse(page, header.id, () =>
    page.goto(`/u/andromeda/b/${body.id}/reports/${header.id}`),
  )
  await page
    .getByRole('button', { name: 'Simulate combat', exact: true })
    .click()
  const dialog = page.getByRole('dialog', { name: 'Combat simulation' })
  const ship = dialog.getByLabel('Attacker Light Fighter', { exact: true })
  const plan = dialog.getByRole('region', {
    name: 'Attack planning',
    exact: true,
  })
  const timing = plan.getByRole('region', { name: 'Flight timing' })
  await expect(plan.locator('details')).toHaveJSProperty('open', true)
  const prepare = plan.getByRole('button', { name: 'Review attack' })
  await expect(prepare).toBeDisabled()
  const planToggle = plan.locator('summary').filter({ hasText: 'Plan attack' })
  await planToggle.press('Enter')
  await expect(prepare).toBeVisible()
  await expect(prepare).toBeDisabled()
  await planToggle.press('Enter')
  await ship.fill('4')
  await expect(plan).not.toContainText('4 selected, 3 stationed')
  await expect(prepare).toBeDisabled()
  await expect(timing).toContainText('1m 40s')
  expect(quotes.at(-1)?.ships[0].count).toBe('4')
  if (process.env.ORBIT_TEST_SCREENSHOTS === '1') {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      await plan.scrollIntoViewIfNeeded()
      await diagnosticScreenshot(page, {
        path: `test-results/simulation-hypothetical-report-${width}.png`,
      })
    }
  }
  await dialog
    .getByRole('button', { name: 'Use all 3 available Light Fighter' })
    .click()
  await expect(timing).toContainText('1m 40s')
  await expect(
    timing.getByRole('img', { name: 'Deuterium', exact: true }),
  ).toBeVisible()
  await expect.poll(() => quotes.at(-1)?.ships[0].count).toBe('3')
  expect(quotes.at(-1)).toMatchObject({
    origin: body.id,
    mission: 'Attack',
    ships: [{ owner: binding.player, ship_type: 'LightFighter', count: '3' }],
    destination,
    speed_percent: 100,
  })
  await dialog
    .getByLabel('Attacker Weapons Technology', { exact: true })
    .fill('100')
  // A delayed quote must not replace a more recent speed selection.
  const speed = dialog.getByRole('slider', { name: 'Speed', exact: true })
  const delayed = estimateGate(50)
  held = delayed
  try {
    await speed.fill('50')
    await expect.poll(() => delayed.requestId).not.toBe('')
    await expect(timing).not.toContainText('1m 40s')
    if (process.env.ORBIT_TEST_SCREENSHOTS === '1') {
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 1000 })
        await plan.scrollIntoViewIfNeeded()
        await diagnosticScreenshot(page, {
          path: `test-results/simulation-report-pending-${width}.png`,
        })
      }
    }
    await withFixtureResponse(page, fleetRead('FleetEstimate', 20), () =>
      speed.fill('20'),
    )
    await expect(timing).toContainText('8m 20s')
    await withFixtureResponse(
      page,
      fleetRead('FleetEstimate', 50, delayed.requestId),
      async () => delayed.release(),
    )
    await expect(timing).toContainText('8m 20s')
    await expect(timing).not.toContainText('3m 20s')
  } finally {
    delayed.release()
  }
  // A new viewer revision retains earlier terms until its own estimate arrives.
  const revalidation = estimateGate(20, 501000)
  held = revalidation
  revision++
  try {
    await refreshGame(page)
    await expect.poll(() => revalidation.requestId).not.toBe('')
    await expect(timing).toContainText('8m 20s')
    await expect(timing).not.toContainText('Updating flight times')
    await withFixtureResponse(
      page,
      fleetRead('FleetEstimate', 20, revalidation.requestId),
      async () => revalidation.release(),
    )
    await expect(timing).toContainText('8m 21s')
  } finally {
    revalidation.release()
  }
  // Server eligibility failures remain visible, with no guessed duration or fuel.
  await withFixtureResponseStatus(
    page,
    fleetRead('FleetEstimate', 30),
    () => speed.fill('30'),
    422,
  )
  await expect(timing).toContainText(
    'Beginner protection prevents this mission',
  )
  changedTarget = true
  await dialog.getByRole('slider', { name: 'Speed', exact: true }).fill('40')
  await expect(timing).toContainText('The observed target has changed')
  changedTarget = false
  await dialog.getByRole('slider', { name: 'Speed', exact: true }).fill('60')
  await expect(timing).toContainText('2m 47s')
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await plan.scrollIntoViewIfNeeded()
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true)
    expect(
      await dialog.locator('input[id^="simulation-"]').evaluateAll((inputs) =>
        inputs.every((input) => {
          const label = input
            .parentElement!.querySelector('label')!
            .getBoundingClientRect()
          const box = input.getBoundingClientRect()
          return label.right <= box.left + 1 || label.bottom <= box.top + 1
        }),
      ),
    ).toBe(true)
    await diagnosticScreenshot(page, {
      path: `test-results/simulation-planning-${width}.png`,
      fullPage: false,
    })
  }
  await planToggle.press('Enter')
  await expect(plan.locator('details')).toHaveJSProperty('open', false)
  await expect(timing).not.toBeVisible()
  await expect(prepare).toBeEnabled()
  await page.keyboard.press('Tab')
  await expect(prepare).toBeFocused()
  await withFixtureResponse(
    page,
    (r) =>
      r.url().endsWith('/world') &&
      r.request().postDataJSON().type === 'FleetQuote',
    () => page.keyboard.press('Enter'),
  )
  const reviewPanel = page.getByRole('region', {
    name: 'Fleet quote',
    exact: true,
  })
  await expect(reviewPanel).toBeFocused()
  expect(quotes.at(-1)).toMatchObject({
    origin: body.id,
    mission: 'Attack',
    destination,
    speed_percent: 60,
    ships: [{ owner: binding.player, ship_type: 'LightFighter', count: '3' }],
  })
  expect(launches).toBe(0)
  await page.getByRole('button', { name: 'Back to edit mission' }).click()
  await expect(page.locator('main h1')).toHaveText('Dispatch')
  await expect(page).toHaveURL(
    new RegExp(`/b/${body.id}/dispatch.*mission=Attack.*target=planet`),
  )
  await expect(page.getByLabel('Light Fighter · 3 available')).toHaveValue('3')
  await expect(page.getByLabel('Speed', { exact: true })).toHaveValue('60')
  await expect(
    page.getByLabel('Destination coordinates', { exact: true }),
  ).toHaveValue('1:1:9')
  await expect(
    page.getByRole('region', { name: 'Fleet quote', exact: true }),
  ).toHaveCount(0)
  expect(launches).toBe(0)
  await expect(
    page.getByRole('region', { name: 'Flight timing' }),
  ).toContainText('2m 47s')
  await expect(page.getByLabel('Destination preview')).not.toContainText(
    'Looking up destination',
  )
  if (process.env.ORBIT_TEST_SCREENSHOTS === '1') {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      await diagnosticScreenshot(page, {
        path: `test-results/simulation-dispatch-${width}.png`,
        fullPage: true,
      })
    }
  }
  await page.getByLabel('Light Fighter · 3 available').fill('2')
  await withFixtureResponseStatus(
    page,
    fleetRead('FleetQuote', 60),
    () =>
      page.getByRole('button', { name: 'Review fleet', exact: true }).click(),
    422,
  )
  await expect(page.getByRole('alert')).toContainText(
    'All fleet slots are occupied',
  )
  expect(quotes.at(-1)?.ships).toEqual([
    { owner: binding.player, ship_type: 'LightFighter', count: '2' },
  ])
  expect(launches).toBe(0)
})
