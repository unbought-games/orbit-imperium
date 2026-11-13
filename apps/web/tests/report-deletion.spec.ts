import { triageReports } from '../src/features/report-triage'
import {
  withBootstrapResponse,
  withFixtureResponse,
  withFixtureResponseStatus,
  withReportListResponse,
  withReportResponse,
} from './fixtures/responses'
import type { Response } from '@playwright/test'
import type { components } from '../src/contracts'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { test, expect, type Page } from './fixtures/test'
import { shellFixture, refreshGame, binding, body, id } from './fixtures/game'

async function selectReports(page: Page, advanceClock = false) {
  if (await page.getByRole('group', {name: 'Report selection'}).isVisible()) return
  await page.getByRole('button', {name: 'More report actions'}).click()
  if (advanceClock) await page.clock.runFor(1000)
  await page.getByRole('menuitem', {name: 'Select reports', exact: true}).click()
  if (advanceClock) await page.clock.runFor(1000)
}
async function filterStatus(page: Page, status: string) {
  await page.getByRole('button', {name: 'Filter reports', exact: true}).click()
  const dialog = page.getByRole('dialog', {name: 'Filter reports', exact: true})
  await dialog.getByRole('combobox', {name: 'Status', exact: true}).selectOption(status)
  await dialog.getByRole('button', {name: /Dismiss (sheet|popover)/}).click()
  await expect(dialog).toBeHidden()
}
async function ageCleanup(page: Page) {
  await page.getByRole('button', {name: 'More report actions'}).click()
  await page.getByRole('menuitem', {name: 'Archive…', exact: true}).click()
  await expect(page.getByRole('dialog', {name: 'Archive reports', exact: true})).toBeVisible()
}

async function reportsFixture(page: Page, quiet = false, count = 2, pageSize = 1) {
  let revision = 1
  const headers: components['schemas']['ReportHeader4'][] = [
    {
      id: id(70),
      kind: 'Espionage',
      observed_at: 1792692000000,
      read: true,
      hidden: false,
    },
    {
      id: id(71),
      kind: 'Espionage',
      observed_at: 1792691000000,
      read: false,
      hidden: false,
    },
  ]
  for (let i = 2; i < count; i++) headers.push({ ...headers[0], id: id(70 + i), observed_at: headers[0].observed_at - i * 1000000 })
  await shellFixture(page, {
    protocol: 4,
    extraCapabilities: ['Reports'],
    ...(quiet ? { missions: { fleets: [], incoming: [], score_value_micro: '0', fleet_slots: '1' } } : {}),
    hasUnreadReports: () => headers.some((r) => !r.read && !r.hidden),
    viewerRevision: () => String(revision),
  })
  const pageRequests: Array<string | null> = []
  let moreResponse: { gate: Promise<void>; fail: boolean } | undefined
  await page.route('**/api/**/reports**', async (route) => {
    const request = route.request().postDataJSON()
    const context = request.context ?? request
    const report = headers.find((r) =>
      new URL(route.request().url()).pathname.endsWith(r.id),
    )
    const filter = request.filter
    const rows = filter ? triageReports(headers, filter.sort, false, filter.unread_only ? 'unread' : filter.starred_only ? 'starred' : 'all', false, filter.hidden ? 'archived' : 'inbox', request.kind ?? 'all') : headers.filter((r) => request.include_hidden || !r.hidden)
    const index = request.cursor ? Number(request.cursor.slice(-12)) - 71 : 0
    const response = {
      json: {
        protocol: 4,
        binding,
        request_id: context.request_id,
        viewer_revision: String(revision),
        sampled_at: Date.now(),
        as_of_ms: Date.now(),
        data: report
          ? {
              header: report,
              payload: {
                kind: 'Espionage',
                observed_at: report.observed_at,
                target: {
                  body: id(80),
                  coordinates: { galaxy: 1, system: 2, position: 3 },
                  owner: id(9),
                  kind: 'Planet',
                },
                resources: { visibility: 'Unknown' },
                fleet: { visibility: 'Unknown' },
                defenses: { visibility: 'Unknown' },
                buildings: { visibility: 'Unknown' },
                research: { visibility: 'Unknown' },
                activity: { type: 'None' },
                counterespionage: { probability_ppm: 0, detected: false },
              },
            }
          : {
              unread_count: Math.min(99, headers.filter(row => !row.read && !row.hidden).length),
              items: rows.slice(index, index + pageSize),
              has_more: index + pageSize < rows.length,
              next_cursor: index + pageSize < rows.length ? id(71 + pageSize + index) : null,
              as_of_ms: Date.now(),
            },
      },
    }
    if (!report) pageRequests.push(request.cursor)
    if (!report && request.cursor && moreResponse) {
      const held = moreResponse
      moreResponse = undefined
      await held.gate
      if (held.fail)
        return route.fulfill({ status: 503, json: { code: 'Unavailable' } })
    }
    await route.fulfill(response)
  })
  let mode: 'success' | 'rejected' | 'uncertain' = 'success'
  let pause: Promise<void> | undefined
  let submitted = 0
  const readRequests: string[] = []
  await page.route('**/commands', async (route) => {
    const envelope = route.request().postDataJSON().gameplay
    expect(envelope.command.type).toBe('World')
    if (['MarkReportRead', 'MarkReportsRead'].includes(envelope.command.action.type)) {
      const ids = envelope.command.action.reports ?? [envelope.command.action.report]
      readRequests.push(...ids)
      for (const report of ids) headers.find(r => r.id === report)!.read = true
      revision++
      return route.fulfill({ json: {
        protocol: 4, binding, command_id: envelope.command_id,
        admitted_at: Date.now(), executed_at: Date.now(), status: 'Committed',
        result_ids: [], minimum_viewer_revision: String(revision),
      } })
    }
    if (envelope.command.action.type === 'SetReportStarred') {
      headers.find(r => r.id === envelope.command.action.report)!.starred = envelope.command.action.starred
      revision++
      return route.fulfill({ json: {
        protocol: 4, binding, command_id: envelope.command_id,
        admitted_at: Date.now(), executed_at: Date.now(), status: 'Committed',
        result_ids: [], minimum_viewer_revision: String(revision),
      } })
    }
    expect(['SetReportHidden', 'SetReportsHidden']).toContain(envelope.command.action.type)
    submitted++
    await pause
    if (mode === 'uncertain')
      return route.fulfill({ status: 503, json: { code: 'Unavailable' } })
    if (mode === 'success') {
      const reports = envelope.command.action.type === 'SetReportsHidden'
        ? envelope.command.action.reports : [envelope.command.action.report]
      for (const report of reports)
        headers.find((r) => r.id === report)!.hidden = envelope.command.action.hidden
      revision++
    }
    await route.fulfill({
      json: {
        protocol: 4,
        binding,
        command_id: envelope.command_id,
        admitted_at: Date.now(),
        executed_at: Date.now(),
        ...(mode === 'rejected'
          ? { status: 'Rejected', code: 'NotFound' }
          : {
              status: 'Committed',
              result_ids: [],
              minimum_viewer_revision: String(revision),
            }),
      },
    })
  })
  // Start on the canonical inbox so its redirect cannot remount the report
  // controls between focusing a button and submitting a command.
  await withFixtureResponse(page, response => response.request().method() === 'POST' && response.url().endsWith('/reports') && response.request().postDataJSON().filter?.unread_only === false, () => page.goto(`/u/andromeda/b/${body.id}/reports`))
  await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/reports`)
  await expect(page.locator('main article')).toHaveCount(count)
  return {
    headers,
    readRequests,
    pageRequests,
    bumpRevision: () => { revision++ },
    holdMore: (gate: Promise<void>, fail = false) => {
      moreResponse = { gate, fail }
    },
    setMode: (v: typeof mode) => {
      mode = v
    },
    pause: (v: Promise<void>) => {
      pause = v
    },
    submitted: () => submitted,
  }
}

for (const width of [320, 390, 800, 1440]) {
  test.describe(`archive target at ${width}px`, () => {
    test.use({ hasTouch: width < 1440 })

    test('archive and restore respond at the target edge without opening the row', async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      const fixture = await reportsFixture(page, true)
      const rows = page.locator('main article')
      const inboxUrl = page.url()
      const targetSize = width < 1440 ? 44 : 24
      const activateEdge = async (name: string) => {
        const button = page.getByRole('button', { name, exact: true }).last()
        const box = (await button.boundingBox())!
        expect(box.width).toBe(targetSize)
        expect(box.height).toBe(targetSize)
        expect(box.x + box.width).toBeLessThanOrEqual(width)
        expect((await button.locator('svg').boundingBox())!.width).toBe(16)
        // This point is outside the old 24px target on touch devices.
        const x = box.x + 2
        const y = box.y + box.height / 2
        if (width < 1440) await page.touchscreen.tap(x, y)
        else await page.mouse.click(x, y)
      }
      await diagnosticScreenshot(page, { path: `test-results/archive-target-list-${width}x900.png` })
      await activateEdge('Archive report')
      await expect.poll(() => fixture.headers[1].hidden).toBe(true)
      await expect(rows).toHaveCount(1)
      await expect(page).toHaveURL(inboxUrl)
      await page.getByRole('button', { name: 'Archived', exact: true }).click()
      await expect(rows).toHaveCount(1)
      await activateEdge('Move to inbox')
      await expect.poll(() => fixture.headers[1].hidden).toBe(false)
      await expect(rows).toHaveCount(0)
      await page.getByRole('button', { name: 'Inbox', exact: true }).click()
      await rows.first().getByRole('link', { name: 'Espionage', exact: true }).click()
      await expect(page.getByRole('region', { name: 'Report observation' })).toBeVisible()
      const archive = page.getByRole('button', { name: 'Archive report', exact: true })
      const share = page.getByRole('button', { name: 'Share report', exact: true })
      const shareBox = (await share.boundingBox())!
      const archiveBox = (await archive.boundingBox())!
      expect(archiveBox.x).toBeGreaterThanOrEqual(shareBox.x + shareBox.width)
      expect(archiveBox.x + archiveBox.width).toBeLessThanOrEqual(width)
      await archive.focus()
      await diagnosticScreenshot(page, { path: `test-results/archive-target-detail-${width}x900.png` })
      await activateEdge('Archive report')
      await expect(page).toHaveURL(inboxUrl)
      await expect(rows).toHaveCount(1)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    })
  })
}

for (const width of [1440, 390]) {
  test(`delete and restore reports persist across list, detail and reload at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    const fixture = await reportsFixture(page)
    await expect(page.getByRole('button', { name: 'Refresh reports' })).toHaveCount(0)
    await expect(page.getByLabel('Show deleted reports')).toHaveCount(0)
    await expect(page.getByText('Deleted reports leave your list and unread indicator.', { exact: false })).toHaveCount(0)
    const rows = page.locator('main article')
    await expect(rows).toHaveCount(2)
    const unread = page.getByRole('status', { name: 'Unread reports' }).first()
    await expect(unread).toBeVisible()
    await diagnosticScreenshot(page, {
      path: `test-results/reports-delete-list-${width}.png`,
      fullPage: true,
    })
    let release!: () => void
    fixture.pause(
      new Promise<void>((resolve) => {
        release = resolve
      }),
    )
    await rows.last().getByRole('button', { name: 'Archive report' }).click()
    await expect(
      rows.last().getByRole('button', { name: 'Archive report' }),
    ).toBeEnabled()
    await expect(rows).toHaveCount(1)
    await expect(page.getByText('Submitting action.', { exact: true })).toHaveCount(0)
    release()
    await expect(rows).toHaveCount(1)
    await expect(unread).toHaveCount(0)
    expect(fixture.headers[1].hidden).toBe(true)
    expect(fixture.headers[1].read).toBe(false)
    await withReportListResponse(page, () => page.reload())
    await expect(rows).toHaveCount(1)
    await withReportResponse(page, fixture.headers[1].id, () => page.goto(`/u/andromeda/b/${body.id}/reports/${fixture.headers[1].id}`))
    await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/reports/${fixture.headers[1].id}`)
    await expect(
      page.getByRole('region', { name: 'Report observation' }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Move to inbox' }),
    ).toBeVisible()
    await expect.poll(() => fixture.headers[1].read).toBe(true)
    await withReportResponse(page, fixture.headers[1].id, () => page.reload())
    await page.getByRole('button', { name: 'Move to inbox' }).click()
    await expect(
      page.getByRole('button', { name: 'Archive report' }),
    ).toBeEnabled()
    await expect(unread).toHaveCount(0)
    await page.getByRole('button', { name: 'Archive report' }).click()
    await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/reports`)
    await expect(rows).toHaveCount(1)
    await withReportResponse(page, fixture.headers[1].id, () => page.goto(`/u/andromeda/b/${body.id}/reports/${fixture.headers[1].id}`))
    await expect(page.getByRole('button', { name: 'Move to inbox' })).toBeEnabled()
    await expect(unread).toHaveCount(0)
    await diagnosticScreenshot(page, {
      path: `test-results/reports-delete-detail-${width}.png`,
      fullPage: true,
    })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    const back = page.getByRole('link', { name: 'Back to reports' })
    await expect(back).toHaveText('')
    await expect(back.locator('svg.lucide-arrow-left')).toBeVisible()
    expect((await back.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    await back.click()
    await expect(rows).toHaveCount(1)
    await withReportResponse(page, fixture.headers[1].id, () => page.goto(`/u/andromeda/b/${body.id}/reports/${fixture.headers[1].id}`))
    await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/reports/${fixture.headers[1].id}`)
    await page.getByRole('button', { name: 'Move to inbox' }).click()
    await expect(unread).toHaveCount(0)
    await page.getByRole('link', { name: 'Back to reports' }).click()
    await expect(rows).toHaveCount(2)
    expect(fixture.submitted()).toBe(4)
  })
}

test('failed and uncertain deletion roll back and offer durable recovery', async ({
  page,
}) => {
  const fixture = await reportsFixture(page)
  const row = page.locator(`main article:has(a[href$="${id(70)}"])`)
  let release!: () => void
  fixture.pause(new Promise<void>((resolve) => { release = resolve }))
  fixture.setMode('rejected')
  await row.getByRole('button', { name: 'Archive report' }).click()
  await expect(row).toHaveCount(0)
  release()
  await expect(page.getByTestId('game-error-banner')).toContainText('Action rejected: Not Found')
  await expect(row).not.toContainText('Action rejected')
  await expect(row.getByRole('button', { name: 'Archive report' })).toBeEnabled()
  expect(fixture.headers[0].hidden).toBe(false)
  fixture.setMode('uncertain')
  await row.getByRole('button', { name: 'Archive report' }).click()
  await expect(page.getByTestId('game-error-banner')).toContainText('We’re checking whether this order went through.')
  await expect(row).not.toContainText('We’re checking')
  await expect(
    row.getByRole('button', { name: 'Archive report' }),
  ).toBeDisabled()
  await expect(
    page.getByRole('button', { name: 'Retry order', exact: true }),
  ).toBeVisible()
  expect(fixture.headers[0].hidden).toBe(false)
  expect(fixture.submitted()).toBe(2)
  await withReportListResponse(page, () => page.reload())
  await expect(row).toBeVisible()
  await expect(page.getByRole('complementary', { name: 'Action needs attention' })).toHaveCount(0)
})

for (const activation of ['click', 'Enter'] as const) {
  test(`shared inbox preserves other reports during a pending deletion via ${activation}`, async ({
    page,
  }) => {
    const fixture = await reportsFixture(page)
    let release!: () => void
    fixture.pause(
      new Promise<void>((resolve) => {
        release = resolve
      }),
    )
    const row = page.locator('main article').first()
    const remove = row.getByRole('button', { name: 'Archive report' })
    try {
      if (activation === 'click') await remove.click()
      else await remove.press('Enter')
      // An empty list can also occur during navigation. Confirm the command is
      // actually held before asserting the optimistic UI and pagination lock.
      await expect.poll(fixture.submitted).toBe(1)
      expect(fixture.headers[0].hidden).toBe(false)
      await expect(page.locator('main article')).toHaveCount(1)
      await expect(page.getByTestId('unread-count')).toHaveText('1')
      await expect(page.getByRole('button', { name: 'Load more reports' })).toHaveCount(0)
    } finally {
      release()
    }
    await expect(row.getByLabel('Unread', { exact: true })).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Load more reports' }),
    ).toHaveCount(0)
    expect(fixture.headers[0].hidden).toBe(true)
  })
}


test('opening a report marks it read after loading, clears the inbox badge and does not resubmit after refresh', async ({ page }) => {
  const fixture = await reportsFixture(page)
  expect(fixture.readRequests).toEqual([])
  await expect(page.locator('main article')).toHaveCount(2)
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  let requested = false
  await page.route(`**/api/**/reports/${id(71)}`, async route => {
    requested = true
    await gate
    await route.fallback()
  })
  await page.locator('main article').last().getByRole('link', { name: 'Espionage', exact: true }).click()
  await expect.poll(() => requested).toBe(true)
  await expect(page.getByText('Fetching this report…')).toBeVisible()
  expect(fixture.readRequests).toEqual([])
  release()
  await expect(page.getByRole('region', { name: 'Report observation' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Report observation' })).toBeVisible()
  await expect.poll(() => fixture.headers[1].read).toBe(true)
  await expect(page.getByRole('status', { name: 'Unread reports' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Mark read', exact: true })).toHaveCount(0)
  expect(fixture.readRequests).toEqual([id(71)])
  await refreshGame(page)
  await withReportResponse(page, id(71), () => page.reload())
  await expect(page.getByRole('region', { name: 'Report observation' })).toBeVisible()
  await expect.poll(() => fixture.headers[1].read).toBe(true)
  expect(fixture.readRequests).toEqual([id(71)])
  await page.getByRole('link', { name: 'Back to reports' }).click()
  await page.locator('main article').first().getByRole('link', { name: 'Espionage', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Report observation' })).toBeVisible()
  await expect.poll(() => fixture.headers[1].read).toBe(true)
  expect(fixture.readRequests).toEqual([id(71)])
})

test('failed or abandoned report loads do not mark reports read', async ({ page }) => {
  const fixture = await reportsFixture(page)
  await page.route(`**/api/**/reports/${id(71)}`, route => route.fulfill({ status: 503, json: { code: 'Unavailable' } }))
  await page.goto(`/u/andromeda/b/${body.id}/reports/${id(71)}`)
  await expect(page.getByRole('button', { name: 'Retry reports' })).toBeVisible()
  expect(fixture.readRequests).toEqual([])
  let release!: () => void
  let requested = false
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.unroute(`**/api/**/reports/${id(71)}`)
  await page.route(`**/api/**/reports/${id(71)}`, async route => {
    requested = true
    await gate
    await route.fallback()
  })
  await page.getByRole('button', { name: 'Retry reports' }).click()
  await expect.poll(() => requested).toBe(true)
  const response = page.waitForResponse(response => response.url().endsWith(`/reports/${id(71)}`))
  try {
    await page.getByRole('link', { name: 'Back to reports' }).click()
    await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/reports`)
    // The URL changes before React commits the inbox and cancels the detail load.
    // Deliver the held response only after the user has actually left the report.
    await expect(page.getByRole('heading', { name: 'Reports', level: 2, exact: true })).toBeVisible()
    await expect(page.locator('main article')).toHaveCount(2)
  } finally {
    release()
  }
  await response
  await expect(page.locator('main article')).toHaveCount(2)
  expect(fixture.readRequests).toEqual([])
  expect(fixture.headers[1].read).toBe(false)
})


test('independent deletes are optimistic and each failure rolls back only its report', async ({
  page,
}) => {
  const fixture = await reportsFixture(page)
  const rows = page.locator('main article')
  let release!: () => void
  fixture.pause(
    new Promise<void>((resolve) => {
      release = resolve
    }),
  )
  fixture.setMode('rejected')
  await rows.first().getByRole('button', { name: 'Archive report' }).click()
  await expect(rows).toHaveCount(1)
  await rows.first().getByRole('button', { name: 'Archive report' }).click()
  await expect(rows).toHaveCount(0)
  await expect.poll(fixture.submitted).toBe(2)
  release()
  await expect(rows).toHaveCount(2)
  const banner = page.getByTestId('game-error-banner')
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await page.evaluate(() => window.scrollTo(0, 0))
    await diagnosticScreenshot(page, { path: `test-results/unified-older-collapsed-${width}x900.png`, fullPage: true })
  }
  await banner.getByText('1 more order needs attention').click()
  await expect(banner.getByRole('group', { name: 'Order status' })).toHaveCount(2)
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await page.evaluate(() => window.scrollTo(0, 0))
    await diagnosticScreenshot(page, { path: `test-results/unified-older-expanded-${width}x900.png`, fullPage: true })
  }
  await expect(rows.first()).not.toContainText('Action rejected')
  await expect(rows.last()).not.toContainText('Action rejected')
  await banner.getByRole('button', { name: 'Dismiss order notices' }).click()
  await expect(banner.getByRole('group', { name: 'Order status' })).toHaveCount(0)
})

test('a successful HTTP response confirms deletion before the game view refreshes', async ({
  page,
}) => {
  const fixture = await reportsFixture(page)
  await page
    .locator('main article')
    .first()
    .getByRole('link', { name: 'Espionage', exact: true })
    .click()
  await expect(
    page.getByRole('region', { name: 'Report observation' }),
  ).toBeVisible()
  let release!: () => void
  const pause = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/overview', async (route) => {
    await pause
    await route.fallback()
  })
  const row = page.getByRole('main')
  try {
    await row.getByRole('button', { name: 'Archive report' }).click()
    await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/reports`)
    await expect(page.locator('main article')).toHaveCount(1)
    expect(fixture.headers[0].hidden).toBe(true)
    await expect(page.getByText('Action committed; awaiting updated view.', { exact: true })).toHaveCount(0)
  } finally {
    release()
  }
})


test('triage selection follows filters and rejected bulk cleanup restores reports', { tag: '@journey' }, async ({ page }) => {
  const fixture = await reportsFixture(page)
  await selectReports(page)
  await expect(page.getByText('Loading reports…', {exact: true})).toHaveCount(0)
  await page.getByRole('button', { name: 'Select loaded reports (2)' }).click()
  await expect(page.getByRole('button', { name: 'Archive selected (2)' })).toBeEnabled()
  await filterStatus(page, 'unread')
  await expect(page.getByRole('button', { name: 'Archive selected (0)' })).toHaveCount(0)
  await expect(page.getByRole('group', {name: 'Report selection'})).toContainText('0 selected')
  await filterStatus(page, 'all')
  fixture.setMode('rejected')
  await page.getByRole('button', { name: 'Select loaded reports (2)' }).click()
  await page.getByRole('button', { name: 'Archive selected (2)' }).click()
  await expect(page.getByRole('article')).toHaveCount(2)
  await expect(page.getByText(/Action rejected/).first()).toBeVisible()
  expect(fixture.headers.every(r => !r.hidden)).toBe(true)
})


// Batch rejection/uncertainty permutations now mount the real cleanup hook and
// selection bar in components/report-cleanup.spec.ts. Application error banners
// and durable retry remain covered by the single/detail failure journeys above.
for (const width of [1280, 390]) {
  test(`report whitespace opens the report while controls and keyboard stay independent at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const fixture = await reportsFixture(page)
    const inbox = `/u/andromeda/b/${body.id}/reports`
    const rows = page.getByRole('article')
    // Hit the empty padding at the bottom of the row, away from the title/controls.
    const row = rows.first()
    const box = (await row.boundingBox())!
    await page.mouse.click(box.x + box.width / 2, box.y + box.height - 2)
    await expect(page).toHaveURL(`${inbox}/${id(70)}`)
    await expect(page.getByRole('region', { name: 'Report observation' })).toBeVisible()
    await page.getByRole('link', { name: 'Back to reports' }).click()
    await selectReports(page)
    await expect(rows).toHaveCount(2)
    const select = rows.first().getByRole('checkbox')
    await select.check()
    await expect(select).toBeChecked()
    await expect(page).toHaveURL(inbox)
    await select.press('Space')
    await expect(select).not.toBeChecked()
    await expect(row.getByRole('button', { name: /^(Unstar|Star) report$/ })).toHaveCount(0)
    const openTriage = () => selectReports(page)
    await row.getByRole('link', { name: 'Espionage', exact: true }).click()
    await page.getByRole('button', { name: 'Star report', exact: true }).press('Enter')
    await expect(page.getByRole('button', { name: 'Unstar report', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'Unstar report', exact: true })).toBeEnabled()
    await diagnosticScreenshot(page, { path: `test-results/report-detail-star-${width}x900.png` })
    await page.getByRole('link', { name: 'Back to reports' }).click()
    await openTriage()
    if (width >= 768) await expect(select).toBeEnabled()
    else await expect(select).toBeDisabled()
    const remove = row.getByRole('button', { name: 'Archive report', exact: true })
    await expect(remove).toBeDisabled()
    // A pointer on a disabled control must not fall through to the stretched link.
    // Hover performs scrolling, stability and hit-target checks without requiring
    // an enabled button. Forced clicks skip those checks and can hit another row.
    await remove.hover()
    await page.mouse.down()
    await page.mouse.up()
    await expect(page).toHaveURL(inbox)
    expect(fixture.submitted()).toBe(0)
    await row.getByRole('link', { name: 'Espionage', exact: true }).click()
    await page.getByRole('button', { name: 'Unstar report', exact: true }).press('Enter')
    await expect(page.getByRole('button', { name: 'Star report', exact: true })).toHaveAttribute('aria-pressed', 'false')
    await page.getByRole('link', { name: 'Back to reports' }).click()
    await openTriage()
    await expect(remove).toBeEnabled()
    // Native Tab/Enter navigation still opens the same report.
    await select.focus()
    await page.keyboard.press('Tab')
    const link = row.getByRole('link', { name: 'Espionage', exact: true })
    await expect(link).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(`${inbox}/${id(70)}`)
    await page.getByRole('link', { name: 'Back to reports' }).click()
    await rows.first().getByRole('button', { name: 'Archive report', exact: true }).click()
    await expect.poll(fixture.submitted).toBe(1)
    await expect(page).toHaveURL(inbox)
  })
}

test.describe('report touch actions', () => {
  test.use({ hasTouch: true })

  for (const width of [320, 390, 820]) {
    test(`delete edges stay independent from row navigation at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      const fixture = await reportsFixture(page)
      const inbox = `/u/andromeda/b/${body.id}/reports`
      const row = page.getByRole('article').first()
      const remove = row.getByRole('button', { name: 'Archive report', exact: true })
      await expect(row.getByRole('button', { name: /^(Unstar|Star) report$/ })).toHaveCount(0)
      await expect(remove).toBeEnabled()
      const box = (await remove.boundingBox())!
      expect(box.width).toBe(44)
      expect(box.height).toBe(44)
      expect((await remove.locator('svg').boundingBox())!.width).toBe(16)

      // Tap the expanded button corners, outside the glyph.
      fixture.setMode('rejected')
      for (const [x, y] of [[2, 2], [42, 2], [2, 42], [42, 42]]) {
        const submitted = fixture.submitted()
        await remove.tap({ position: { x, y } })
        await expect.poll(fixture.submitted).toBe(submitted + 1)
        await expect(page.getByTestId('game-error-banner')).toContainText('Action rejected: Not Found')
        await expect(row.getByRole('alert')).toHaveCount(0)
        await expect(remove).toBeEnabled()
        const removeBox = (await remove.boundingBox())!
        const rowBox = (await row.boundingBox())!
        expect(Math.abs(removeBox.x + removeBox.width - rowBox.x - rowBox.width + (width >= 768 ? 8 : 0))).toBeLessThanOrEqual(1)
        await expect(page).toHaveURL(inbox)
        expect(fixture.readRequests).toEqual([])
      }
      await diagnosticScreenshot(page, { path: `test-results/report-actions-rejected-${width}x900.png` })

      fixture.headers[0].starred = true
      fixture.headers[0].shared = true
      fixture.bumpRevision()
      await withReportListResponse(page, () => page.reload())
      await expect(remove).toBeDisabled()
      await remove.scrollIntoViewIfNeeded()
      const disabledBox = (await remove.boundingBox())!
      for (const [x, y] of [[2, 2], [42, 2], [2, 42], [42, 42]]) {
        await page.touchscreen.tap(disabledBox.x + x, disabledBox.y + y)
        await expect(page).toHaveURL(inbox)
        expect(fixture.submitted()).toBe(4)
      }

      // Shared reports can only be unstarred from their detail page.
      await row.getByRole('link', { name: 'Espionage', exact: true }).tap()
      const star = page.getByRole('button', { name: 'Unstar report', exact: true })
      await expect(star).toHaveAttribute('aria-pressed', 'true')
      await star.tap()
      const dialog = page.getByRole('dialog', { name: 'Unstar this shared report?' })
      await expect(dialog).toBeVisible()
      await diagnosticScreenshot(page, { path: `test-results/report-actions-confirm-${width}x900.png` })
      await dialog.getByRole('button', { name: 'Keep starred' }).tap()
      await expect(dialog).toBeHidden()
      expect(fixture.headers[0].starred).toBe(true)
      await star.tap()
      await dialog.getByRole('button', { name: 'Unstar report', exact: true }).tap()
      await expect.poll(() => fixture.headers[0].starred).toBe(false)
      await page.getByRole('link', { name: 'Back to reports' }).tap()
      await expect(remove).toBeEnabled()
      fixture.setMode('success')
      // Recheck target size after detail navigation before tapping its padding.
      expect((await remove.boundingBox())!.height).toBe(44)
      await remove.tap({ position: { x: 2, y: 22 } })
      await expect.poll(() => fixture.headers[0].hidden).toBe(true)
      await expect(page).toHaveURL(inbox)
      expect(fixture.readRequests).toEqual([])
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    })
  }
})

test('HUD infinite paging waits for a pending report preference, then resumes', async ({page})=>{
  await page.setViewportSize({width:390,height:900})
  await page.emulateMedia({reducedMotion:'reduce'})
  await page.clock.install()
  const fixture=await reportsFixture(page)
  await expect.poll(()=>fixture.pageRequests.filter(cursor=>cursor!==null).length).toBe(1)
  let release!:()=>void
  fixture.pause(new Promise<void>(resolve=>{release=resolve}))
  await page.locator('main article').first().getByRole('button',{name:'Archive report'}).click()
  await page.getByTestId('command-orb').click()
  const panel=page.getByRole('dialog')
  await expect(panel.getByRole('status').filter({hasText:'Loading intelligence…'})).toBeVisible()
  const before=fixture.pageRequests.filter(cursor=>cursor!==null).length
  await page.clock.runFor(1000)
  expect(fixture.pageRequests.filter(cursor=>cursor!==null).length).toBe(before)
  release()
  await expect(panel.getByLabel('Intelligence list').getByRole('button',{name:/Espionage report/})).toBeVisible()
  await expect(panel.getByRole('status').filter({hasText:'Loading intelligence…'})).toHaveCount(0)
})


for (const width of [1280, 390]) {
  test(`bulk cleanup rate limit requires a player retry at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const now = new Date('2026-10-29T14:00:00Z')
    await page.clock.install({ time: now })
    await page.clock.pauseAt(now)
    const fixture = await reportsFixture(page)
    const primedAlert = (await page.locator('[aria-live=assertive]').elementHandle())!
    const submitted: string[] = []
    let throttled = true
    await page.route('**/commands', async route => {
      const envelope = route.request().postDataJSON().gameplay
      if (envelope?.command.action.type !== 'SetReportsHidden') return route.fallback()
      submitted.push(envelope.command_id)
      if (throttled)
        return route.fulfill({ status: 429, headers: { 'Retry-After': '60' }, json: { code: 'RateLimited' } })
      return route.fallback()
    })
    await selectReports(page, true)
    await page.getByRole('button', { name: 'Select loaded reports (2)' }).click()
    await page.getByRole('button', { name: 'Archive selected (2)' }).click()
    const banner = page.getByTestId('game-error-banner')
    await expect(banner).toHaveCount(1)
    // The cooldown message already explains this failure; do not repeat it.
    await expect(page.getByText('Cleanup stopped.', { exact: false })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Connection details', exact: true })).toHaveCount(0)
    await expect(page.locator('main').getByText('Cleanup stopped.', { exact: false })).toHaveCount(0)
    await expect(page.getByText('Orders are coming in too fast. Try again in 60 seconds.', { exact: true })).toBeVisible()
    await expect(page.getByText('Unable to refresh your empire.', { exact: false })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Retry order' })).toHaveCount(0)
    expect(fixture.headers.map(r => r.hidden)).toEqual([false, false])
    await expect(page.getByRole('button', { name: 'Archive selected (2)' })).toBeDisabled()
    const liveCooldown = page.getByRole('status').filter({ hasText: 'Wait for the countdown, then try again.' })
    await expect(liveCooldown).toHaveCount(1)
    const announcement = await liveCooldown.textContent()
    await page.clock.runFor(59000)
    await expect(liveCooldown).toHaveText(announcement!)
    await expect(banner.getByText(/Orders are coming in too fast. Try again in 1 second/)).toHaveAttribute('aria-live', 'off')
    await expect(page.getByText('Try again in 1s', { exact: true })).toHaveCount(0)
    expect(submitted).toHaveLength(1)
    await page.evaluate(() => window.scrollTo(0, 0))
    await diagnosticScreenshot(page, { path: `test-results/unified-rate-limit-reports-${width}x900.png`, fullPage: true })
    if (width < 768) {
      await page.getByTestId('command-orb').click()
      await expect(page.getByRole('dialog').getByTestId('game-error-banner')).toContainText('Orders are coming in too fast.')
      await expect(page.getByTestId('game-error-banner')).toHaveCount(1)
      await expect(page.getByRole('dialog').getByText('TOO MANY ORDERS', { exact: true })).toHaveCount(0)
      await expect(page.getByRole('dialog').getByText(/Orders are coming in too fast. Try again in 1 second/)).toHaveAttribute('aria-live', 'off')
      await expect(page.getByRole('dialog').getByRole('status').filter({ hasText: 'Wait for the countdown, then try again.' })).toHaveText(announcement!)
      await diagnosticScreenshot(page, { path: `test-results/unified-rate-limit-hud-${width}x900.png` })
      await page.getByRole('button', { name: 'Close command HUD' }).click()
    }
    let releaseRefresh!: () => void
    const gate = new Promise<void>(resolve => { releaseRefresh = resolve })
    await page.route('**/overview', async route => { await gate; return route.fallback() })
    throttled = false
    await page.clock.runFor(1001)
    await expect(page.locator('p[aria-live=off]').filter({ hasText: 'Cooldown over. Refreshing your empire…' })).toBeVisible()
    await diagnosticScreenshot(page, { path: `test-results/unified-rate-limit-refresh-${width}x900.png`, fullPage: true })
    releaseRefresh()
    await page.unroute('**/overview')
    await expect(page.getByText(/Cooldown over. Refreshing/)).toHaveCount(0)
    await page.clock.runFor(60000)
    expect(submitted).toHaveLength(1)
    expect(fixture.headers.map(r => r.hidden)).toEqual([false, false])
    await expect(page.getByRole('button', { name: 'Archive selected (2)' })).toBeEnabled()
    await expect(page.getByText('Cooldown over. Retry the remaining selected reports when you’re ready.')).toBeVisible()
    if (width < 768) {
      const originalNotice = (await banner.getByRole('alert').elementHandle())!
      const originalAnnouncement = (await page.getByTestId('order-announcement').elementHandle())!
      const announcementBefore = await originalAnnouncement.textContent()
      await page.getByTestId('command-orb').click()
      await expect(page.getByTestId('game-error-banner')).toHaveCount(1)
      await expect(page.getByRole('dialog').getByText('Cooldown over. Retry the remaining selected reports when you’re ready.')).toBeVisible()
      expect(await originalNotice.evaluate(el => !!el.closest('dialog'))).toBe(true)
      expect(await originalAnnouncement.evaluate(el => !!el.closest('dialog'))).toBe(true)
      expect(await originalAnnouncement.textContent()).toBe(announcementBefore)
      await diagnosticScreenshot(page, { path: 'test-results/unified-hud-cleanup-ready-390x900.png' })
      await page.getByRole('button', { name: 'Close command HUD' }).click()
      await page.clock.runFor(1000)
      await expect(banner.getByRole('alert')).toBeVisible()
      expect(await originalNotice.evaluate(el => !!el.closest('main'))).toBe(true)
    }
    await diagnosticScreenshot(page, { path: `test-results/unified-rate-limit-ready-${width}x900.png`, fullPage: true })
    // Only another player click sends another delete request.
    await page.getByRole('button', { name: 'Archive selected (2)' }).click()
    await expect.poll(() => fixture.headers.every(r => r.hidden)).toBe(true)
    expect(submitted).toHaveLength(2)
    expect(submitted[1]).not.toBe(submitted[0])
    await expect(page.getByText(/Cleanup stopped|Cooldown over/)).toHaveCount(0)
    await expect(banner.locator('[data-error-entry]')).toHaveCount(0)
    await diagnosticScreenshot(page, { path: `test-results/unified-rate-limit-retried-${width}x900.png`, fullPage: true })
    // Actual connection failures still explain reconnecting, without resending orders.
    await page.route('**/overview', route => route.abort('failed'))
    await refreshGame(page)
    await page.clock.runFor(1000)
    const disconnected = 'Unable to refresh your empire. Showing the last confirmed state. Reconnecting…'
    await expect(page.locator('p[aria-live=off]').filter({ hasText: disconnected })).toBeVisible()
    expect(await primedAlert.getAttribute('aria-live')).toBe('assertive')
    expect(await primedAlert.textContent()).toBe(disconnected)
    await diagnosticScreenshot(page, { path: `test-results/unified-rate-limit-network-${width}x900.png`, fullPage: true })
    if (width < 768) {
      await page.getByTestId('command-orb').click()
      await expect(page.getByRole('dialog').getByTestId('game-error-banner')).toContainText('Unable to refresh your empire. Showing the last confirmed state. Reconnecting…')
      await page.clock.resume()
      await expect(page.getByRole('dialog')).toHaveCSS('opacity', '1')
      await diagnosticScreenshot(page, { path: `test-results/unified-rate-limit-network-hud-${width}x900.png` })
      await page.getByRole('button', { name: 'Close command HUD' }).click()
    }
    await page.unroute('**/overview')
    await refreshGame(page)
    await page.clock.runFor(1000)
    await expect(page.getByText(/Unable to refresh your empire/)).toHaveCount(0)
  })
}

for (const width of [1280, 390]) {
  test(`closing or reloading clears the notice while preserving order recovery at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.clock.install({ time: new Date('2026-10-29T14:00:00Z') })
    await page.clock.pauseAt(new Date('2026-10-29T14:00:00Z'))
    const fixture = await reportsFixture(page, false, 2, 50)
    const ids: string[] = []
    await page.route('**/commands', async route => {
      ids.push(route.request().postDataJSON().gameplay.command_id)
      return route.fallback()
    })
    fixture.setMode('uncertain')
    await page.getByRole('article').first().getByRole('button', { name: 'Archive report', exact: true }).click()
    const notice = page.getByRole('complementary', { name: 'Action needs attention' })
    const retry = notice.getByRole('button', { name: 'Retry order', exact: true })
    const dismiss = notice.getByRole('button', { name: 'Dismiss order notices', exact: true })
    const receipt = (response: Response) =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname.endsWith(`/commands/${ids[0]}`)
    await expect(retry).toBeVisible()
    if (process.env.ORBIT_TEST_SCREENSHOTS === '1')
      await page.evaluate(() => window.scrollTo(0, 0))
    await diagnosticScreenshot(page, { path: info.outputPath(`order-notice-${width}x900.png`) })
    const originalAnnouncement = (await page.getByTestId('order-announcement').elementHandle())!
    await page.getByTestId('command-orb').click()
    const hud = page.getByRole('dialog', { name: 'Command uplink' })
    await expect(hud.getByRole('button', { name: 'Retry order' })).toBeVisible()
    await expect(page.getByTestId('game-error-banner')).toHaveCount(1)
    expect(await originalAnnouncement.evaluate(el => !!el.closest('dialog'))).toBe(true)
    await diagnosticScreenshot(page, { path: info.outputPath(`hud-order-notice-${width}x900.png`) })
    if (width < 768) {
      await dismiss.click()
      await expect(hud.getByRole('heading', { name: 'Command uplink' })).toBeFocused()
      await expect(notice).toHaveCount(0)
      await diagnosticScreenshot(page, { path: info.outputPath('hud-order-dismissed-390x900.png') })
    }
    await page.getByRole('button', { name: 'Close command HUD' }).click()
    await page.clock.runFor(1000)
    expect(await originalAnnouncement.evaluate(el => !!el.closest('main'))).toBe(true)
    if (width >= 768) {
      await dismiss.focus()
      await dismiss.press('Enter')
      await expect(page.getByRole('heading', { name: 'Reports', level: 1 })).toBeFocused()
    }
    await expect(notice).toHaveCount(0)
    await withReportListResponse(page, () => page.reload())
    await expect(page.getByRole('article')).toHaveCount(2)
    await withFixtureResponseStatus(page, receipt, () => page.clock.runFor(60000), 404)
    await expect(notice).toHaveCount(0)
    await expect(page.getByTestId('order-announcement')).toBeEmpty()
    expect(ids).toHaveLength(1)
    if (process.env.ORBIT_TEST_SCREENSHOTS === '1')
      await page.evaluate(() => window.scrollTo(0, 0))
    await diagnosticScreenshot(page, { path: info.outputPath(`order-notice-cleared-${width}x900.png`) })
    await withBootstrapResponse(page, () =>
      page.goto(`/u/andromeda/b/${body.id}/settings`),
    )
    const recovery = page.getByRole('region', { name: 'Orders awaiting confirmation' })
    const retryArchive = recovery.getByRole('button', { name: 'Retry order for Archive report' })
    await expect(retryArchive).toBeVisible()
    await diagnosticScreenshot(page, { path: info.outputPath(`order-recovery-${width}x900.png`) })
    fixture.setMode('success')
    await retryArchive.click()
    await expect.poll(() => fixture.headers[0].hidden).toBe(true)
    expect(ids).toEqual([ids[0], ids[0]])
    await expect(notice).toHaveCount(0)
    await expect(recovery).toHaveCount(0)
  })
}

for (const width of [1440, 390]) {
  test(`archive folder discovers old hidden reports and restores single and bulk selections at ${width}px`, async ({page}) => {
    await page.setViewportSize({width, height: 1000})
    const fixture = await reportsFixture(page, true)
    fixture.headers[1].hidden = true
    fixture.headers[1].observed_at = 1000
    await withReportListResponse(page, () => page.reload())
    const rows = page.locator('main article')
    await expect(rows).toHaveCount(1)
    const folders = page.getByRole('group', {name: 'Report folder'})
    const archived = folders.getByRole('button', {name: 'Archived', exact: true})
    const originalFolderControl = await folders.elementHandle()
    const originalCleanup = await page.getByRole('button', {name: 'More report actions'}).elementHandle()
    let releaseFolder!: () => void
    const folderGate = new Promise<void>(resolve => { releaseFolder = resolve })
    await page.route('**/api/**/reports', async route => {
      const request = route.request().postDataJSON()
      if (request.include_hidden && !request.cursor) await folderGate
      await route.fallback()
    })
    await archived.focus()
    await page.keyboard.press('Space')
    await expect(rows).toHaveCount(0)
    await expect(page.getByText('Loading report history…')).toBeVisible()
    await expect(page.getByRole('region', {name: 'No reports to show.', exact: true})).toHaveCount(0)
    // A delayed folder response must never remove the controls or lose focus.
    expect(await originalFolderControl!.evaluate(el => el.isConnected)).toBe(true)
    expect(await originalCleanup!.evaluate(el => el.isConnected)).toBe(true)
    await expect(archived).toBeFocused()
    releaseFolder()
    await expect(archived).toHaveAttribute('aria-pressed', 'true')
    await expect(folders.getByRole('button', {name: 'Inbox', exact: true})).toHaveAttribute('aria-pressed', 'false')
    // Let the moving plate settle exactly over its new segment.
    const selection = folders.locator('[data-segment-selection]')
    await expect(selection).toHaveCount(1)
    await expect.poll(async () => selection.evaluate(el => {
      const plate = el.getBoundingClientRect()
      const button = el.parentElement!.getBoundingClientRect()
      return Math.max(Math.abs(plate.x - button.x), Math.abs(plate.width - button.width))
    })).toBeLessThanOrEqual(1)
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toContainText('Archived')
    await expect(page.getByText('Loading archived reports…')).toHaveCount(0)
    expect(await originalFolderControl!.evaluate(el => el.isConnected)).toBe(true)
    expect(await originalCleanup!.evaluate(el => el.isConnected)).toBe(true)
    await diagnosticScreenshot(page, {path: `test-results/reports-archived-${width}x1000.png`, fullPage: true})
    await rows.first().getByRole('button', {name: 'Move to inbox', exact: true}).click()
    await expect(rows).toHaveCount(0)
    await expect(page.getByText('Reports you archive appear here. Use Move to inbox to restore them.', {exact: true})).toBeVisible()
    const emptyFolder = page.getByRole('region', {name: 'No reports to show.', exact: true})
    await expect(emptyFolder).toHaveCSS('border-top-style', 'none')
    await expect(emptyFolder).toHaveCSS('border-bottom-style', 'none')
    await diagnosticScreenshot(page, {path: `test-results/reports-archive-empty-${width}x1000.png`, fullPage: true})
    await page.getByRole('button', {name: 'Inbox', exact: true}).click()
    await expect(rows).toHaveCount(2)
    await selectReports(page)
    await page.getByRole('button', {name: 'Select loaded reports (2)'}).click()
    await page.getByRole('button', {name: 'Archive selected (2)'}).click()
    await expect(rows).toHaveCount(0)
    await page.getByRole('button', {name: 'Archived', exact: true}).click()
    await expect(rows).toHaveCount(2)
    await page.getByRole('button', {name: 'Select loaded reports (2)'}).click()
    await diagnosticScreenshot(page, {path: `test-results/reports-archive-bulk-${width}x1000.png`, fullPage: true})
    await page.getByRole('button', {name: 'Move to inbox (2)', exact: true}).click()
    await expect(rows).toHaveCount(0)
    await page.getByRole('button', {name: 'Inbox', exact: true}).click()
    await expect(rows).toHaveCount(2)
    expect(fixture.headers.every(header => !header.hidden)).toBe(true)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await archived.click()
    await expect(archived).toHaveAttribute('aria-pressed', 'true')
    await expect(rows).toHaveCount(0)
    await expect(selection).toHaveCSS('transform', 'none')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}

for (const width of [1280, 390]) {
  test(`Archive all reviews the entire Inbox and protects starred reports across filters at ${width}px`, async ({page}) => {
    await page.setViewportSize({width, height: 900})
    await page.emulateMedia({reducedMotion: 'reduce'})
    const fixture = await reportsFixture(page, true)
    fixture.headers[1].starred = true
    fixture.headers[0].observed_at = Date.now() - 60_000
    await withReportListResponse(page, () => page.reload())
    await filterStatus(page, 'unread')
    await expect(page.getByRole('article')).toHaveCount(1)
    const trigger = page.getByRole('button', {name: 'More report actions'})
    await trigger.click()
    const menu = page.getByRole('menu', {name: 'Report actions'})
    await expect(menu.getByRole('menuitem', {name: 'Archive…', exact: true})).toBeVisible()
    await expect(menu.getByRole('menuitem')).toHaveCount(width < 768 ? 3 : 2)
    if (width < 768)
      await expect(menu.getByRole('menuitem', {name: 'Select reports', exact: true})).toBeVisible()
    await diagnosticScreenshot(page, {path: `test-results/reports-archive-all-menu-${width}x900.png`})
    await menu.getByRole('menuitem', {name: 'Archive…', exact: true}).click()
    const dialog = page.getByRole('dialog', {name: 'Archive reports', exact: true})
    await expect(dialog).toContainText('Entire Inbox · Starred reports stay.')
    await expect(menu.getByRole('menuitem')).toHaveCount(0)
    await expect(dialog.getByRole('button', {name: 'Archive all (1)', exact: true})).toBeEnabled()
    await diagnosticScreenshot(page, {path: `test-results/reports-archive-all-review-${width}x900.png`})
    await dialog.getByRole('combobox', {name: 'Older than'}).selectOption('custom')
    await dialog.getByRole('spinbutton', {name: 'Hours', exact: true}).fill('-1')
    await expect(dialog.getByRole('button', {name: 'Archive 0 reports', exact: true})).toBeDisabled()
    await expect(dialog.getByRole('button', {name: 'Archive all (1)', exact: true})).toBeEnabled()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(trigger).toBeFocused()
    expect(fixture.submitted()).toBe(0)
    await trigger.click()
    await menu.getByRole('menuitem', {name: 'Archive…', exact: true}).click()
    await dialog.getByRole('button', {name: 'Archive all (1)', exact: true}).click()
    await expect.poll(() => fixture.headers.map(r => r.hidden)).toEqual([true, false])
    await expect(page.getByRole('article')).toHaveCount(1)
    await expect(dialog.getByRole('button', {name: 'Archive all (0)', exact: true})).toBeDisabled()
    expect(fixture.submitted()).toBe(1)
    await diagnosticScreenshot(page, {path: `test-results/reports-archive-all-complete-${width}x900.png`})
    await dialog.getByRole('button', {name: /Dismiss (sheet|popover)/}).click()
    await page.getByRole('button', {name: 'Remove unread filter', exact: true}).click()
    await page.getByRole('button', {name: 'Archived', exact: true}).click()
    await expect(page.getByRole('article')).toHaveCount(1)
    if (width < 768) {
      await selectReports(page)
      await page.getByRole('article').getByRole('checkbox').check()
    }
    await page.getByRole('button', {name: 'Move to inbox', exact: true}).click()
    await expect.poll(() => fixture.headers.map(r => r.hidden)).toEqual([false, false])
  })

  test(`Archive all waits for complete history and preserves retry after rejection at ${width}px`, async ({page}) => {
    await page.setViewportSize({width, height: 900})
    await page.emulateMedia({reducedMotion: 'reduce'})
    const fixture = await reportsFixture(page, true)
    let release!: () => void
    fixture.holdMore(new Promise<void>(resolve => {release = resolve}))
    const dialog = page.getByRole('dialog', {name: 'Archive reports', exact: true})
    try {
      await page.getByRole('button', {name: 'More report actions'}).click()
      await page.getByRole('menuitem', {name: 'Archive…', exact: true}).click()
      await expect(dialog.getByRole('button', {name: 'Loading reports…', exact: true})).toBeDisabled()
      expect(fixture.submitted()).toBe(0)
    } finally {
      release()
    }
    const confirm = dialog.getByRole('button', {name: 'Archive all (2)', exact: true})
    await expect(confirm).toBeEnabled()
    fixture.setMode('rejected')
    await confirm.click()
    await expect(dialog.getByRole('alert')).toContainText('Cleanup stopped.')
    await expect(page.getByRole('article')).toHaveCount(2)
    await expect(confirm).toBeEnabled()
    expect(fixture.headers.map(r => r.hidden)).toEqual([false, false])
    fixture.setMode('success')
    await confirm.click()
    await expect(page.getByRole('article')).toHaveCount(0)
    await expect(dialog.getByRole('button', {name: 'Archive all (0)', exact: true})).toBeDisabled()
    expect(fixture.submitted()).toBe(2)
  })
}

for (const width of [1440, 390]) {
  test(`detail archive returns only after acceptance with list context at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const fixture = await reportsFixture(page, true, 24, 50)
    await page.getByRole('button', { name: 'Filter reports', exact: true }).click()
    const filter = page.getByRole('dialog', { name: 'Filter reports', exact: true })
    await filter.getByRole('combobox', { name: 'Report type' }).selectOption('Espionage')
    await filter.getByRole('button', { name: /Dismiss (sheet|popover)/ }).click()
    await page.getByRole('button', { name: 'Sort reports', exact: true }).click()
    await page.getByRole('menuitemradio', { name: 'Oldest first', exact: true }).click()
    await expect(page.getByRole('menu', { name: 'Sort reports' })).toBeHidden()
    await expect.poll(() => page.evaluate(() => document.body.style.position)).not.toBe('fixed')
    const rows = page.locator('main article')
    const link = rows.nth(16).getByRole('link', { name: 'Espionage', exact: true })
    await link.evaluate(el => el.scrollIntoView({ block: 'center' }))
    const scroll = await page.evaluate(() => window.scrollY)
    expect(scroll).toBeGreaterThan(100)
    await link.click()
    await expect(page.getByRole('region', { name: 'Report observation' })).toBeVisible()
    const detailUrl = page.url()
    await diagnosticScreenshot(page, { path: `test-results/archive-return-detail-${width}x900.png` })
    let release!: () => void
    fixture.pause(new Promise<void>(resolve => { release = resolve }))
    try {
      await page.getByRole('button', { name: 'Archive report', exact: true }).click()
      await expect.poll(fixture.submitted).toBe(1)
      await expect(page).toHaveURL(detailUrl)
      await expect(page.getByRole('button', { name: 'Move to inbox' })).toBeDisabled()
      await diagnosticScreenshot(page, { path: `test-results/archive-return-pending-${width}x900.png` })
    } finally { release() }
    await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/reports`)
    await expect(rows).toHaveCount(23)
    await expect(page.getByRole('button', { name: 'Remove Espionage filter' })).toBeVisible()
    await expect.poll(() => page.evaluate(y => window.scrollY - Math.min(y, document.documentElement.scrollHeight - innerHeight), scroll)).toBe(0)
    await expect(rows.first().getByRole('link', { name: 'Espionage', exact: true })).toHaveAttribute('href', new RegExp(`${id(93)}$`))
    await diagnosticScreenshot(page, { path: `test-results/archive-return-position-${width}x900.png` })
    await page.evaluate(() => window.scrollTo(0, 0))
    await diagnosticScreenshot(page, { path: `test-results/archive-return-list-${width}x900.png` })
    await page.getByRole('button', { name: 'Archived', exact: true }).click()
    await expect(rows).toHaveCount(1)
    await rows.getByRole('link', { name: 'Espionage', exact: true }).click()
    await page.getByRole('button', { name: 'Move to inbox' }).click()
    await expect(page.getByRole('button', { name: 'Archive report' })).toBeEnabled()
    // Restoring remains in detail; archiving returns to the originating folder.
    await expect(page.getByRole('region', { name: 'Report observation' })).toBeVisible()
    await page.getByRole('button', { name: 'Archive report' }).click()
    await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/reports`)
    await expect(page.getByRole('button', { name: 'Archived', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(rows).toHaveCount(1)
    await diagnosticScreenshot(page, { path: `test-results/archive-return-archived-${width}x900.png` })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })

  test(`detail archive rejection and uncertainty stay recoverable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const fixture = await reportsFixture(page, true)
    await page.locator('main article').first().getByRole('link', { name: 'Espionage', exact: true }).click()
    await expect(page.getByRole('region', { name: 'Report observation' })).toBeVisible()
    const detailUrl = page.url()
    fixture.setMode('rejected')
    await page.getByRole('button', { name: 'Archive report' }).click()
    await expect(page.getByTestId('game-error-banner')).toContainText('Action rejected: Not Found')
    await expect(page).toHaveURL(detailUrl)
    await expect(page.getByRole('button', { name: 'Archive report' })).toBeEnabled()
    await diagnosticScreenshot(page, { path: `test-results/archive-return-rejected-${width}x900.png` })
    fixture.setMode('uncertain')
    await page.getByRole('button', { name: 'Archive report' }).click()
    await expect(page.getByTestId('game-error-banner')).toContainText('We’re checking whether this order went through.')
    await expect(page).toHaveURL(detailUrl)
    await expect(page.getByRole('button', { name: 'Archive report' })).toBeDisabled()
    await diagnosticScreenshot(page, { path: `test-results/archive-return-uncertain-${width}x900.png` })
    fixture.setMode('success')
    await page.getByRole('button', { name: 'Retry order', exact: true }).click()
    await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/reports`)
    await expect(page.locator('main article')).toHaveCount(1)
  })

  test(`detail archive rate limit stays in detail and allows a fresh gesture at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const now = new Date('2026-11-01T14:00:00Z')
    await page.clock.install({ time: now })
    await page.clock.pauseAt(now)
    await reportsFixture(page, true)
    await page.locator('main article').first().getByRole('link', { name: 'Espionage', exact: true }).click()
    await expect(page.getByRole('region', { name: 'Report observation' })).toBeVisible()
    const detailUrl = page.url()
    let throttled = true
    await page.route('**/commands', async route => {
      if (throttled && route.request().postDataJSON().gameplay?.command.action.type === 'SetReportHidden')
        return route.fulfill({ status: 429, headers: { 'Retry-After': '60' }, json: { code: 'RateLimited' } })
      return route.fallback()
    })
    await page.getByRole('button', { name: 'Archive report' }).click()
    await expect(page.getByTestId('game-error-banner')).toContainText('Orders are coming in too fast.')
    await expect(page).toHaveURL(detailUrl)
    await diagnosticScreenshot(page, { path: `test-results/archive-return-rate-limit-${width}x900.png` })
    throttled = false
    await page.clock.runFor(61000)
    await expect(page.getByRole('button', { name: 'Archive report' })).toBeEnabled()
    await page.getByRole('button', { name: 'Archive report' }).click()
    await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/reports`)
  })
}

test('leaving detail during archive does not pull the player back after acceptance', async ({ page }) => {
  const fixture = await reportsFixture(page, true)
  await page.locator('main article').first().getByRole('link', { name: 'Espionage', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Report observation' })).toBeVisible()
  let release!: () => void
  fixture.pause(new Promise<void>(resolve => { release = resolve }))
  try {
    await page.getByRole('button', { name: 'Archive report' }).click()
    await expect.poll(fixture.submitted).toBe(1)
    await page.getByRole('link', { name: 'Back to reports' }).click()
    await page.locator('main article').getByRole('link', { name: 'Espionage', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`${id(71)}$`))
  } finally { release() }
  await expect.poll(() => fixture.headers[0].hidden).toBe(true)
  await expect(page).toHaveURL(new RegExp(`${id(71)}$`))
  await expect(page.getByRole('region', { name: 'Report observation' })).toBeVisible()
})

for (const width of [1280, 390]) {
  test(`archive age survives navigation and reopening without submitting at ${width}px`, async ({page}) => {
    await page.setViewportSize({width, height: 900})
    await page.emulateMedia({reducedMotion: 'reduce'})
    const fixture = await reportsFixture(page, true)
    const dialog = page.getByRole('dialog', {name: 'Archive reports', exact: true})
    await ageCleanup(page)
    await expect(dialog.getByRole('combobox', {name: 'Older than'})).toBeEnabled()
    await dialog.getByRole('combobox', {name: 'Older than'}).selectOption('24')
    await page.keyboard.press('Escape')
    await ageCleanup(page)
    await expect(dialog.getByRole('combobox', {name: 'Older than'})).toHaveValue('24')
    await dialog.getByRole('combobox', {name: 'Older than'}).selectOption('custom')
    await dialog.getByRole('spinbutton', {name: 'Hours'}).fill('36.5')
    await page.keyboard.press('Escape')
    await withReportListResponse(page, () => page.reload())
    await ageCleanup(page)
    await expect(dialog.getByRole('combobox', {name: 'Older than'})).toHaveValue('custom')
    await expect(dialog.getByRole('spinbutton', {name: 'Hours'})).toHaveValue('36.5')
    expect(fixture.submitted()).toBe(0)
    await diagnosticScreenshot(page, {path: `test-results/reports-age-${width}x900.png`})
  })
  for (const surface of ['reports', 'orb']) {
    test(`mark all read from ${surface} includes unloaded and archived reports at ${width}px`, async ({page}) => {
      await page.setViewportSize({width, height: 900})
      await page.emulateMedia({reducedMotion: 'reduce'})
      const fixture = await reportsFixture(page, true, 2, 20)
      fixture.headers[0].read = false
      for (let index = 2; index < 78; index++) fixture.headers.push({
        ...fixture.headers[0], id: id(70 + index), observed_at: fixture.headers[0].observed_at - index * 1000,
        hidden: index === 77, starred: index === 76, shared: index === 76,
      })
      fixture.bumpRevision()
      await withFixtureResponse(page, response => response.url().endsWith('/reports') && response.request().method() === 'POST' && response.request().postDataJSON().filter?.unread_only === false, () => page.reload())
      await expect(page.locator('main article').first()).toBeVisible()
      expect(await page.locator('main article').count()).toBeLessThan(77)
      if (surface === 'orb') {
        await page.getByRole('button', {name: 'Open command HUD'}).click()
        const dialog = page.getByRole('dialog', {name: 'Command uplink'})
        const all = dialog.getByRole('link', {name: 'All reports', exact: true})
        await expect(all).toBeInViewport()
        const fleets = dialog.getByRole('button', {name: /^Fleets/})
        await expect(fleets).toHaveAttribute('aria-expanded', 'false')
        const heading = dialog.getByRole('heading', {name: 'Reports & messages'})
        expect((await fleets.boundingBox())!.y).toBeLessThan((await heading.boundingBox())!.y)
        const actions = dialog.getByRole('group', {name: 'Report and message actions'})
        for (const action of await actions.locator('a, button').all()) {
          const bounds = (await action.boundingBox())!
          expect(bounds.width).toBe(width < 768 ? 44 : 24)
          expect(bounds.height).toBe(width < 768 ? 44 : 24)
          await expect(action).toHaveAttribute('data-button-variant', 'ghost')
        }
        await expect(all).toHaveAttribute('href', `/u/andromeda/b/${body.id}/reports`)
        await expect(actions.getByRole('link', {name: 'Messages', exact: true})).toHaveAttribute('href', `/u/andromeda/b/${body.id}/messages`)
        await diagnosticScreenshot(page, {path: `test-results/reports-orb-idle-${width}x900.png`})
        await all.focus()
        await expect(all).toBeFocused()

        const first = dialog.locator('[aria-label="Intelligence list"] button').first()
        await expect(first).toBeVisible()
        expect((await all.boundingBox())!.y).toBeLessThan((await first.boundingBox())!.y)
      } else {
        await page.getByRole('button', {name: 'More report actions'}).click()
      }
      await diagnosticScreenshot(page, {path: `test-results/reports-${surface}-actions-${width}x900.png`})
      await page.getByRole(surface === 'orb' ? 'button' : 'menuitem', {name: 'Mark all as read', exact: true}).click()
      await expect(page.getByText('All reports marked as read.', {exact: true})).toBeVisible()
      expect(fixture.readRequests).toHaveLength(78)
      expect(fixture.headers.every(row => row.read)).toBe(true)
      expect(fixture.headers[76]).toMatchObject({starred: true, shared: true, hidden: false})
      expect(fixture.headers[77].hidden).toBe(true)
      await expect(page.getByTestId('unread-count')).toHaveCount(0)
      if (surface === 'orb') await expect(page.locator('[aria-label="Intelligence list"] button')).toHaveCount(0)
      await diagnosticScreenshot(page, {path: `test-results/reports-${surface}-read-${width}x900.png`})
    })
  }
}
