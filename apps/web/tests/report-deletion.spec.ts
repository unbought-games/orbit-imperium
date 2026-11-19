import { reportPath, settingsGamePath } from './fixtures/report-path'
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
import {
  installGameFixture,
  matchesFixtureGameplay,
  fixtureReportPath,
  fixtureReportContext,
  binding,
  body,
  id,
} from './fixtures/game'

const commandsPath = `/api/v4/universes/${binding.universe}/commands`
function matchesWorldAction(action: string) {
  return (response: Response) =>
    response.request().method() === 'POST' &&
    new URL(response.url()).pathname === commandsPath &&
    matchesFixtureGameplay(response.request().postDataJSON()) &&
    response.request().postDataJSON().gameplay.command.action.type === action
}

async function selectReports(page: Page) {
  if (await page.getByRole('group', { name: 'Report selection' }).isVisible())
    return
  await page.getByRole('button', { name: 'More report actions' }).click()
  await page
    .getByRole('menuitem', { name: 'Select reports', exact: true })
    .click()
}
async function reportsFixture(
  page: Page,
  quiet = false,
  count = 2,
  pageSize = 1,
) {
  let revision = 1
  const missingReceipts = new Set<string>()
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
  for (let i = 2; i < count; i++)
    headers.push({
      ...headers[0],
      id: id(70 + i),
      observed_at: headers[0].observed_at - i * 1000000,
    })
  await installGameFixture(page, {
    protocol: 4,
    missingReceipt: (commandId) => missingReceipts.has(commandId),
    extraCapabilities: ['Reports'],
    ...(quiet
      ? {
          missions: {
            fleets: [],
            incoming: [],
            score_value_micro: '0',
            fleet_slots: '1',
          },
        }
      : {}),
    hasUnreadReports: () => headers.some((r) => !r.read && !r.hidden),
    viewerRevision: () => String(revision),
  })
  const pageRequests: Array<string | null> = []
  const readRequests: string[] = []
  const readBatches: string[][] = []
  await page.route(
    (url) =>
      url.pathname === fixtureReportPath() ||
      url.pathname === fixtureReportPath('read') ||
      headers.some((row) => url.pathname === fixtureReportPath(row.id)),
    async (route) => {
      const path = new URL(route.request().url()).pathname
      const report = headers.find((row) => path === fixtureReportPath(row.id))
      const batchRead = path === fixtureReportPath('read')
      const context = fixtureReportContext(
        route,
        batchRead ? 'read' : report?.id,
      )
      const request = route.request().postDataJSON()
      if (batchRead) {
        const ids: string[] = request.reports
        expect(ids.every((id) => headers.some((row) => row.id === id))).toBe(
          true,
        )
        readBatches.push(ids)
        readRequests.push(...ids)
        for (const report of ids)
          headers.find((row) => row.id === report)!.read = true
        revision++
        return route.fulfill({
          json: {
            ...context,
            viewer_revision: String(revision),
            items: headers.filter((row) => ids.includes(row.id)),
          },
        })
      }
      const filter = request.filter
      const rows = filter
        ? triageReports(
            headers,
            filter.sort,
            false,
            filter.unread_only
              ? 'unread'
              : filter.starred_only
                ? 'starred'
                : 'all',
            false,
            filter.hidden ? 'archived' : 'inbox',
            request.kind ?? 'all',
          )
        : headers.filter((r) => request.include_hidden || !r.hidden)
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
                unread_count: Math.min(
                  99,
                  headers.filter((row) => !row.read && !row.hidden).length,
                ),
                items: rows.slice(index, index + pageSize),
                has_more: index + pageSize < rows.length,
                next_cursor:
                  index + pageSize < rows.length
                    ? id(71 + pageSize + index)
                    : null,
                as_of_ms: Date.now(),
              },
        },
      }
      if (!report) pageRequests.push(request.cursor)
      await route.fulfill(response)
    },
  )
  let mode: 'success' | 'rejected' | 'uncertain' = 'success'
  let pause: Promise<void> | undefined
  let submitted = 0
  await page.route(`**${commandsPath}`, async (route) => {
    if (
      route.request().method() !== 'POST' ||
      !matchesFixtureGameplay(route.request().postDataJSON())
    )
      return route.fallback()
    const envelope = route.request().postDataJSON().gameplay
    expect(envelope.command.type).toBe('World')
    if (envelope.command.action.type === 'MarkReportRead') {
      const report = envelope.command.action.report
      readRequests.push(report)
      headers.find((row) => row.id === report)!.read = true
      revision++
      return route.fulfill({
        json: {
          protocol: 4,
          binding,
          command_id: envelope.command_id,
          admitted_at: Date.now(),
          executed_at: Date.now(),
          status: 'Committed',
          result_ids: [],
          minimum_viewer_revision: String(revision),
        },
      })
    }
    if (envelope.command.action.type === 'SetReportStarred') {
      headers.find((r) => r.id === envelope.command.action.report)!.starred =
        envelope.command.action.starred
      revision++
      return route.fulfill({
        json: {
          protocol: 4,
          binding,
          command_id: envelope.command_id,
          admitted_at: Date.now(),
          executed_at: Date.now(),
          status: 'Committed',
          result_ids: [],
          minimum_viewer_revision: String(revision),
        },
      })
    }
    expect(['ArchiveReport', 'SetReportHidden', 'SetReportsHidden']).toContain(
      envelope.command.action.type,
    )
    const targetReports =
      envelope.command.action.type === 'SetReportsHidden'
        ? envelope.command.action.reports
        : [envelope.command.action.report]
    expect(
      targetReports.every((id: string) => headers.some((row) => row.id === id)),
    ).toBe(true)
    submitted++
    await pause
    if (mode === 'uncertain') {
      missingReceipts.add(envelope.command_id)
      return route.fulfill({ status: 503, json: { code: 'Unavailable' } })
    }
    missingReceipts.delete(envelope.command_id)
    if (mode === 'success') {
      const reports =
        envelope.command.action.type === 'SetReportsHidden'
          ? envelope.command.action.reports
          : [envelope.command.action.report]
      for (const report of reports) {
        const row = headers.find((r) => r.id === report)!
        if (envelope.command.action.type === 'ArchiveReport') {
          expect(envelope.command.action.revoke_share).toBe(!!row.shared)
          row.hidden = true
          row.shared = false
        } else row.hidden = envelope.command.action.hidden
      }
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
  await withReportListResponse(page, () => page.goto(reportPath()))
  await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/reports`)
  await expect(page.locator('main article')).toHaveCount(count)
  return {
    headers,
    readRequests,
    readBatches,
    pageRequests,
    bumpRevision: () => {
      revision++
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

// Covers route-scoped keyboard wiring and the separate mobile selection control.
test('E archives the selection and confirms revocation in the shared detail', async ({
  page,
}) => {
  const width = 390
  await page.setViewportSize({ width, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const fixture = await reportsFixture(page, true, 3, 50)
  const rows = page.locator('main article')
  await page.keyboard.press('e')
  expect(fixture.submitted()).toBe(0)
  await selectReports(page)
  await rows.nth(0).getByRole('checkbox').check()
  await rows.nth(1).getByRole('checkbox').check()
  await expect(
    page.getByRole('button', { name: 'Archive selected (2)' }),
  ).toHaveAttribute('aria-keyshortcuts', 'e')
  await page
    .getByRole('button', { name: 'Filter reports', exact: true })
    .click()
  const filter = page.getByRole('dialog', {
    name: 'Filter reports',
    exact: true,
  })
  await filter.getByRole('button', { name: /Dismiss (sheet|popover)/ }).focus()
  await page.keyboard.press('e')
  expect(fixture.submitted()).toBe(0)
  await filter.getByRole('button', { name: /Dismiss (sheet|popover)/ }).click()
  await expect(filter).toBeHidden()
  await rows.nth(1).getByRole('checkbox').focus()
  await diagnosticScreenshot(page, {
    path: `test-results/archive-shortcut-selected-${width}x900.png`,
  })
  await page.keyboard.press('e')
  await expect(rows).toHaveCount(1)
  await expect(
    page.getByRole('group', { name: 'Report selection' }),
  ).toContainText('0 selected')
  expect(fixture.headers.map((row) => row.hidden)).toEqual([true, true, false])
  expect(fixture.submitted()).toBe(1)

  fixture.headers[2].starred = true
  fixture.headers[2].shared = true
  fixture.bumpRevision()
  await withReportResponse(page, id(72), () =>
    rows.getByRole('link', { name: 'Espionage', exact: true }).click(),
  )
  await expect(
    page.getByRole('region', { name: 'Report observation' }),
  ).toBeVisible()
  const archive = page.getByRole('button', {
    name: 'Archive report',
    exact: true,
  })
  await expect(
    page.getByRole('button', { name: 'Unstar report' }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(archive).toBeEnabled()
  await expect(archive).toHaveAttribute('aria-keyshortcuts', 'e')
  await diagnosticScreenshot(page, {
    path: `test-results/archive-shared-detail-${width}x900.png`,
  })
  await archive.click()
  const dialog = page.getByRole('dialog', {
    name: 'Archive this shared report?',
  })
  const cancel = dialog.getByRole('button', { name: 'Cancel', exact: true })
  await expect(dialog).toHaveAccessibleDescription(
    /public link will stop working/,
  )
  await expect(cancel).toBeFocused()
  await diagnosticScreenshot(page, {
    path: `test-results/archive-shared-confirm-${width}x900.png`,
  })
  await cancel.click()
  await expect(dialog).toBeHidden()
  await expect(archive).toBeFocused()
  expect(fixture.submitted()).toBe(1)
  expect(fixture.headers[2]).toMatchObject({
    hidden: false,
    shared: true,
    starred: true,
  })
  let release!: () => void
  fixture.pause(
    new Promise<void>((resolve) => {
      release = resolve
    }),
  )
  try {
    await page.keyboard.press('e')
    await dialog
      .getByRole('button', { name: 'Archive and stop sharing', exact: true })
      .click()
    await expect.poll(fixture.submitted).toBe(2)
    await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/reports/${id(72)}`)
    await expect(
      page.getByRole('button', { name: 'Move to inbox', exact: true }),
    ).toBeDisabled()
    await page.keyboard.press('e')
    expect(fixture.submitted()).toBe(2)
    await diagnosticScreenshot(page, {
      path: `test-results/archive-shortcut-pending-${width}x900.png`,
    })
  } finally {
    release()
  }
  await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/reports`)
  await expect(
    page.getByText('No reports to show.', { exact: true }),
  ).toBeVisible()
  await withReportListResponse(page, () =>
    page.getByRole('button', { name: 'Archived', exact: true }).click(),
  )
  await expect(rows).toHaveCount(3)
  await selectReports(page)
  await rows.nth(0).getByRole('checkbox').check()
  await page.keyboard.press('e')
  expect(fixture.submitted()).toBe(2)
  await diagnosticScreenshot(page, {
    path: `test-results/archive-shortcut-archived-${width}x900.png`,
  })
  expect(fixture.headers[2]).toMatchObject({
    hidden: true,
    shared: false,
    starred: true,
  })
  // Reopening this detail can use its cached observation. Reload to verify the
  // persisted header at the server boundary as well as the archived route.
  await rows.locator(`a[href$="/${id(72)}"]`).click()
  await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/reports/${id(72)}`)
  await withReportResponse(page, id(72), () => page.reload())
  await expect(
    page.getByRole('button', { name: 'Move to inbox', exact: true }),
  ).toBeEnabled()
  await diagnosticScreenshot(page, {
    path: `test-results/archive-shared-archived-${width}x900.png`,
  })
  await page.keyboard.press('e')
  expect(fixture.submitted()).toBe(2)
  expect(fixture.headers.every((row) => row.hidden)).toBe(true)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
})

test('archive and restore respond at the fine-pointer target edge without opening the row', async ({
  page,
}) => {
  const width = 1440
  await page.setViewportSize({ width, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const fixture = await reportsFixture(page, true)
  const rows = page.locator('main article')
  const inboxUrl = page.url()
  const activateEdge = async (name: string) => {
    const button = page.getByRole('button', { name, exact: true }).last()
    const box = (await button.boundingBox())!
    expect(box.width).toBe(24)
    expect(box.height).toBe(24)
    expect(box.x + box.width).toBeLessThanOrEqual(width)
    expect((await button.locator('svg').boundingBox())!.width).toBe(16)
    const x = box.x + 2
    const y = box.y + box.height / 2
    await page.mouse.click(x, y)
  }
  await diagnosticScreenshot(page, {
    path: `test-results/archive-target-list-${width}x900.png`,
  })
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
  await withReportResponse(page, id(70), () =>
    rows.first().getByRole('link', { name: 'Espionage', exact: true }).click(),
  )
  await expect(
    page.getByRole('region', { name: 'Report observation' }),
  ).toBeVisible()
  const archive = page.getByRole('button', {
    name: 'Archive report',
    exact: true,
  })
  const share = page.getByRole('button', { name: 'Share report', exact: true })
  const shareBox = (await share.boundingBox())!
  const archiveBox = (await archive.boundingBox())!
  expect(archiveBox.x).toBeGreaterThanOrEqual(shareBox.x + shareBox.width)
  expect(archiveBox.x + archiveBox.width).toBeLessThanOrEqual(width)
  await archive.focus()
  await diagnosticScreenshot(page, {
    path: `test-results/archive-target-detail-${width}x900.png`,
  })
  await activateEdge('Archive report')
  await expect(page).toHaveURL(inboxUrl)
  await expect(rows).toHaveCount(1)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
})

// The duplicate 390px journey was retired after an unexplained CI hang.
// See the repair ledger; dedicated mobile archive/restore and navigation cases remain.
test('archiving a row and restoring its detail survive authoritative reloads', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const fixture = await reportsFixture(page)
  const report = id(71)
  const rows = page.locator('main article')
  const unread = page.getByRole('status', { name: 'Unread reports' }).first()
  await expect(unread).toBeVisible()
  await withFixtureResponse(page, matchesWorldAction('SetReportHidden'), () =>
    rows.last().getByRole('button', { name: 'Archive report' }).click(),
  )
  await expect(rows).toHaveCount(1)
  await expect(unread).toHaveCount(0)
  expect(fixture.headers[1]).toMatchObject({ hidden: true, read: false })
  await withReportListResponse(page, () => page.reload())
  await expect(rows.locator(`a[href$="/${report}"]`)).toHaveCount(0)
  await expect(rows).toHaveCount(1)
  await withReportResponse(page, report, () => page.goto(reportPath(report)))
  await expect(
    page.getByRole('region', { name: 'Report observation' }),
  ).toBeVisible()
  await expect.poll(() => fixture.headers[1].read).toBe(true)
  await withFixtureResponse(page, matchesWorldAction('SetReportHidden'), () =>
    page.getByRole('button', { name: 'Move to inbox' }).click(),
  )
  await expect(
    page.getByRole('button', { name: 'Archive report' }),
  ).toBeEnabled()
  const back = page.getByRole('link', { name: 'Back to reports' })
  await expect(back).toHaveText('')
  await expect(back.locator('svg.lucide-arrow-left')).toBeVisible()
  expect((await back.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await back.click()
  await expect(rows).toHaveCount(2)
  await withReportListResponse(page, () => page.reload())
  await expect(rows.locator(`a[href$="/${report}"]`)).toBeVisible()
  await expect(unread).toHaveCount(0)
  expect(fixture.submitted()).toBe(2)
})

test('opening a report marks it read after loading, clears the inbox badge and does not resubmit after refresh', async ({
  page,
}) => {
  const fixture = await reportsFixture(page)
  expect(fixture.readRequests).toEqual([])
  await expect(page.locator('main article')).toHaveCount(2)
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let requested = false
  await page.route(
    (url) => url.pathname === fixtureReportPath(id(71)),
    async (route) => {
      fixtureReportContext(route, id(71))
      requested = true
      await gate
      await route.fallback()
    },
  )
  try {
    await page
      .locator('main article')
      .last()
      .getByRole('link', { name: 'Espionage', exact: true })
      .click()
    await expect.poll(() => requested).toBe(true)
    await expect(page.getByText('Fetching this report…')).toBeVisible()
    expect(fixture.readRequests).toEqual([])
    await withFixtureResponse(
      page,
      matchesWorldAction('MarkReportRead'),
      async () => {
        release()
      },
    )
  } finally {
    release()
  }
  await expect(
    page.getByRole('region', { name: 'Report observation' }),
  ).toBeVisible()
  await expect.poll(() => fixture.headers[1].read).toBe(true)
  await expect(
    page.getByRole('status', { name: 'Unread reports' }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Mark read', exact: true }),
  ).toHaveCount(0)
  expect(fixture.readRequests).toEqual([id(71)])
  await withReportResponse(page, id(71), () => page.reload())
  await expect(
    page.getByRole('region', { name: 'Report observation' }),
  ).toBeVisible()
  await expect.poll(() => fixture.headers[1].read).toBe(true)
  expect(fixture.readRequests).toEqual([id(71)])
  await page.getByRole('link', { name: 'Back to reports' }).click()
  await page.locator(`main article a[href="${reportPath(id(71))}"]`).click()
  await expect(page).toHaveURL(reportPath(id(71)))
  await expect(
    page.getByRole('region', { name: 'Report observation' }),
  ).toBeVisible()
  await expect.poll(() => fixture.headers[1].read).toBe(true)
  expect(fixture.readRequests).toEqual([id(71)])
})

test('failed or abandoned report loads do not mark reports read', async ({
  page,
}) => {
  const fixture = await reportsFixture(page)
  const failedDetail = (url: URL) => url.pathname === fixtureReportPath(id(71))
  await page.route(failedDetail, (route) => {
    fixtureReportContext(route, id(71))
    return route.fulfill({ status: 503, json: { code: 'Unavailable' } })
  })
  await withFixtureResponseStatus(
    page,
    (response) =>
      response.request().method() === 'POST' &&
      failedDetail(new URL(response.url())),
    () => page.goto(reportPath(id(71))),
    503,
  )
  await expect(
    page.getByRole('button', { name: 'Retry reports' }),
  ).toBeVisible()
  expect(fixture.readRequests).toEqual([])
  let release!: () => void
  let requested = false
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.unroute(failedDetail)
  await page.route(failedDetail, async (route) => {
    fixtureReportContext(route, id(71))
    requested = true
    await gate
    await route.fallback()
  })
  try {
    await page.getByRole('button', { name: 'Retry reports' }).click()
    await expect.poll(() => requested).toBe(true)
    await page.getByRole('link', { name: 'Back to reports' }).click()
    await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/reports`)
    // The URL changes before React commits the inbox and cancels the detail load.
    // Deliver the held response only after the user has actually left the report.
    await expect(
      page.getByRole('heading', { name: 'Reports', level: 2, exact: true }),
    ).toBeVisible()
    await expect(page.locator('main article')).toHaveCount(2)
    await withReportResponse(page, id(71), async () => release())
  } finally {
    release()
  }
  await expect(page.locator('main article')).toHaveCount(2)
  expect(fixture.readRequests).toEqual([])
  expect(fixture.headers[1].read).toBe(false)
})

test('report whitespace opens the report while controls and keyboard stay independent at 1280px', async ({
  page,
}) => {
  const width = 1280
  await page.setViewportSize({ width, height: 900 })
  const fixture = await reportsFixture(page)
  const inbox = reportPath()
  const rows = page.getByRole('article')
  // Hit the empty padding at the bottom of the row, away from the title/controls.
  const row = rows.first()
  const box = (await row.boundingBox())!
  await withReportResponse(page, id(70), () =>
    page.mouse.click(box.x + box.width / 2, box.y + box.height - 2),
  )
  await expect(page).toHaveURL(reportPath(id(70)))
  await expect(
    page.getByRole('region', { name: 'Report observation' }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Back to reports' }).click()
  await selectReports(page)
  await expect(rows).toHaveCount(2)
  const select = rows.first().getByRole('checkbox')
  await select.check()
  await expect(select).toBeChecked()
  await expect(page).toHaveURL(inbox)
  await select.press('Space')
  await expect(select).not.toBeChecked()
  await expect(
    row.getByRole('button', { name: /^(Unstar|Star) report$/ }),
  ).toHaveCount(0)
  const openTriage = () => selectReports(page)
  await row.getByRole('link', { name: 'Espionage', exact: true }).click()
  await page
    .getByRole('button', { name: 'Star report', exact: true })
    .press('Enter')
  await expect(
    page.getByRole('button', { name: 'Unstar report', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(
    page.getByRole('button', { name: 'Unstar report', exact: true }),
  ).toBeEnabled()
  await diagnosticScreenshot(page, {
    path: `test-results/report-detail-star-${width}x900.png`,
  })
  await page.getByRole('link', { name: 'Back to reports' }).click()
  await openTriage()
  await expect(select).toBeEnabled()
  const remove = row.getByRole('button', {
    name: 'Archive report',
    exact: true,
  })
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
  await page
    .getByRole('button', { name: 'Unstar report', exact: true })
    .press('Enter')
  await expect(
    page.getByRole('button', { name: 'Star report', exact: true }),
  ).toHaveAttribute('aria-pressed', 'false')
  await page.getByRole('link', { name: 'Back to reports' }).click()
  await openTriage()
  await expect(remove).toBeEnabled()
  // Native Tab/Enter navigation still opens the same report.
  await select.focus()
  await page.keyboard.press('Tab')
  const link = row.getByRole('link', { name: 'Espionage', exact: true })
  await expect(link).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(reportPath(id(70)))
  await page.getByRole('link', { name: 'Back to reports' }).click()
  await rows
    .first()
    .getByRole('button', { name: 'Archive report', exact: true })
    .click()
  await expect.poll(fixture.submitted).toBe(1)
  await expect(page).toHaveURL(inbox)
})

test.describe('report touch actions', () => {
  test.use({ hasTouch: true })

  for (const width of [320, 820]) {
    test(`delete edges stay independent from row navigation at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      const fixture = await reportsFixture(page)
      const inbox = reportPath()
      const row = page.getByRole('article').first()
      const remove = row.getByRole('button', {
        name: 'Archive report',
        exact: true,
      })
      await expect(
        row.getByRole('button', { name: /^(Unstar|Star) report$/ }),
      ).toHaveCount(0)
      await expect(remove).toBeEnabled()
      const box = (await remove.boundingBox())!
      expect(box.width).toBe(44)
      expect(box.height).toBe(44)
      expect((await remove.locator('svg').boundingBox())!.width).toBe(16)

      // Tap the expanded button corners, outside the glyph.
      fixture.setMode('rejected')
      for (const [x, y] of [
        [2, 2],
        [42, 2],
        [2, 42],
        [42, 42],
      ]) {
        const submitted = fixture.submitted()
        await remove.tap({ position: { x, y } })
        await expect.poll(fixture.submitted).toBe(submitted + 1)
        await expect(page.getByTestId('game-error-banner')).toContainText(
          'Action rejected: Not Found',
        )
        await expect(row.getByRole('alert')).toHaveCount(0)
        await expect(remove).toBeEnabled()
        const removeBox = (await remove.boundingBox())!
        const rowBox = (await row.boundingBox())!
        expect(
          Math.abs(
            removeBox.x +
              removeBox.width -
              rowBox.x -
              rowBox.width +
              (width >= 768 ? 8 : 0),
          ),
        ).toBeLessThanOrEqual(1)
        await expect(page).toHaveURL(inbox)
        expect(fixture.readRequests).toEqual([])
      }
      await diagnosticScreenshot(page, {
        path: `test-results/report-actions-rejected-${width}x900.png`,
      })

      fixture.headers[0].starred = true
      fixture.headers[0].shared = true
      fixture.bumpRevision()
      await withReportListResponse(page, () => page.reload())
      await expect(remove).toBeDisabled()
      await remove.scrollIntoViewIfNeeded()
      const disabledBox = (await remove.boundingBox())!
      for (const [x, y] of [
        [2, 2],
        [42, 2],
        [2, 42],
        [42, 42],
      ]) {
        await page.touchscreen.tap(disabledBox.x + x, disabledBox.y + y)
        await expect(page).toHaveURL(inbox)
        expect(fixture.submitted()).toBe(4)
      }

      // Touch and desktop selection share the tablet row. The phone retains
      // the additional detail confirmation and post-navigation padding tap.
      if (width >= 768) return
      // Shared reports can only be unstarred from their detail page.
      await withReportResponse(page, id(70), () =>
        row.getByRole('link', { name: 'Espionage', exact: true }).tap(),
      )
      const detailArchive = page.getByRole('button', {
        name: 'Archive report',
        exact: true,
      })
      const share = page.getByRole('button', {
        name: 'Share report',
        exact: true,
      })
      const geometry = await detailArchive.boundingBox()
      const shareBox = await share.boundingBox()
      expect(geometry!.width).toBe(44)
      expect(geometry!.height).toBe(44)
      expect(geometry!.x).toBeGreaterThanOrEqual(shareBox!.x + shareBox!.width)
      expect(geometry!.x + geometry!.width).toBeLessThanOrEqual(width)
      const star = page.getByRole('button', {
        name: 'Unstar report',
        exact: true,
      })
      await expect(star).toHaveAttribute('aria-pressed', 'true')
      await star.tap()
      const dialog = page.getByRole('dialog', {
        name: 'Unstar this shared report?',
      })
      await expect(dialog).toBeVisible()
      await diagnosticScreenshot(page, {
        path: `test-results/report-actions-confirm-${width}x900.png`,
      })
      await dialog.getByRole('button', { name: 'Keep starred' }).tap()
      await expect(dialog).toBeHidden()
      expect(fixture.headers[0].starred).toBe(true)
      await star.tap()
      await dialog
        .getByRole('button', { name: 'Unstar report', exact: true })
        .tap()
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
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width)
    })
  }
})

// Opening the HUD while the Reports route owns an outstanding preference must
// display the shared loading state and populate the actual panel on commitment.
test('the open HUD shows its unread report after a pending archive settles', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const fixture = await reportsFixture(page)
  const pagesBefore = fixture.pageRequests.filter(
    (cursor) => cursor !== null,
  ).length
  let release!: () => void
  fixture.pause(
    new Promise<void>((resolve) => {
      release = resolve
    }),
  )
  const panel = page.getByRole('dialog', { name: 'Command uplink' })
  try {
    await page
      .getByRole('article')
      .first()
      .getByRole('button', { name: 'Archive report' })
      .click()
    await expect.poll(fixture.submitted).toBe(1)
    await page.getByTestId('command-orb').click()
    await expect(
      panel.getByRole('status').filter({ hasText: 'Loading intelligence…' }),
    ).toBeVisible()
    expect(
      fixture.pageRequests.filter((cursor) => cursor !== null).length,
    ).toBe(pagesBefore)
  } finally {
    release()
  }
  await expect(
    panel
      .getByLabel('Intelligence list')
      .getByRole('button', { name: /Espionage report/ }),
  ).toBeVisible()
  await expect(
    panel.getByRole('status').filter({ hasText: 'Loading intelligence…' }),
  ).toHaveCount(0)
})

// Feature-originated errors are portaled through the shell; a banner-only
// component cannot observe the feature message crossing into the real HUD.
test('the cleanup notice moves intact between Reports and the command HUD', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const fixture = await reportsFixture(page, true, 2, 50)
  fixture.setMode('rejected')
  await selectReports(page)
  await page.getByRole('button', { name: 'Select loaded reports (2)' }).click()
  await withFixtureResponse(page, matchesWorldAction('SetReportsHidden'), () =>
    page.getByRole('button', { name: 'Archive selected (2)' }).click(),
  )
  const banner = page.getByTestId('game-error-banner')
  const message = banner
    .getByRole('alert')
    .filter({ hasText: 'Cleanup stopped.' })
  await expect(message).toBeVisible()
  const original = (await message.elementHandle())!
  const announcement = (await banner
    .getByTestId('order-announcement')
    .elementHandle())!
  const announced = await announcement.textContent()
  await page.getByRole('button', { name: 'Open command HUD' }).click()
  const hud = page.getByRole('dialog', { name: 'Command uplink' })
  await expect(
    hud.getByRole('alert').filter({ hasText: 'Cleanup stopped.' }),
  ).toBeVisible()
  expect(await original.evaluate((el) => !!el.closest('dialog'))).toBe(true)
  expect(await announcement.evaluate((el) => !!el.closest('dialog'))).toBe(true)
  expect(await announcement.textContent()).toBe(announced)
  await expect(banner).toHaveCount(1)
  await hud.getByRole('button', { name: 'Close command HUD' }).click()
  await expect(hud).toBeHidden()
  await expect(
    page
      .getByRole('main')
      .getByRole('alert')
      .filter({ hasText: 'Cleanup stopped.' }),
  ).toBeVisible()
  expect(await original.evaluate((el) => !!el.closest('main'))).toBe(true)
})

// The browser boundary includes the same-envelope retry through the real HTTP
// adapter and construction of a fresh Coordinator on document reload.
test('immediate retry works and reload discards old order recovery at 390px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const fixture = await reportsFixture(page, true, 2, 50)
  const submissions: components['schemas']['ForegroundAction4'][] = []
  await page.route(`**${commandsPath}`, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    submissions.push(route.request().postDataJSON())
    return route.fallback()
  })
  await page.evaluate(() => {
    for (const storage of [sessionStorage, localStorage]) {
      for (const key of ['attempts:v4', 'history:v3', 'session:v2'])
        storage.setItem(`orbit:${key}:obsolete`, '{}')
    }
  })
  fixture.setMode('uncertain')
  const archive = page
    .getByRole('article')
    .first()
    .getByRole('button', { name: 'Archive report' })
  const notice = page.getByRole('complementary', {
    name: 'Action needs attention',
  })
  const retry = notice.getByRole('button', { name: 'Retry order' })
  await withFixtureResponseStatus(
    page,
    matchesWorldAction('SetReportHidden'),
    () => archive.click(),
    503,
  )
  await expect(archive).toBeDisabled()
  await expect(notice).toContainText(
    'We’re checking whether this order went through.',
  )
  await expect(page.getByRole('article').first()).not.toContainText(
    'We’re checking',
  )
  await withFixtureResponseStatus(
    page,
    matchesWorldAction('SetReportHidden'),
    () => retry.click(),
    503,
  )
  expect(submissions).toHaveLength(2)
  expect(submissions[0].gameplay.command).toEqual({
    type: 'World',
    action: { type: 'SetReportHidden', report: id(70), hidden: true },
  })
  expect(submissions[1]).toEqual(submissions[0])
  await expect(retry).toBeEnabled()
  const announcement = (await page
    .getByTestId('order-announcement')
    .elementHandle())!
  await page.getByRole('button', { name: 'Open command HUD' }).click()
  const hud = page.getByRole('dialog', { name: 'Command uplink' })
  await expect(hud.getByRole('button', { name: 'Retry order' })).toBeVisible()
  expect(await announcement.evaluate((el) => !!el.closest('dialog'))).toBe(true)
  await hud.getByRole('button', { name: 'Dismiss order notices' }).click()
  await expect(
    hud.getByRole('heading', { name: 'Command uplink' }),
  ).toBeFocused()
  await hud.getByRole('button', { name: 'Close command HUD' }).click()
  await expect(hud).toBeHidden()
  await expect(
    page.getByRole('main').getByTestId('order-announcement'),
  ).toHaveCount(1)
  expect(await announcement.evaluate((el) => !!el.closest('main'))).toBe(true)
  await expect(archive).toBeDisabled()
  await withReportListResponse(page, () => page.reload())
  await expect(page.getByRole('article')).toHaveCount(2)
  await expect(archive).toBeEnabled()
  await expect(notice).toHaveCount(0)
  await expect(page.getByTestId('order-announcement')).toBeEmpty()
  expect(submissions).toHaveLength(2)
  expect(
    await page.evaluate(() =>
      [sessionStorage, localStorage].flatMap((storage) =>
        Object.keys(storage).filter((key) =>
          /^orbit:(attempts|history|session):/.test(key),
        ),
      ),
    ),
  ).toEqual([])
  await withBootstrapResponse(page, () => page.goto(settingsGamePath()))
  await expect(
    page.getByRole('heading', { name: 'Game settings', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: /Retry order/ })).toHaveCount(0)
  await expect(
    page.getByRole('region', { name: 'Orders awaiting confirmation' }),
  ).toHaveCount(0)
})

test('detail archive returns only after acceptance with list context at 390px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const fixture = await reportsFixture(page, true, 24, 50)
  await page
    .getByRole('button', { name: 'Filter reports', exact: true })
    .click()
  const filter = page.getByRole('dialog', {
    name: 'Filter reports',
    exact: true,
  })
  await filter
    .getByRole('combobox', { name: 'Report type' })
    .selectOption('Espionage')
  await filter.getByRole('button', { name: /Dismiss (sheet|popover)/ }).click()
  await page.getByRole('button', { name: 'Sort reports', exact: true }).click()
  await page
    .getByRole('menuitemradio', { name: 'Oldest first', exact: true })
    .click()
  await expect(page.getByRole('menu', { name: 'Sort reports' })).toBeHidden()
  await expect
    .poll(() => page.evaluate(() => document.body.style.position))
    .not.toBe('fixed')
  const rows = page.locator('main article')
  await expect(
    rows.first().getByRole('link', { name: 'Espionage' }),
  ).toHaveAttribute('href', reportPath(id(93)))
  const link = rows
    .nth(16)
    .getByRole('link', { name: 'Espionage', exact: true })
  const report = (await link.getAttribute('href'))!.split('/').at(-1)!
  await link.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  const scroll = await page.evaluate(() => window.scrollY)
  expect(scroll).toBeGreaterThan(100)
  await withReportResponse(page, report, () => link.click())
  await expect(
    page.getByRole('region', { name: 'Report observation' }),
  ).toBeVisible()
  let release!: () => void
  fixture.pause(
    new Promise<void>((resolve) => {
      release = resolve
    }),
  )
  await withFixtureResponse(
    page,
    matchesWorldAction('ArchiveReport'),
    async () => {
      try {
        await page
          .getByRole('button', { name: 'Archive report', exact: true })
          .click()
        await expect.poll(fixture.submitted).toBe(1)
        await expect(page).toHaveURL(reportPath(report))
        await expect(
          page.getByRole('button', { name: 'Move to inbox' }),
        ).toBeDisabled()
      } finally {
        release()
      }
    },
  )
  await expect(page).toHaveURL(reportPath())
  await expect(rows).toHaveCount(23)
  await expect(
    page.getByRole('button', { name: 'Remove Espionage filter' }),
  ).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(
        (y) =>
          window.scrollY -
          Math.min(y, document.documentElement.scrollHeight - innerHeight),
        scroll,
      ),
    )
    .toBe(0)
  await expect(
    rows.first().getByRole('link', { name: 'Espionage', exact: true }),
  ).toHaveAttribute('href', reportPath(id(93)))
  await page.getByRole('button', { name: 'Archived', exact: true }).click()
  await expect(rows).toHaveCount(1)
  await rows.getByRole('link', { name: 'Espionage', exact: true }).click()
  await expect(page).toHaveURL(reportPath(report))
  await withFixtureResponse(page, matchesWorldAction('SetReportHidden'), () =>
    page.getByRole('button', { name: 'Move to inbox' }).click(),
  )
  await expect(
    page.getByRole('region', { name: 'Report observation' }),
  ).toBeVisible()
  await expect(page).toHaveURL(reportPath(report))
  await withFixtureResponse(page, matchesWorldAction('ArchiveReport'), () =>
    page.getByRole('button', { name: 'Archive report' }).click(),
  )
  await expect(page).toHaveURL(reportPath())
  await expect(
    page.getByRole('button', { name: 'Archived', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(rows).toHaveCount(1)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
})

// Recovery is outside the detail toolbar. A committed retry through that
// independent control must still activate the original detail's return.
test('detail archive rejection and uncertainty stay recoverable at 1440px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const fixture = await reportsFixture(page, true, 2, 50)
  await withReportResponse(page, id(70), () =>
    page
      .getByRole('article')
      .first()
      .getByRole('link', { name: 'Espionage', exact: true })
      .click(),
  )
  const archive = page.getByRole('button', {
    name: 'Archive report',
    exact: true,
  })
  fixture.setMode('rejected')
  await withFixtureResponse(page, matchesWorldAction('ArchiveReport'), () =>
    archive.click(),
  )
  await expect(page.getByTestId('game-error-banner')).toContainText(
    'Action rejected: Not Found',
  )
  await expect(page).toHaveURL(reportPath(id(70)))
  await expect(archive).toBeEnabled()
  fixture.setMode('uncertain')
  await withFixtureResponseStatus(
    page,
    matchesWorldAction('ArchiveReport'),
    () => archive.click(),
    503,
  )
  await expect(page.getByTestId('game-error-banner')).toContainText(
    'We’re checking whether this order went through.',
  )
  await expect(page).toHaveURL(reportPath(id(70)))
  await expect(archive).toBeDisabled()
  fixture.setMode('success')
  await withFixtureResponse(page, matchesWorldAction('ArchiveReport'), () =>
    page.getByRole('button', { name: 'Retry order', exact: true }).click(),
  )
  await expect(page).toHaveURL(reportPath())
  await expect(page.getByRole('article')).toHaveCount(1)
})

test('leaving detail during archive does not pull the player back after acceptance', async ({
  page,
}) => {
  const fixture = await reportsFixture(page, true, 2, 50)
  // With B already read, only the archive can advance the fixture to revision 2.
  fixture.headers[1].read = true
  const open = () =>
    page
      .getByRole('article')
      .first()
      .getByRole('link', { name: 'Espionage', exact: true })
      .click()
  await withReportResponse(page, id(70), open)
  await expect(
    page.getByRole('region', { name: 'Report observation' }),
  ).toBeVisible()
  let release!: () => void
  fixture.pause(
    new Promise<void>((resolve) => {
      release = resolve
    }),
  )
  await withFixtureResponse(
    page,
    matchesWorldAction('ArchiveReport'),
    async () => {
      try {
        await page.getByRole('button', { name: 'Archive report' }).click()
        await expect.poll(fixture.submitted).toBe(1)
        await page.getByRole('link', { name: 'Back to reports' }).click()
        await expect(page.getByRole('article')).toHaveCount(1)
        await withReportResponse(page, id(71), open)
        await expect(page).toHaveURL(reportPath(id(71)))
        // This overview is requested only after Coordinator.receive has published
        // the archive receipt and notified any surviving navigation observer.
        await withFixtureResponse(
          page,
          (response) =>
            response.url().endsWith('/overview') &&
            response.request().headers()['x-orbit-minimum-revision'] === '2',
          async () => {
            release()
          },
        )
      } finally {
        release()
      }
    },
  )
  await expect(page).toHaveURL(reportPath(id(71)))
  await expect(
    page.getByRole('region', { name: 'Report observation' }),
  ).toBeVisible()
})

for (const [surface, width] of [
  ['reports', 1280],
  ['orb', 390],
] as const) {
  test(`mark shown read from ${surface} leaves unloaded and archived reports unread at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const fixture = await reportsFixture(page, true, 2, 20)
    fixture.headers[0].read = false
    for (let index = 2; index < 78; index++)
      fixture.headers.push({
        ...fixture.headers[0],
        id: id(70 + index),
        observed_at: fixture.headers[0].observed_at - index * 1000,
        hidden: index === 77,
        starred: index === 76,
        shared: index === 76,
      })
    // The original second fixture report is much older than the added rows.
    // Give this selection test one explicit display order before asserting IDs.
    fixture.headers.forEach((header, index) => {
      header.observed_at = fixture.headers[0].observed_at - index * 1000
    })
    fixture.bumpRevision()
    await withFixtureResponse(
      page,
      (response) =>
        response.url().endsWith('/reports') &&
        response.request().method() === 'POST' &&
        response.request().postDataJSON().filter?.unread_only === false,
      () => page.reload(),
    )
    await expect(page.locator('main article').first()).toBeVisible()
    expect(await page.locator('main article').count()).toBeLessThan(77)
    if (surface === 'orb') {
      await page.getByRole('button', { name: 'Open command HUD' }).click()
      const dialog = page.getByRole('dialog', { name: 'Command uplink' })
      const all = dialog.getByRole('link', { name: 'All reports', exact: true })
      await expect(all).toBeInViewport()
      const fleets = dialog.getByRole('button', { name: /^Fleets/ })
      await expect(fleets).toHaveAttribute('aria-expanded', 'false')
      const heading = dialog.getByRole('heading', {
        name: 'Reports & messages',
      })
      expect((await fleets.boundingBox())!.y).toBeLessThan(
        (await heading.boundingBox())!.y,
      )
      const actions = dialog.getByRole('group', {
        name: 'Report and message actions',
      })
      for (const action of await actions.locator('a, button').all()) {
        const bounds = (await action.boundingBox())!
        expect(bounds.width).toBe(width < 768 ? 44 : 24)
        expect(bounds.height).toBe(width < 768 ? 44 : 24)
        await expect(action).toHaveAttribute('data-button-variant', 'ghost')
      }
      await expect(all).toHaveAttribute('href', reportPath())
      await expect(
        actions.getByRole('link', { name: 'Messages', exact: true }),
      ).toHaveAttribute('href', `/u/andromeda/b/${body.id}/messages`)
      await diagnosticScreenshot(page, {
        path: `test-results/reports-orb-idle-${width}x900.png`,
      })
      await all.focus()
      await expect(all).toBeFocused()

      const first = dialog
        .locator('[aria-label="Intelligence list"] button')
        .first()
      await expect(first).toBeVisible()
      expect((await all.boundingBox())!.y).toBeLessThan(
        (await first.boundingBox())!.y,
      )
    } else {
      await page.getByRole('button', { name: 'More report actions' }).click()
    }
    await diagnosticScreenshot(page, {
      path: `test-results/reports-${surface}-actions-${width}x900.png`,
    })
    const shownCount = await page
      .locator(
        surface === 'orb'
          ? '[aria-label="Intelligence list"] button'
          : 'main article',
      )
      .count()
    await withFixtureResponse(
      page,
      (response) =>
        response.request().method() === 'POST' &&
        response.url().endsWith('/reports/read'),
      () =>
        page
          .getByRole(surface === 'orb' ? 'button' : 'menuitem', {
            name: 'Mark shown as read',
            exact: true,
          })
          .click(),
    )
    await expect(page.getByTestId('unread-count')).toHaveText(
      String(77 - shownCount),
    )
    await expect(
      page.getByText('Shown reports marked as read.', { exact: true }),
    ).toBeHidden()
    expect(fixture.readBatches).toHaveLength(1)
    expect(fixture.readRequests).toEqual(
      fixture.headers.slice(0, shownCount).map((row) => row.id),
    )
    expect(fixture.headers.slice(0, shownCount).every((row) => row.read)).toBe(
      true,
    )
    expect(fixture.headers.slice(shownCount).every((row) => !row.read)).toBe(
      true,
    )
    expect(fixture.headers[76]).toMatchObject({
      starred: true,
      shared: true,
      hidden: false,
    })
    expect(fixture.headers[77].hidden).toBe(true)
    await diagnosticScreenshot(page, {
      path: `test-results/reports-${surface}-read-${width}x900.png`,
    })
  })
}
