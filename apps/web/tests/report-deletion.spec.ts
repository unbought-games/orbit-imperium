import { test, expect, type Page } from '@playwright/test'
import { shellFixture, refreshGame, binding, body, id } from './fixtures/game'

async function reportsFixture(page: Page) {
  let revision = 1
  const headers = [
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
  await shellFixture(page, {
    protocol: 4,
    extraCapabilities: ['Reports'],
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
    const rows = headers.filter((r) => request.include_hidden || !r.hidden)
    const index = request.cursor ? 1 : 0
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
              items: rows.slice(index, index + 1),
              has_more: index + 1 < rows.length,
              next_cursor: index + 1 < rows.length ? id(72) : null,
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
    if (envelope.command.action.type === 'MarkReportRead') {
      readRequests.push(envelope.command.action.report)
      headers.find(r => r.id === envelope.command.action.report)!.read = true
      revision++
      return route.fulfill({ json: {
        protocol: 4, binding, command_id: envelope.command_id,
        admitted_at: Date.now(), executed_at: Date.now(), status: 'Committed',
        result_ids: [], minimum_viewer_revision: String(revision),
      } })
    }
    expect(envelope.command.action.type).toBe('SetReportHidden')
    submitted++
    await pause
    if (mode === 'uncertain')
      return route.fulfill({ status: 503, json: { code: 'Unavailable' } })
    if (mode === 'success') {
      headers.find((r) => r.id === envelope.command.action.report)!.hidden =
        envelope.command.action.hidden
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
  await page.goto(`/u/andromeda/reports?body=${body.id}`)
  await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/reports`)
  await expect(
    page.getByRole('button', { name: 'Load more reports' }),
  ).toBeVisible()
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

for (const width of [1440, 390]) {
  test(`delete and restore reports persist across list, detail and reload at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    const fixture = await reportsFixture(page)
    await expect(page.getByRole('button', { name: 'Refresh reports' })).toHaveCount(0)
    await expect(page.getByLabel('Show deleted reports')).toHaveCount(0)
    await expect(page.getByText('Deleted reports leave your list and unread indicator.', { exact: false })).toHaveCount(0)
    await page.getByRole('button', { name: 'Load more reports' }).click()
    const rows = page.locator('main article')
    await expect(rows).toHaveCount(2)
    const unread = page.getByRole('status', { name: 'Unread reports' }).first()
    await expect(unread).toBeVisible()
    await page.screenshot({
      path: `test-results/reports-delete-list-${width}.png`,
      fullPage: true,
    })
    let release!: () => void
    fixture.pause(
      new Promise<void>((resolve) => {
        release = resolve
      }),
    )
    await rows.last().getByRole('button', { name: 'Delete report' }).click()
    await expect(
      rows.last().getByRole('button', { name: 'Delete report' }),
    ).toBeDisabled()
    await expect(rows.last()).toContainText('Submitting action.')
    await expect(rows).toHaveCount(2)
    release()
    await expect(rows).toHaveCount(1)
    await expect(unread).toHaveCount(0)
    expect(fixture.headers[1].hidden).toBe(true)
    expect(fixture.headers[1].read).toBe(false)
    await page.reload()
    await expect(rows).toHaveCount(1)
    await page.goto(`/u/andromeda/reports/${fixture.headers[1].id}?body=${body.id}`)
    await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/reports/${fixture.headers[1].id}`)
    await expect(
      page.getByRole('region', { name: 'Report observation' }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Restore report' }),
    ).toBeVisible()
    await expect.poll(() => fixture.headers[1].read).toBe(true)
    await page.reload()
    await page.getByRole('button', { name: 'Restore report' }).click()
    await expect(
      page.getByRole('button', { name: 'Delete report' }),
    ).toBeEnabled()
    await expect(unread).toHaveCount(0)
    await page.getByRole('button', { name: 'Delete report' }).click()
    await expect(
      page.getByRole('button', { name: 'Restore report' }),
    ).toBeEnabled()
    await expect(unread).toHaveCount(0)
    await page.screenshot({
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
    await page.goto(`/u/andromeda/reports/${fixture.headers[1].id}?body=${body.id}`)
    await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/reports/${fixture.headers[1].id}`)
    await page.getByRole('button', { name: 'Restore report' }).click()
    await expect(unread).toHaveCount(0)
    await page.getByRole('link', { name: 'Back to reports' }).click()
    await page.getByRole('button', { name: 'Load more reports' }).click()
    await expect(rows).toHaveCount(2)
    expect(fixture.submitted()).toBe(4)
  })
}

test('failed and uncertain deletion preserve the report and offer durable recovery', async ({
  page,
}) => {
  const fixture = await reportsFixture(page)
  const row = page.locator('main article').first()
  fixture.setMode('rejected')
  await row.getByRole('button', { name: 'Delete report' }).click()
  await expect(row).toContainText('Action rejected: Not Found')
  await expect(row.getByRole('button', { name: 'Delete report' })).toBeEnabled()
  expect(fixture.headers[0].hidden).toBe(false)
  fixture.setMode('uncertain')
  await row.getByRole('button', { name: 'Delete report' }).click()
  await expect(row).toContainText('Response uncertain. Your action is saved.')
  await expect(
    row.getByRole('button', { name: 'Delete report' }),
  ).toBeDisabled()
  await expect(
    page.getByRole('button', { name: 'Resolve saved command', exact: true }),
  ).toBeVisible()
  expect(fixture.headers[0].hidden).toBe(false)
  expect(fixture.submitted()).toBe(2)
})

test('pagination cannot suppress reconciliation during a pending deletion', async ({
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
  await row.getByRole('button', { name: 'Delete report' }).focus()
  await page.keyboard.press('Enter')
  await expect(row).toContainText('Submitting action.')
  await expect(
    page.getByRole('button', { name: 'Load more reports' }),
  ).toBeDisabled()
  release()
  await expect(row.getByLabel('Unread', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Load more reports' }),
  ).toHaveCount(0)
  expect(fixture.headers[0].hidden).toBe(true)
})


test('opening a report marks it read after loading, clears the inbox badge and does not resubmit after refresh', async ({ page }) => {
  const fixture = await reportsFixture(page)
  expect(fixture.readRequests).toEqual([])
  await page.getByRole('button', { name: 'Load more reports' }).click()
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
  await page.reload()
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
    await expect(page.locator('main article')).toHaveCount(1)
  } finally {
    release()
  }
  await response
  await expect(page.locator('main article')).toHaveCount(1)
  expect(fixture.readRequests).toEqual([])
  expect(fixture.headers[1].read).toBe(false)
})


for (const fail of [false, true]) {
  test(`late load-more ${fail ? 'failure' : 'success'} cannot change a refreshed inbox`, async ({ page }) => {
    const fixture = await reportsFixture(page)
    let release!: () => void
    fixture.holdMore(new Promise<void>(resolve => { release = resolve }), fail)
    await page.getByRole('button', { name: 'Load more reports' }).click()
    await expect.poll(() => fixture.pageRequests.filter(cursor => cursor !== null)).toEqual([id(72)])
    const requestCount = fixture.pageRequests.length
    // Refresh the first page while its old continuation is still in flight.
    fixture.headers[0].hidden = true
    fixture.bumpRevision()
    await refreshGame(page)
    const rows = page.locator('main article')
    await expect.poll(() => fixture.pageRequests.slice(requestCount)).toEqual([null])
    await expect(rows).toHaveCount(1)
    await expect(rows.first().getByLabel('Unread', { exact: true })).toBeVisible()
    const response = page.waitForResponse(r => r.url().endsWith('/reports') && r.request().postDataJSON().cursor === id(72))
    release()
    await response
    await expect(rows).toHaveCount(1)
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Retry reports' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Load more reports' })).toHaveCount(0)
  })
}


for (const change of ['navigate', 'revise', 'rebind', 'visibility', 'retry'] as const) {
  test(`report hook fences overlapping pages after ${change}`, async ({ page }) => {
    await shellFixture(page, { protocol: 4 })
    await page.goto('/')
    const result = await page.evaluate(async (change) => {
      const { reportsHarness, reportPage } = await import('/tests/fixtures/reports-hook.ts')
      const h = await reportsHarness()
      await h.resolve(0, reportPage(['a'], 'cursor'))
      await h.more()
      const requestsAfterDoubleClick = h.calls.length
      if (change === 'navigate') await h.navigate('b')
      else await h[change]()
      const before = h.state()
      await h.resolve(1, reportPage(['stale'], null))
      const after = h.state()
      if (change === 'visibility') await h.settleVisibility()
      const requests = h.calls.map(({ item, cursor }) => ({ item, cursor }))
      await h.close()
      return { requestsAfterDoubleClick, before, after, requests }
    }, change)
    expect(result.requestsAfterDoubleClick).toBe(2)
    expect(result.after).toEqual(result.before)
    expect(result.after.loadingMore).toBe(false)
    expect(result.after.ids).toEqual(change === 'rebind' ? [] : ['a'])
    expect(result.requests[1]).toEqual({ item: null, cursor: 'cursor' })
    expect(result.requests[2]).toEqual({ item: change === 'navigate' ? 'b' : null, cursor: null })
  })
}

test('report hook retains pages on return, reconciles headers and marks each opened report read once', async ({ page }) => {
  await shellFixture(page, { protocol: 4 })
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const { reportsHarness, reportPage, reportDetail } = await import('/tests/fixtures/reports-hook.ts')
    const h = await reportsHarness()
    await h.resolve(0, reportPage(['a'], 'cursor'))
    await h.more()
    await h.resolve(1, reportPage(['b'], null))
    await h.navigate('b')
    await h.navigate(null)
    const retained = h.state()
    await h.resolve(2, reportDetail('b', false))
    const afterCancelled = h.state()
    const sentAfterCancelled = h.sent.length
    await h.navigate('b')
    await h.resolve(3, reportDetail('b', false))
    await h.revise()
    await h.resolve(4, reportDetail('b', false))
    const sentAfterRefresh = h.sent.length
    await h.revise()
    await h.resolve(5, reportDetail('b', true, true))
    const hidden = h.state()
    await h.navigate(null)
    const requests = h.calls.map(({ item, cursor }) => ({ item, cursor }))
    await h.close()
    return { retained, afterCancelled, sentAfterCancelled, sentAfterRefresh, hidden, requests }
  })
  expect(result.retained).toMatchObject({ ids: ['a', 'b'], detail: null, loading: false, loadingMore: false })
  expect(result.afterCancelled).toEqual(result.retained)
  expect(result.sentAfterCancelled).toBe(0)
  expect(result.sentAfterRefresh).toBe(1)
  expect(result.hidden).toMatchObject({ ids: ['a'], detail: 'b' })
  expect(result.requests).toHaveLength(7)
  expect(result.requests[6]).toEqual({ item: null, cursor: null })
})

test('report hook ignores stale initial/detail failures and treats a current unconfirmed page as retryable', async ({ page }) => {
  await shellFixture(page, { protocol: 4 })
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const { reportsHarness, reportPage, reportDetail } = await import('/tests/fixtures/reports-hook.ts')
    const h = await reportsHarness()
    await h.retry()
    await h.resolve(1, reportPage(['fresh'], 'cursor'))
    await h.reject(0)
    const initial = h.state()
    await h.navigate('a')
    await h.navigate('b')
    await h.resolve(2, reportDetail('a', false))
    const pending = h.state()
    await h.resolve(3, reportDetail('b', true))
    await h.navigate(null)
    await h.resolve(4, reportPage(['fresh'], 'cursor'))
    await h.more()
    await h.resolve(5, null)
    const failed = h.state()
    await h.retry()
    await h.resolve(6, reportPage(['replacement'], null))
    const retried = h.state()
    const sent = h.sent
    await h.close()
    return { initial, pending, failed, retried, sent }
  })
  expect(result.initial).toMatchObject({ ids: ['fresh'], error: null, loading: false })
  expect(result.pending).toMatchObject({ detail: null, error: null, loading: true })
  expect(result.failed).toMatchObject({ ids: ['fresh'], error: 'Unable to confirm this report response. Try again.', loadingMore: false })
  expect(result.retried).toMatchObject({ ids: ['replacement'], error: null, loading: false })
  expect(result.sent).toEqual([])
})


test('report hook loads uncached reports while a visibility command is unresolved', async ({ page }) => {
  await shellFixture(page, { protocol: 4 })
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const { reportsHarness, reportPage, reportDetail } = await import('/tests/fixtures/reports-hook.ts')
    const h = await reportsHarness()
    await h.visibility()
    await h.resolve(1, reportPage(['a'], 'cursor'))
    await h.reject(0)
    const inbox = h.state()
    await h.more()
    const requestsAfterMore = h.calls.length
    await h.navigate('a')
    await h.resolve(2, reportDetail('a', true))
    const detail = h.state()
    await h.close()
    return { inbox, requestsAfterMore, detail }
  })
  expect(result.inbox).toMatchObject({ ids: ['a'], error: null, loading: false })
  expect(result.requestsAfterMore).toBe(2)
  expect(result.detail).toMatchObject({ detail: 'a', error: null, loading: false })
})
