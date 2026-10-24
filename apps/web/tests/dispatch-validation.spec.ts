import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { test, expect, type Page, type Route } from './fixtures/test'
import { shellFixture, body, binding, id } from './fixtures/game'
import type { components } from '../src/contracts'
type S = components['schemas']

async function setup(page: Page) {
  const colony = {
    ...body,
    id: id(6),
    coordinates: { galaxy: 1, system: 1, position: 2 },
  }
  await shellFixture(page, {
    protocol: 4,
    bodies: [body, colony],
    extraCapabilities: ['Attack', 'Espionage', 'Harvest'],
    catalog: [
      {
        key: { kind: 'Ship', id: 'SmallCargo' },
        requirements: [],
        enabled: true,
        mobile: true,
        body_kinds: ['Planet'],
      },
    ],
  })
  const state = {
    blocker: null as S['GameError4'] | null,
    quoteError: null as S['GameError4'] | null,
    launchError: 'BeginnerProtected' as S['GameError4'],
    resolves: 0,
    quotes: 0,
    launches: 0,
    hold: null as ((route: Route) => Promise<void>) | null,
  }
  await page.route('**/world', async (route) => {
    const query = route.request().postDataJSON()
    const observedBlocker = state.blocker
    if (state.hold) await state.hold(route)
    let data
    if (query.type === 'Galaxy') {
      data = {
        galaxy: query.galaxy,
        system: query.system,
        observed_at: 1000,
        positions: Array.from({ length: 15 }, (_, i) => ({
          coordinates: {
            galaxy: query.galaxy,
            system: query.system,
            position: i + 1,
          },
          body:
            i === 0
              ? {
                  id: id(20),
                  kind: 'Planet',
                  owner: id(30),
                  activity: { type: 'None' },
                  inactivity: 'Active',
                  vacation: false,
                  espionage_eligible: true,
                  attack_blocker: observedBlocker,
                }
              : null,
          debris: null,
        })),
      }
    } else if (query.type === 'ResolveDestination') {
      state.resolves++
      const own = query.selection.coordinates.position === 2
      data =
        query.selection.type === 'DebrisAt'
          ? {
              type: 'Debris',
              coordinates: query.selection.coordinates,
              field_identity: id(40),
            }
          : {
              type: 'Body',
              id: own ? colony.id : id(20),
              expected_kind: 'Planet',
              expected_owner: own ? binding.player : id(30),
            }
    } else {
      state.quotes++
      if (state.quoteError)
        return route.fulfill({
          status: 422,
          json: { code: 'GameRejected', game_code: state.quoteError },
        })
      data = {
        intent: query.intent,
        profile_hash: 'a'.repeat(64),
        distance: 1000,
        speeds: [],
        duration_ms: 100000,
        fuel: '1000000',
        capacity: '5000000000',
        maximum_payload: '4999000000',
        slot_limit: '1',
        terms_hash: 'b'.repeat(64),
      }
    }
    await route.fulfill({
      json: {
        protocol: 4,
        binding,
        request_id: query.context.request_id,
        viewer_revision: '1',
        sampled_at: Date.now(),
        as_of_ms: Date.now(),
        data,
      },
    })
  })
  await page.route('**/commands', async (route) => {
    const pair = route.request().postDataJSON()
    state.launches++
    await route.fulfill({
      json: {
        protocol: 4,
        binding,
        command_id: pair.gameplay.command_id,
        admitted_at: Date.now(),
        executed_at: Date.now(),
        status: 'Rejected',
        code: state.launchError,
      },
    })
  })
  await page.goto(`/u/andromeda/b/${body.id}/dispatch`)
  await expect(page.locator('main h1')).toHaveText('Dispatch')
  await page.getByLabel('Small Cargo · 2 available').fill('1')
  return state
}

const review = (page: Page) =>
  page.getByRole('button', { name: 'Review fleet', exact: true })
const mission = (page: Page) =>
  page.getByRole('combobox', { name: 'Mission', exact: true })

test('coordinate errors appear beside entry before review, including pasted emoji and ranges', async ({
  page,
}) => {
  const state = await setup(page)
  const position = page.getByLabel('Position', { exact: true })
  for (const value of [
    '🏎️',
    '1🏎️',
    '1.5',
    '1e1',
    '0',
    '-1',
    '16',
    '9007199254740993',
    '',
  ]) {
    await position.fill(value)
    await expect(position).toHaveAttribute('aria-invalid', 'true')
    await expect(position).toHaveAccessibleDescription(
      /position number from 1 to 15/,
    )
    await expect(review(page)).toBeDisabled()
  }
  await position.fill('1')
  await page.getByLabel('System', { exact: true }).fill('500')
  await expect(
    page.getByLabel('System', { exact: true }),
  ).toHaveAccessibleDescription('Enter a system number from 1 to 499.')
  await page.getByLabel('Galaxy', { exact: true }).fill('2')
  await expect(
    page.getByLabel('Galaxy', { exact: true }),
  ).toHaveAccessibleDescription('Enter a galaxy number from 1 to 1.')
  await position.fill('🏎️')
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await diagnosticScreenshot(page, {
      path: `test-results/dispatch-validation-${width}.png`,
      fullPage: true,
    })
  }
  expect(state.resolves).toBe(0)
  expect(state.quotes).toBe(0)
  await page.getByLabel('Galaxy', { exact: true }).fill('1')
  await page.getByLabel('System', { exact: true }).fill('499')
  await position.fill('15')
  await expect(review(page)).toBeEnabled()
  await expect(position).toHaveAttribute('aria-invalid', 'false')
})

test('own-planet attack is actionable, while transport to another owned planet and own-position harvest stay available', async ({
  page,
}) => {
  const state = await setup(page)
  await page.getByLabel('Position', { exact: true }).fill('2')
  await mission(page).selectOption('Attack')
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'You cannot attack your own planet' }),
  ).toContainText('use Transport')
  await expect(review(page)).toBeDisabled()
  expect(state.quotes).toBe(0)
  await mission(page).selectOption('Transport')
  await review(page).click()
  await expect(page.getByRole('region', { name: 'Fleet quote' })).toBeVisible()
  await page.getByRole('button', { name: 'Edit mission' }).click()
  await mission(page).selectOption('Harvest')
  await page
    .getByLabel('System', { exact: true })
    .fill(String(body.coordinates.system))
  await page
    .getByLabel('Position', { exact: true })
    .fill(String(body.coordinates.position))
  await expect(review(page)).toBeEnabled()
  await review(page).click()
  await expect(page.getByRole('region', { name: 'Fleet quote' })).toBeVisible()
})

test('protection is explained before review, rechecked at review, and launch races have readable receipts', async ({
  page,
}) => {
  const state = await setup(page)
  state.blocker = 'BeginnerProtected'
  await mission(page).selectOption('Attack')
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Beginner protection prevents' }),
  ).toBeVisible()
  expect(state.quotes).toBe(0)
  await page.setViewportSize({ width: 390, height: 900 })
  await diagnosticScreenshot(page, {
    path: 'test-results/dispatch-protection-mobile.png',
    fullPage: true,
  })
  state.quoteError = 'BeginnerProtected'
  await review(page).click()
  await expect(
    page.getByRole('alert').filter({ hasText: 'Beginner protection prevents' }),
  ).toBeVisible()
  await expect(page.getByRole('region', { name: 'Fleet quote' })).toHaveCount(0)
  // The observation is advisory: a newer valid quote can supersede a stale blocker.
  state.quoteError = null
  await review(page).click()
  await expect(page.getByRole('region', { name: 'Fleet quote' })).toBeVisible()
  await page.getByRole('button', { name: /^Send / }).click()
  await expect(
    page.getByRole('region', { name: 'Dispatch receipt' }),
  ).toContainText('Fleet not sent: Beginner protection prevents')
  expect(state.launches).toBe(1)
  await expect(page.getByLabel('Small Cargo · 2 available')).toHaveValue('1')
})

test('fresh destination ownership is checked even when it was not in the owned-planet view', async ({
  page,
}) => {
  await setup(page)
  await mission(page).selectOption('Attack')
  await page.route('**/world', async (route) => {
    const q = route.request().postDataJSON()
    if (q.type !== 'ResolveDestination') return route.fallback()
    await route.fulfill({
      json: {
        protocol: 4,
        binding,
        request_id: q.context.request_id,
        viewer_revision: '1',
        sampled_at: Date.now(),
        as_of_ms: Date.now(),
        data: {
          type: 'Body',
          id: id(20),
          expected_kind: 'Planet',
          expected_owner: binding.player,
        },
      },
    })
  })
  await review(page).click()
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'You cannot attack your own planet' }),
  ).toBeVisible()
  await expect(page.getByRole('region', { name: 'Fleet quote' })).toHaveCount(0)
})

test('late eligibility and quote failures cannot overwrite an edited destination', async ({
  page,
}) => {
  const state = await setup(page)
  let release!: () => void
  let held = false
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  state.blocker = 'BeginnerProtected'
  state.hold = async (route) => {
    const q = route.request().postDataJSON()
    if (q.type === 'Galaxy' && q.system === 1) {
      held = true
      await gate
    }
  }
  await mission(page).selectOption('Attack')
  await expect.poll(() => held).toBe(true)
  await page.getByLabel('System', { exact: true }).fill('2')
  const lateObservation = page.waitForResponse(
    (r) =>
      r.url().endsWith('/world') &&
      r.request().postDataJSON().type === 'Galaxy' &&
      r.request().postDataJSON().system === 1,
  )
  release()
  state.blocker = null
  await lateObservation
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Beginner protection prevents' }),
  ).toHaveCount(0)
  let releaseQuote!: () => void
  let quoteHeld = false
  const quoteGate = new Promise<void>((resolve) => {
    releaseQuote = resolve
  })
  state.quoteError = 'TargetVacation'
  state.hold = async (route) => {
    if (route.request().postDataJSON().type === 'FleetQuote') {
      quoteHeld = true
      await quoteGate
    }
  }
  await review(page).click()
  await expect.poll(() => quoteHeld).toBe(true)
  await page.getByLabel('Position', { exact: true }).fill('3')
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith('/world') &&
      r.request().postDataJSON().type === 'FleetQuote',
  )
  releaseQuote()
  await response
  await expect(review(page)).toBeEnabled()
  await expect(
    page.getByRole('alert').filter({ hasText: 'vacation mode' }),
  ).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Fleet quote' })).toHaveCount(0)
})
