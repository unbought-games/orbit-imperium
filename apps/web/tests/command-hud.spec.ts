import { routeProgressionOptions } from './fixtures/progression-options'
import { expect, test, type Page } from './fixtures/test'
import {
  installGameFixture,
  binding,
  body,
  id,
  refreshGame,
} from './fixtures/game'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import observation from '../../../contracts/fixtures/espionage-expanded.json' with { type: 'json' }
import type { components } from '../src/contracts'
import {
  withBootstrapResponse,
  withFixtureResponse,
  withReportListResponse,
  withReportResponse,
} from './fixtures/responses'
type S = components['schemas']
const output = 'test-results/live-hud'
const baseTime = 1793120000000
const emptyMissions = (): S['MissionView4'] => ({
  fleets: [],
  incoming: [],
  fleet_slots: '8',
  score_value_micro: '0',
})

test('desktop orb anchors its panel across shell widths and preserves its open report on mobile', async ({
  page,
}) => {
  const sizes = [
    [768, 600],
    [1024, 768],
    [1440, 900],
    [2560, 1440],
    [3440, 1440],
  ]
  await page.setViewportSize({ width: 768, height: 600 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const f = await intelligenceFixture(page)
  f.headers.push({
    id: id(850),
    kind: 'Espionage',
    observed_at: baseTime,
    read: false,
    hidden: false,
  })
  await withBootstrapResponse(page, () =>
    page.goto(`/u/andromeda/b/${body.id}/overview`),
  )
  const orb = page.getByTestId('command-orb')
  await expect(orb).toHaveAttribute('data-tone', 'champagne')
  await expect(orb).toHaveAttribute('aria-haspopup', 'dialog')
  await expect(orb).toHaveAttribute('aria-expanded', 'false')
  const panel = page.getByRole('dialog', {
    name: 'Command uplink',
    exact: true,
  })
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height })
    const bounds = (await orb.boundingBox())!
    const content = (await page.getByRole('main').boundingBox())!
    const shell = (await page.locator('[data-has-command-hud]').boundingBox())!
    const orbRight = bounds.x + bounds.width
    expect(bounds.width).toBe(92)
    expect(orbRight).toBeLessThanOrEqual(shell.x + shell.width - 28)
    expect(orbRight).toBeGreaterThan(shell.x + shell.width - 52)
    if (width >= 1440)
      expect(bounds.x).toBeGreaterThan(content.x + content.width + 16)
    expect(bounds.y + bounds.height).toBeLessThan(height - 28)
    await orb.focus()
    await page.keyboard.press('Enter')
    await expect(
      panel.getByRole('heading', { name: 'Command uplink' }),
    ).toBeFocused()
    await expect(orb).toHaveAttribute('aria-expanded', 'true')
    const panelBox = (await panel.boundingBox())!
    expect(panelBox.x + panelBox.width - orbRight).toBeGreaterThanOrEqual(0)
    expect(panelBox.x + panelBox.width - orbRight).toBeLessThan(4)
    expect(panelBox.y).toBeGreaterThanOrEqual(0)
    expect(panelBox.y + panelBox.height).toBeLessThan(bounds.y)
    await page.keyboard.press('Escape')
    await expect(panel).toHaveCount(0)
    await expect(orb).toBeFocused()
  }
  const instance = await orb.elementHandle()
  await orb.click()
  await panel.getByRole('button', { name: /Espionage report/ }).click()
  const detail = page.getByRole('dialog', {
    name: 'Espionage report',
    exact: true,
  })
  await expect(
    detail.getByRole('group', { name: 'Resource amounts' }),
  ).toBeVisible()
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(detail).toBeVisible()
    expect(await instance!.evaluate((el) => el.isConnected)).toBe(true)
    expect(await page.evaluate(() => document.body.style.position)).toBe(
      'fixed',
    )
    await page.setViewportSize({ width, height })
    await expect(detail).toBeVisible()
  }
  await page.keyboard.press('Escape')
  await expect(detail).toHaveCount(0)
  await expect(orb).toBeFocused()
  await expect(orb).toHaveAttribute('aria-expanded', 'false')
  expect(await page.evaluate(() => document.body.style.position)).toBe('')
  await expect(orb).toHaveAttribute('data-tone', 'ice')
  await instance!.dispose()
})

async function intelligenceFixture(
  page: Page,
  bodies: S['BodyV3'][] = [body],
  destinations: S['Destination'][] = [],
  playerNames?: S['PublicPlayerNames4'],
) {
  let revision = 1
  const missions = emptyMissions()
  const headers: S['ReportHeader4'][] = []
  const conversations: S['SocialConversation'][] = []
  const circulars: S['SocialCircular'][] = []
  const reads: string[] = []
  await installGameFixture(page, {
    protocol: 4,
    bodies,
    destinations,
    playerNames,
    missions,
    sampledAt: baseTime,
    viewerRevision: () => String(revision),
    hasUnreadReports: () => headers.some((h) => !h.read && !h.hidden),
    extraCapabilities: ['Reports', 'Espionage', 'Attack'],
  })
  await page.route('**/api/**/reports', (route) => {
    const { context, cursor, filter, kind } = route.request().postDataJSON()
    const rows = headers.filter(
      (h) =>
        (!filter || h.hidden === filter.hidden) &&
        (!filter?.unread_only || !h.read) &&
        (!filter?.starred_only || h.starred) &&
        (!kind || h.kind === kind),
    )
    const start = cursor ? rows.findIndex((h) => h.id === cursor) + 1 : 0
    const hasMore = start + 50 < rows.length
    return route.fulfill({
      json: {
        protocol: 4,
        ...context,
        viewer_revision: String(revision),
        sampled_at: baseTime,
        as_of_ms: baseTime,
        data: {
          items: rows.slice(start, start + 50),
          unread_count: Math.min(
            99,
            headers.filter((h) => !h.hidden && !h.read).length,
          ),
          has_more: hasMore,
          next_cursor: hasMore ? rows[start + 49].id : null,
          as_of_ms: baseTime,
        },
      },
    })
  })
  await page.route('**/api/**/reports/*', (route) => {
    const context = route.request().postDataJSON()
    const report = route.request().url().split('/').at(-1)!
    const header = headers.find((h) => h.id === report)
    return route.fulfill({
      json: {
        protocol: 4,
        ...context,
        viewer_revision: String(revision),
        sampled_at: baseTime,
        as_of_ms: baseTime,
        data: { header, payload: observation },
      },
    })
  })
  await page.route('**/social/query', (route) => {
    const { context, query } = route.request().postDataJSON()
    return route.fulfill({
      json: {
        ...context,
        conversations: query.type === 'Conversations' ? conversations : [],
        circulars: query.type === 'Circulars' ? circulars : [],
        messages: [],
        contacts: [],
        contact: null,
        next_cursor: null,
      },
    })
  })
  await page.route('**/social/commands', (route) => {
    const { command_id, action } = route.request().postDataJSON()
    reads.push(action.type)
    if (action.type === 'Read') {
      const c = conversations.find((c) => c.latest.id === action.message)
      if (c) c.unread = false
    }
    if (action.type === 'ReadCircular') {
      const c = circulars.find((c) => c.id === action.circular)
      if (c) c.read = true
    }
    return route.fulfill({ json: { command_id, message: null } })
  })
  await page.route('**/commands', (route) => {
    const { gameplay } = route.request().postDataJSON()
    if (gameplay?.command?.action?.type !== 'MarkReportRead')
      return route.fallback()
    const header = headers.find((h) => h.id === gameplay.command.action.report)
    if (header) header.read = true
    reads.push('MarkReportRead')
    revision++
    return route.fulfill({
      json: {
        protocol: 4,
        binding,
        command_id: gameplay.command_id,
        status: 'Committed',
        admitted_at: baseTime,
        executed_at: baseTime,
        result_ids: [],
        minimum_viewer_revision: String(revision),
      },
    })
  })
  return {
    missions,
    headers,
    conversations,
    circulars,
    reads,
    refresh: async () => {
      revision++
      await refreshGame(page)
    },
  }
}
test('the mobile HUD keeps confirmed hostile traffic across fleet navigation until the server clears it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const f = await intelligenceFixture(page)
  await withBootstrapResponse(page, () =>
    page.goto(`/u/andromeda/b/${body.id}/overview`),
  )
  const orb = page.getByTestId('command-orb')
  await expect(orb).toHaveAttribute('data-tone', 'ice')
  f.missions.incoming.push({
    sender: id(99),
    origin: { galaxy: 1, system: 372, position: 3 },
    target: body.id,
    mission: 'Attack',
    arrival_at: baseTime + 180000,
    ships: { visibility: 'Unknown' },
  })
  await f.refresh()
  await expect(orb).toHaveAttribute('data-tone', 'red')
  const threat = page
    .getByLabel('Recent game events')
    .getByRole('button', { name: /Hostile fleet inbound/ })
  await expect(threat).toBeVisible()
  await diagnosticScreenshot(page, {
    path: `${output}/attack-toast-390x844.png`,
  })
  await threat.click()
  await expect(page.getByRole('dialog')).toContainText(
    'Ship composition unknown',
  )
  await diagnosticScreenshot(page, {
    path: `${output}/attack-open-390x844.png`,
  })
  await page.getByRole('button', { name: 'Close command HUD' }).click()
  await threat.focus()
  await page.keyboard.press('Escape')
  await expect(threat).toHaveCount(0)
  await expect(orb).toHaveAttribute('data-tone', 'red')
  await orb.click()
  await diagnosticScreenshot(page, { path: `${output}/inbox-390x844.png` })
  await page
    .getByRole('dialog')
    .getByRole('link', { name: 'All fleets', exact: true })
    .click()
  await expect(page).toHaveURL(/\/fleets\/?$/)
  await expect(orb).toHaveAttribute('data-tone', 'red')
  f.missions.incoming.length = 0
  await f.refresh()
  await expect(orb).toHaveAttribute('data-tone', 'ice')
})

test(
  'real quick-build only acknowledges committed orders and leaves rejection visible',
  { tag: '@journey' },
  async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    let reject = false
    await installGameFixture(page, {
      protocol: 4,
      missions: emptyMissions(),
      catalog: [
        {
          key: { kind: 'Building', id: 'MetalMine' },
          enabled: true,
          mobile: false,
          body_kinds: ['Planet'],
          requirements: [],
        },
      ],
    })
    await routeProgressionOptions(page, (route) => {
      const { context, request } = route.request().postDataJSON()
      return route.fulfill({
        json: {
          protocol: 4,
          ...context,
          viewer_revision: '1',
          sampled_at: Date.now(),
          as_of_ms: Date.now(),
          request,
          terms_hash: 'b'.repeat(64),
          blockers: [],
          estimates: null,
          terms: {
            type: 'Building',
            profile_hash: 'a'.repeat(64),
            body: body.id,
            building: 'MetalMine',
            action: 'Upgrade',
            source_level: 1,
            target_level: 2,
            paid: { metal: '1000000', crystal: '1000000', deuterium: '0' },
            duration_ms: 60000,
            formula: 'BuildingRedesign2011',
            facilities: [],
            required_energy: '0',
            reserve_fields: 1,
          },
        },
      })
    })
    await page.route('**/commands', (route) => {
      const { gameplay } = route.request().postDataJSON()
      if (gameplay.command.type !== 'StartUpgrade') return route.fallback()
      return route.fulfill({
        json: {
          protocol: 4,
          binding,
          command_id: gameplay.command_id,
          admitted_at: Date.now(),
          executed_at: Date.now(),
          ...(reject
            ? { status: 'Rejected', code: 'InsufficientResources' }
            : {
                status: 'Committed',
                result_ids: [id(900)],
                minimum_viewer_revision: '1',
              }),
        },
      })
    })
    await withBootstrapResponse(page, () =>
      page.goto(`/u/andromeda/b/${body.id}/resources`),
    )
    const quick = page
      .getByRole('button', { name: /Upgrade Metal Mine|Build Metal Mine/ })
      .first()
    await expect(quick).toBeEnabled()
    await quick.click()
    const toast = page
      .getByLabel('Recent game events')
      .getByRole('button', { name: /Construction started/ })
    await expect(toast).toBeVisible()
    await expect(toast).toContainText('level 2')
    await expect(page.getByTestId('command-orb')).toHaveAttribute(
      'data-tone',
      'green',
    )
    await diagnosticScreenshot(page, { path: `${output}/building-390x844.png` })
    // Reload intentionally removes ephemeral acknowledgments and restored success history is silent.
    reject = true
    await withBootstrapResponse(page, () => page.reload())
    await expect(page.getByTestId('command-orb')).toHaveAttribute(
      'data-tone',
      'ice',
    )
    await quick.click()
    await expect(page.getByLabel('Action needs attention')).toContainText(
      'rejected',
    )
    await expect(
      page.getByLabel('Recent game events').getByRole('button'),
    ).toHaveCount(0)
  },
)

test('HUD espionage attack action prepares the observed target and opens Dispatch', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const f = await intelligenceFixture(page)
  f.headers.push({
    id: id(850),
    kind: 'Espionage',
    observed_at: baseTime,
    read: false,
    hidden: false,
  })
  await withBootstrapResponse(page, () =>
    page.goto(`/u/andromeda/b/${body.id}/overview`),
  )
  await page.getByTestId('command-orb').click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Espionage report/ })
    .click()
  const panel = page.getByRole('dialog', {
    name: 'Espionage report',
    exact: true,
  })
  await expect(
    panel.getByRole('group', { name: 'Resource amounts' }),
  ).toBeVisible()
  const attack = panel.getByRole('button', { name: 'Attack', exact: true })
  await expect(attack).toBeVisible()
  const attackBox = (await attack.boundingBox())!
  expect(attackBox.y).toBeLessThan(
    (await panel
      .getByRole('heading', { name: 'Resources', exact: true })
      .boundingBox())!.y,
  )
  expect(attackBox.y + attackBox.height).toBeLessThan(844)
  await diagnosticScreenshot(page, {
    path: `${output}/report-attack-390x844.png`,
  })
  await page.setViewportSize({ width: 320, height: 740 })
  expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  )
  await expect(attack).toBeVisible()
  await diagnosticScreenshot(page, {
    path: `${output}/report-attack-320x740.png`,
  })
  await attack.click()
  await expect(page).toHaveURL(new RegExp(`/b/${body.id}/dispatch\\?`))
  const url = new URL(page.url())
  expect(Object.fromEntries(url.searchParams)).toMatchObject({
    mission: 'Attack',
    galaxy: '1',
    system: '1',
    position: '9',
    target: 'planet',
  })
  expect(
    await page.evaluate(() => history.state.dispatchObservation),
  ).toMatchObject({
    target: {
      type: 'Body',
      id: observation.target.body,
      expected_owner: observation.target.owner,
      expected_kind: observation.target.kind,
    },
    observedAt: baseTime,
  })
  await expect(panel).not.toBeVisible()
  expect(await page.evaluate(() => document.body.style.position)).toBe('')
  await expect(page.getByRole('radio', { checked: true })).toHaveValue('Attack')
  // The same action remains in the full report at desktop sizes.
  await page.setViewportSize({ width: 1440, height: 900 })
  await withReportResponse(page, id(850), () =>
    page.goto(`/u/andromeda/b/${body.id}/reports/${id(850)}`),
  )
  await expect(
    page.getByRole('button', { name: 'Attack', exact: true }),
  ).toBeVisible()
  await diagnosticScreenshot(page, {
    path: `${output}/report-attack-desktop-1440x900.png`,
  })
})

test('shared inbox removes reports deleted elsewhere from the Reports route, badge and open panel', async ({
  page,
}) => {
  const width = 390,
    height = 844
  await page.setViewportSize({ width, height })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const f = await intelligenceFixture(page)
  f.headers.push(
    ...Array.from({ length: 3 }, (_, i) => ({
      id: id(4000 + i),
      kind: 'Espionage',
      observed_at: baseTime - i,
      read: false,
      hidden: false,
    })),
    {
      id: id(4003),
      kind: 'SpyContact',
      observed_at: baseTime - 3,
      read: true,
      hidden: false,
    },
  )
  await withReportListResponse(page, () =>
    page.goto(`/u/andromeda/b/${body.id}/reports`),
  )
  await expect(
    page.getByRole('heading', { level: 1, name: 'Reports', exact: true }),
  ).toBeVisible()
  const orb = page.getByTestId('command-orb')
  const badge = page.getByTestId('unread-count')
  await expect(badge).toHaveText('3')
  await orb.click()
  const panel = page.getByRole('dialog', {
    name: 'Command uplink',
    exact: true,
  })
  await expect(
    panel.getByLabel('Intelligence list').getByRole('button'),
  ).toHaveCount(3)
  await page.getByRole('button', { name: 'Close command HUD' }).click()

  // Another session deleted the unread reports: subsequent server pages omit
  // them, but their detail headers remain cached in this client.
  f.headers.splice(0, 3)
  await f.refresh()
  await expect(page.locator('main article')).toHaveCount(1)
  await expect(badge).toHaveCount(0)
  await expect(orb).toHaveAttribute('data-tone', 'ice')
  await diagnosticScreenshot(page, {
    path: `${output}/reconciled-reports-${width}x${height}.png`,
  })
  await orb.click()
  await expect(
    panel.getByLabel('Intelligence list').getByRole('button'),
  ).toHaveCount(0)
  await expect(panel).toContainText('No new intelligence. All channels clear.')
  await diagnosticScreenshot(page, {
    path: `${output}/reconciled-empty-inbox-${width}x${height}.png`,
  })

  f.headers.unshift({
    id: id(4004),
    kind: 'Espionage',
    observed_at: baseTime + 1,
    read: false,
    hidden: false,
  })
  await f.refresh()
  await expect(badge).toHaveText('1')
  await expect(
    panel.getByLabel('Intelligence list').getByRole('button'),
  ).toHaveCount(1)
  await expect(panel).not.toContainText('All channels clear.')
  await diagnosticScreenshot(page, {
    path: `${output}/reconciled-new-report-${width}x${height}.png`,
  })
})
