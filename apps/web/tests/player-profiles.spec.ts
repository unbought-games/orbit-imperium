import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
import { openNavigation } from './fixtures/navigation'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { test, expect } from './fixtures/test'
import type { components } from '../src/contracts'
import {
  shellFixture,
  playerProfilesFixture,
  binding,
  body,
  id,
} from './fixtures/game'

async function inspectIdentity(page: Page, screen: string, name: string) {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    const trigger = page.getByRole('button', { name: `${name} profile details` }).first()
    await trigger.click()
    const popup = page.getByRole('dialog', { name: `${name} profile` })
    await expect(popup).toBeVisible()
    await expect(popup).not.toContainText('Activity')
    await diagnosticScreenshot(page, { path: `test-results/profile-${screen}-${width}x1000.png` })
    await page.keyboard.press('Escape')
    await expect(popup).toHaveCount(0)
  }
}

test('Galaxy shows all three supporter levels and ordinary players, then removes changed and expired badges', async ({
  page,
}) => {
  await shellFixture(page, { protocol: 4 })
  await page.clock.install()
  const owners = [binding.player, id(31), id(32), id(33)]
  let tierTwo: number | undefined = 2
  let unavailable = false
  await playerProfilesFixture(page, () =>
    unavailable
      ? null
      : [
          { player: owners[0], username: 'MyCommander', supporter_tier: 1 },
          {
            player: owners[1],
            username: 'RoseCommander',
            supporter_tier: tierTwo,
          },
          {
            player: owners[2],
            username: 'ApricotCommander',
            supporter_tier: 3,
          },
          { player: owners[3], username: 'RegularCommander' },
        ],
  )
  await page.route('**/world', (route) => {
    const q = route.request().postDataJSON()
    return route.fulfill({
      json: {
        protocol: 4,
        binding,
        request_id: q.context.request_id,
        viewer_revision: '1',
        sampled_at: Date.now(),
        as_of_ms: Date.now(),
        data: {
          galaxy: q.galaxy,
          system: q.system,
          observed_at: Date.now(),
          positions: Array.from({ length: 15 }, (_, i) => ({
            coordinates: {
              galaxy: q.galaxy,
              system: q.system,
              position: i + 1,
            },
            body:
              i < owners.length
                ? {
                    id: id(40 + i),
                    kind: 'Planet',
                    owner: owners[i],
                    activity: { type: 'None' },
                    inactivity: 'Active',
                    vacation: false,
                    espionage_eligible: true,
                  }
                : null,
            debris: null,
          })),
        },
      },
    })
  })
  await page.goto(`/u/andromeda/galaxy?body=${body.id}`)
  const cards = page
    .getByRole('region', { name: 'Galaxy positions' })
    .getByRole('listitem')
  for (const [i, color] of [
    'rgb(133, 214, 239)',
    'rgb(240, 172, 212)',
    'rgb(242, 187, 131)',
  ].entries()) {
    await expect(
      cards.nth(i).getByRole('img', { name: /Supporter/ }),
    ).toBeVisible()
    await expect(
      cards.nth(i).getByRole('img', { name: /Supporter/ }),
    ).toHaveCSS('color', color)
  }
  await expect(cards.nth(3)).toContainText('RegularCommander')
  await expect(
    cards.nth(3).getByRole('img', { name: /Supporter/ }),
  ).toHaveCount(0)
  await openNavigation(page)
  await expect(page.getByLabel('Username', { exact: true }).filter({ visible: true })).toContainText(
    'MyCommander',
  )
  await expect(
    page
      .getByLabel('Username', { exact: true }).filter({ visible: true })
      .getByRole('img', { name: /Supporter/ }),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await diagnosticScreenshot(page, {
      path: `test-results/public-supporters-${width}.png`,
      fullPage: true,
    })
  }
  tierTwo = undefined
  await page.clock.fastForward(60_000)
  await expect(
    cards.nth(1).getByRole('img', { name: /Supporter/ }),
  ).toHaveCount(0)
  await expect(cards.nth(1)).toContainText('RoseCommander')
  unavailable = true
  await page.clock.fastForward(301_000)
  await expect(page.getByRole('img', { name: /Supporter/ })).toHaveCount(0)
  await expect(cards).toHaveCount(15)
})

test('incoming fleets and overview arrivals identify the same supporter', async ({
  page,
}) => {
  await shellFixture(page, {
    protocol: 4,
    missions: {
      fleets: [],
      incoming: [
        {
          sender: id(31),
          origin: { galaxy: 1, system: 2, position: 3 },
          target: body.id,
          mission: 'Attack',
          arrival_at: Date.now() + 600_000,
          ships: { visibility: 'Unknown' },
        },
      ],
      fleet_slots: '1',
      score_value_micro: '0',
    },
  })
  await playerProfilesFixture(page, () => [
    { player: id(31), username: 'Visitor', supporter_tier: 3 },
  ])
  await page.reload()
  const arrivals = page.getByRole('region', { name: 'Fleet movements' })
  await expect(arrivals.getByText('Visitor', { exact: true })).toBeVisible()
  await expect(arrivals.getByRole('img', { name: /Supporter/ })).toBeVisible()
  await inspectIdentity(page, 'empire', 'Visitor')
  await page.goto(`/u/andromeda/b/${body.id}/fleets`)
  const incoming = page.getByRole('region', { name: 'Incoming fleets' })
  await expect(incoming.getByText('Visitor', { exact: true })).toBeVisible()
  await expect(incoming.getByRole('img', { name: /Supporter/ })).toBeVisible()
  await inspectIdentity(page, 'fleets', 'Visitor')
})

test('espionage and combat observations use current public identities without changing historical facts', async ({
  page,
}) => {
  await shellFixture(page, { protocol: 4 })
  await playerProfilesFixture(page, () => [
    { player: id(31), username: 'Observer', supporter_tier: 2 },
    { player: id(32), username: 'Defender' },
  ])
  let payload: components['schemas']['ReportPayload4'] = {
    kind: 'SpyContact',
    at: Date.now(),
    probability_ppm: 0,
    detected: false,
    sender: id(31),
    origin: { galaxy: 1, system: 1, position: 1 },
    target: { galaxy: 1, system: 1, position: 2 },
  }
  await page.route(`**/api/**/reports/${id(80)}`, (route) => {
    const context = route.request().postDataJSON()
    return route.fulfill({
      json: {
        protocol: 4,
        binding,
        request_id: context.request_id,
        viewer_revision: '1',
        sampled_at: Date.now(),
        as_of_ms: Date.now(),
        data: {
          header: {
            id: id(80),
            kind: payload.kind,
            observed_at: Date.now(),
            read: false,
            hidden: false,
          },
          payload,
        },
      },
    })
  })
  // Start identity assertions after their own profile response, not a cold route load.
  const reportProfiles = () => page.waitForResponse(response => {
    if (!response.url().endsWith('/player-profiles') || response.status() !== 200) return false
    const source = response.request().postDataJSON()?.source
    return source?.type === 'Report' && source.report === id(80)
  })
  await Promise.all([
    reportProfiles(),
    page.goto(`/u/andromeda/b/${body.id}/reports/${id(80)}`),
  ])
  const observation = page.getByRole('region', { name: 'Report observation' })
  await expect(observation.getByText('Observer', { exact: true })).toBeVisible()
  await expect(
    observation.getByRole('img', { name: /Supporter/ }),
  ).toBeVisible()
  await inspectIdentity(page, 'spy-contact', 'Observer')
  payload = {
    kind: 'Espionage',
    observed_at: Date.now(),
    resources: { visibility: 'Unknown' },
    fleet: { visibility: 'Unknown' },
    defenses: { visibility: 'Unknown' },
    buildings: { visibility: 'Unknown' },
    research: { visibility: 'Unknown' },
    activity: { type: 'None' },
    counterespionage: { probability_ppm: 0, detected: false },
    target: {
      owner: id(31),
      body: id(50),
      kind: 'Planet',
      coordinates: { galaxy: 1, system: 1, position: 2 },
    },
  }
  await Promise.all([reportProfiles(), page.reload()])
  await expect(observation.getByText('Observer', { exact: true })).toBeVisible()
  await inspectIdentity(page, 'espionage', 'Observer')
  payload = {
    kind: 'Combat',
    at: Date.now(),
    target: { galaxy: 1, system: 1, position: 2 },
    gross_losses: [],
    recovered: [],
    debris: { metal: '0', crystal: '0', deuterium: '0' },
    loot: { metal: '0', crystal: '0', deuterium: '0' },
    mission: 'Attack',
    outcome: 'Draw',
    participants: [
      {
        owner: id(31),
        side: 'Attacker',
        units: [],
        origin: { Fleet: id(50) },
        technology: [0, 0, 0],
      },
      {
        owner: id(32),
        side: 'Defender',
        units: [],
        origin: { Stationed: id(51) },
        technology: [0, 0, 0],
      },
    ],
    survivors: [
      { owner: id(31), side: 'Attacker', units: [], origin: { Fleet: id(50) } },
    ],
    rounds: [],
  }
  await Promise.all([reportProfiles(), page.reload()])
  await expect(
    observation
      .getByRole('region', { name: 'Forces and losses' })
      .getByText('Observer', { exact: true }),
  ).toBeVisible()
  await expect(
    observation.getByRole('heading', { name: 'Defender profile details', exact: true }),
  ).toBeVisible()
  await expect(observation.getByRole('img', { name: /Supporter/ })).toHaveCount(
    1,
  )
  await expect(observation.getByRole('heading', { name: /Draw/ })).toBeVisible()
  await inspectIdentity(page, 'combat', 'Observer')
})

for (const width of [1440, 390]) {
  test(`bot display follows public profiles across screens at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await shellFixture(page, { protocol: 4, missions: {
      fleets: [], incoming: [{ sender: id(31), origin: { galaxy: 1, system: 2, position: 3 }, target: body.id, mission: 'Attack', arrival_at: Date.now() + 600_000, ships: { visibility: 'Unknown' } }], fleet_slots: '1', score_value_micro: '0',
    } })
    let kind: 'bot' | 'human' = 'bot'
    await playerProfilesFixture(page, () => [
      { player: id(31), username: 'Harvester', kind },
      { player: binding.player, username: 'Commander', kind: 'human' },
    ])
    await page.route('**/rankings', route => route.fulfill({ json: {
      binding, request_id: route.request().postDataJSON().request_id,
      sampled_at: Date.now(), processing_pending: false,
      players: [{ player: id(31), username: 'Harvester', points: '12500', rank: 1 }],
    } }))
    await page.route('**/world', route => {
      const q = route.request().postDataJSON()
      return route.fulfill({ json: { protocol: 4, binding, request_id: q.context.request_id,
        viewer_revision: '1', sampled_at: Date.now(), as_of_ms: Date.now(), data: {
          galaxy: q.galaxy, system: q.system, observed_at: Date.now(),
          positions: Array.from({ length: 15 }, (_, i) => ({
            coordinates: { galaxy: q.galaxy, system: q.system, position: i + 1 },
            body: i === 0 ? { id: id(40), kind: 'Planet', owner: id(31), activity: { type: 'None' }, inactivity: 'Active', vacation: false, espionage_eligible: true } : null,
            debris: null,
          })),
        },
      } })
    })
    const payload = { kind: 'SpyContact', at: Date.now(), probability_ppm: 0, detected: false, sender: id(31), origin: { galaxy: 1, system: 1, position: 1 }, target: { galaxy: 1, system: 1, position: 2 } }
    await page.route(`**/api/**/reports/${id(80)}`, route => route.fulfill({ json: {
      protocol: 4, binding, request_id: route.request().postDataJSON().request_id,
      viewer_revision: '1', sampled_at: Date.now(), as_of_ms: Date.now(),
      data: { header: { id: id(80), kind: payload.kind, observed_at: Date.now(), read: false, hidden: false }, payload },
    } }))
    for (const display of ['visible', 'hidden'] as const) {
      kind = display === 'visible' ? 'bot' : 'human'
      for (const [screen, path] of [
        ['rankings', 'high-scores'], ['galaxy', 'galaxy?galaxy=1&system=1'],
        ['empire', `b/${body.id}/overview`], ['fleets', `b/${body.id}/fleets`],
        ['report', `b/${body.id}/reports/${id(80)}`],
      ]) {
        await page.goto(`/u/andromeda/${path}`)
        const trigger = page.getByRole('button', { name: 'Harvester profile details' }).first()
        await expect(trigger).toBeVisible()
        await expect(trigger.getByLabel('Bot', { exact: true })).toHaveCount(display === 'visible' ? 1 : 0)
        await diagnosticScreenshot(page, { path: `test-results/bot-${screen}-${display}-${width}x1000.png` })
        await trigger.click()
        const profile = page.getByRole('dialog', { name: 'Harvester profile' })
        await expect(profile).toBeVisible()
        if (display === 'visible') await expect(profile).toContainText('Automated player')
        else {
          await expect(profile).toContainText('Commander')
          await expect(profile).not.toContainText(/automated|\bBot\b/i)
        }
        if (screen === 'rankings') await diagnosticScreenshot(page, { path: `test-results/bot-profile-${display}-${width}x1000.png` })
        await page.keyboard.press('Escape')
      }
    }
    // A running screen also removes the label on the next authoritative profile refresh.
    kind = 'bot'
    await page.goto('/u/andromeda/high-scores')
    const trigger = page.getByRole('button', { name: 'Harvester profile details' })
    await expect(trigger.getByLabel('Bot', { exact: true })).toBeVisible()
    kind = 'human'
    await page.evaluate(() => window.dispatchEvent(new Event('pageshow')))
    await expect(trigger.getByLabel('Bot', { exact: true })).toHaveCount(0)
    await expect(trigger).toContainText('Harvester')
  })
}

test('player attachments align together and long identities stay within narrow rows', async ({ page }) => {
  await shellFixture(page, { protocol: 4, missions: { fleets: [], incoming: [], fleet_slots: '1', score_value_micro: '0' } })
  const alliance = { id: id(85), universe: binding.universe, name: 'Starward', tag: 'STAR' }
  const insignia = {
    recipe: { version: 1, symbol: 'compass', foreground: '#cbb68d', background: '#152b40' },
    asset_url: `/api/media/insignias/compass/${'a'.repeat(64)}.svg`,
  }
  await page.route(`**${insignia.asset_url}`, route => route.fulfill({
    contentType: 'image/svg+xml',
    body: readFileSync('crates/application/assets/insignias/compass.svg'),
  }))
  const players = [
    { player: id(31), username: 'steveish', kind: 'bot' },
    { player: id(32), username: 'Aurelia', kind: 'bot', supporter_tier: 2, insignia, alliance },
    { player: id(33), username: 'CommanderBeyondTheFarthestStars', supporter_tier: 3, insignia, alliance },
  ]
  await playerProfilesFixture(page, () => players)
  await page.route('**/rankings', route => route.fulfill({ json: {
    binding, request_id: route.request().postDataJSON().request_id,
    sampled_at: 1792843200000, baseline_at: 1792756800000, processing_pending: false,
    players: players.map((player, i) => ({ player: player.player, username: player.username, alliance: player.alliance, points: `${100 - i}`, rank: [123, 1234, 12345][i], previous_rank: [null, 1334, 12245][i] })),
  } }))
  await page.goto(`/u/andromeda/high-scores?body=${body.id}`)
  const table = page.getByRole('table', { name: 'Universe total-score rankings' })
  const trigger = table.getByRole('button', { name: 'Aurelia profile details' })
  await expect(trigger.getByRole('img', { name: /Supporter/ })).toBeVisible()
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    const simple = table.getByRole('button', { name: 'steveish profile details' })
    const name = await simple.getByText('steveish', { exact: true }).boundingBox()
    const bot = await simple.getByLabel('Bot', { exact: true }).boundingBox()
    expect(name).not.toBeNull()
    expect(bot).not.toBeNull()
    // Short identities stay centered on one line even in the narrow table.
    expect(Math.abs(name!.y + name!.height / 2 - bot!.y - bot!.height / 2)).toBeLessThan(1)
    await expect(simple.getByLabel('Bot', { exact: true })).toHaveCSS('font-size', '12px')
    for (const player of players) {
      const identity = table.getByRole('button', { name: `${player.username} profile details` })
      const cell = identity.locator('..')
      const bounds = await cell.boundingBox()
      const parts = await identity.locator('span, svg').evaluateAll(elements => elements.map(element => {
        const rect = element.getBoundingClientRect()
        return { left: rect.left, right: rect.right }
      }))
      for (const part of parts) {
        expect(part.left).toBeGreaterThanOrEqual(bounds!.x)
        expect(part.right).toBeLessThanOrEqual(bounds!.x + bounds!.width)
      }
    }
    const rankCells = table.getByRole('row').filter({ has: page.getByRole('cell') }).locator('td:first-child')
    for (const rankCell of await rankCells.all()) {
      const { right, contentRight } = await rankCell.evaluate(cell => {
        const range = document.createRange()
        range.selectNodeContents(cell)
        return { right: cell.getBoundingClientRect().right, contentRight: range.getBoundingClientRect().right }
      })
      expect(contentRight).toBeLessThanOrEqual(right)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    if (width === 1440) {
      const centers = await trigger.locator(':scope > span > *').evaluateAll(elements => elements.map(element => {
        const rect = element.getBoundingClientRect()
        return rect.y + rect.height / 2
      }))
      expect(Math.max(...centers) - Math.min(...centers)).toBeLessThan(1)
    }
    if (width < 1440) await table.scrollIntoViewIfNeeded()
    await diagnosticScreenshot(page, { path: `test-results/player-alignment-rankings-${width}x1000.png` })
    if (width !== 320) {
      if (width === 1440) await trigger.focus()
      else await trigger.click()
      const popup = page.getByRole('dialog', { name: 'Aurelia profile' })
      await expect(popup).toBeVisible()
      await diagnosticScreenshot(page, { path: `test-results/player-alignment-profile-${width}x1000.png` })
      await page.keyboard.press('Escape')
      await expect(popup).toHaveCount(0)
    }
  }
})
