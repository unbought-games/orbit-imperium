import { test, expect } from './fixtures/test'
import {
  installGameFixture,
  body,
  binding,
  id,
  matchesFixtureGameplay,
  routeWorld,
} from './fixtures/game'
import { withGalaxyResponse } from './fixtures/galaxy'
import { withFixtureResponse } from './fixtures/responses'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import type { components } from '../src/contracts'
import content from '../../../rules/content/missile-warfare.json' with { type: 'json' }

type S = components['schemas']
const target = {
  id: id(20),
  expected_kind: 'Planet',
  expected_owner: id(21),
} as const
const at = { galaxy: 1, system: 371, position: 3 }
const intent: S['MissileIntent4'] = {
  origin: body.id,
  target,
  count: '2',
  primary: 'RocketLauncher',
}
const hash = 'b'.repeat(64)
const flightId = id(51)

// The predecessor used its #373 response-readiness repair.
test('Galaxy launches two reviewed missiles and opens the new outgoing flight', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 })
  const missiles: S['MissileFlightView4'][] = []
  const quotes: S['MissileIntent4'][] = []
  const commands: S['ForegroundAction4'][] = []
  const inventory = {
    item: { kind: 'Missile', id: 'InterplanetaryMissile' } as const,
    count: '10',
  }
  const now = Date.now()
  const api = '/api/v4/universes/' + binding.universe
  const silo = { occupied: '20', reserved: '0', total: '40' }
  let revision = 1
  await installGameFixture(page, {
    protocol: 4,
    viewerRevision: () => String(revision),
    missiles,
    bodies: [
      {
        ...body,
        levels: { ...body.levels, MissileSilo: 4 },
        silo,
        inventories: [...body.inventories, inventory],
      },
    ],
    catalog: [
      {
        key: { kind: 'Defense', id: 'RocketLauncher' },
        body_kinds: ['Planet'],
        enabled: true,
        mobile: false,
        requirements: [],
      },
    ],
    extraCapabilities: ['Missiles', 'Attack'],
    research: [{ research: 'ImpulseDrive', level: 5 }],
  })
  await routeWorld(page, async (route) => {
    const query: S['WorldQuery4'] = route.request().postDataJSON()
    const common = {
      protocol: 4,
      binding,
      request_id: query.context.request_id,
      viewer_revision: String(revision),
      sampled_at: now,
      as_of_ms: now,
    }
    if (query.type === 'MissileQuote') {
      quotes.push(query.intent)
      const data: S['MissileTerms4'] = {
        intent: query.intent,
        source_coordinates: body.coordinates,
        target_coordinates: at,
        interceptor_body: target.id,
        distance: 0,
        range: 24,
        duration_ms: 6000,
        weapons: 0,
        speed: 5,
        rules: content.rules as S['MissileRules4'],
        profile_hash: 'a'.repeat(64),
        terms_hash: hash,
      }
      return route.fulfill({ json: { ...common, data } })
    }
    if (
      query.type !== 'Galaxy' ||
      query.galaxy !== at.galaxy ||
      query.system !== at.system
    )
      return route.fallback()
    const data: S['GalaxySystem4'] = {
      galaxy: at.galaxy,
      system: at.system,
      observed_at: now,
      positions: Array.from({ length: 15 }, (_, i) => ({
        coordinates: { ...at, position: i + 1 },
        debris: null,
        body:
          i + 1 === at.position
            ? {
                id: target.id,
                kind: 'Planet',
                owner: target.expected_owner,
                name: 'Bastion',
                activity: { type: 'None' },
                inactivity: 'Active',
                vacation: false,
                attack_blocker: null,
                espionage_eligible: true,
              }
            : null,
      })),
    }
    await route.fulfill({ json: { ...common, data } })
  })
  await page.route(
    (url) => url.pathname === api + '/commands',
    async (route) => {
      const request = route.request()
      if (request.method() !== 'POST') return route.fallback()
      const pair = request.postDataJSON()
      if (
        !matchesFixtureGameplay(pair) ||
        pair.gameplay.command.type !== 'World' ||
        pair.gameplay.command.action.type !== 'LaunchMissiles'
      )
        return route.fallback()
      commands.push(pair)
      expect(pair.presence.command).toEqual({
        type: 'World',
        action: {
          type: 'RecordForegroundPresence',
          cause: 'GameplayGesture',
          body: body.id,
          paired_command_id: pair.gameplay.command_id,
        },
      })
      expect(pair.gameplay.command.action).toEqual({
        type: 'LaunchMissiles',
        intent,
        expected_terms_hash: hash,
      })
      missiles.push({
        id: flightId,
        attacker: binding.player,
        origin: body.coordinates,
        target: at,
        target_body: target.id,
        target_kind: 'Planet',
        count: intent.count,
        arrival_at: now + 6000,
        outgoing: true,
      })
      inventory.count = '8'
      silo.occupied = '16'
      revision++
      await route.fulfill({
        json: {
          protocol: 4,
          binding,
          command_id: pair.gameplay.command_id,
          admitted_at: now,
          executed_at: now,
          status: 'Committed',
          result_ids: [],
          minimum_viewer_revision: String(revision),
        },
      })
    },
  )
  const path = '/u/andromeda/b/' + body.id
  await withGalaxyResponse(page, () => page.goto(path + '/galaxy'))
  const actions = page.getByRole('button', {
    name: 'Actions for [1:371:3]',
    exact: true,
  })
  const launchItem = page.getByRole('menuitem', {
    name: 'Launch missiles',
    exact: true,
  })
  const dialog = page.getByRole('dialog', {
    name: 'Launch missiles',
    exact: true,
  })
  await expect(launchItem).toBeHidden()
  await actions.press('Enter')
  await launchItem.press('Enter')
  await expect(dialog.getByLabel('Missile quantity')).toHaveValue('1')
  await page.keyboard.press('Escape')
  await expect(actions).toBeFocused()
  await actions.press('Enter')
  await launchItem.press('Enter')
  await dialog.getByLabel('Missile quantity').fill('2')
  await dialog.getByLabel('Primary defense').selectOption('RocketLauncher')
  await withFixtureResponse(
    page,
    (r) =>
      new URL(r.url()).pathname === api + '/world' &&
      r.request().method() === 'POST' &&
      r.request().postDataJSON().type === 'MissileQuote',
    () => dialog.getByRole('button', { name: 'Review missile launch' }).click(),
  )
  expect(quotes).toEqual([intent])
  expect(commands).toEqual([])
  await expect(
    dialog
      .getByText('Flight time', { exact: true })
      .locator('..')
      .locator('dd'),
  ).toHaveText('6s')
  await expect(
    dialog.getByText('Range', { exact: true }).locator('..').locator('dd'),
  ).toHaveText('0 / 24 systems')
  await diagnosticScreenshot(page, {
    path: 'test-results/missile-screenshots/launch-review-390x900.png',
  })
  await withFixtureResponse(
    page,
    (r) =>
      new URL(r.url()).pathname === api + '/commands' &&
      r.request().method() === 'POST' &&
      r.request().postDataJSON().gameplay?.command?.action?.type ===
        'LaunchMissiles',
    () =>
      dialog
        .getByRole('button', { name: 'Launch missiles — no recall' })
        .click(),
  )
  await expect(dialog.getByRole('status')).toHaveText(
    'Missiles launched. Track their arrival in Fleets.',
  )
  await page.keyboard.press('Escape')
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Empire', exact: true })
    .click()
  const outbound = page
    .getByRole('region', { name: 'Fleet movements' })
    .getByRole('listitem', { name: 'Outgoing missile attack', exact: true })
  const destination = path + '/fleets/' + flightId
  await expect(
    outbound.getByRole('link', { name: 'View missile attack details' }),
  ).toHaveAttribute('href', destination)
  await expect(
    outbound.getByRole('group', { name: 'Carried resources' }),
  ).toHaveCount(0)
  await outbound.getByText('Cannot be recalled.', { exact: true }).click()
  await expect(page).toHaveURL(destination)
  const detail = page.getByRole('article', {
    name: 'Outgoing missile attack',
    exact: true,
  })
  await expect(detail).toContainText('2 Interplanetary Missiles')
  await expect(detail).toContainText('Cannot be recalled.')
  await expect(
    detail.getByRole('link', { name: 'View destination [1:371:3] in galaxy' }),
  ).toBeVisible()
  await expect(detail.getByRole('button', { name: /recall/i })).toHaveCount(0)
  await expect(
    page.getByRole('region', { name: 'Empire fleet traffic' }),
  ).toHaveCount(0)
  expect(commands).toHaveLength(1)
})
