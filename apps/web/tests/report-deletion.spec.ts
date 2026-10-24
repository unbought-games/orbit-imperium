import { test, expect, type Page } from '@playwright/test'
import { shellFixture, binding, body, id } from './fixtures/game'

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
  await page.route('**/api/**/reports**', async (route) => {
    const request = route.request().postDataJSON()
    const context = request.context ?? request
    const report = headers.find((r) =>
      new URL(route.request().url()).pathname.endsWith(r.id),
    )
    const rows = headers.filter((r) => request.include_hidden || !r.hidden)
    const index = request.cursor ? 1 : 0
    await route.fulfill({
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
    })
  })
  let mode: 'success' | 'rejected' | 'uncertain' = 'success'
  let pause: Promise<void> | undefined
  let submitted = 0
  await page.route('**/commands', async (route) => {
    const envelope = route.request().postDataJSON().gameplay
    expect(envelope.command.type).toBe('World')
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
  await expect(
    page.getByRole('button', { name: 'Load more reports' }),
  ).toBeVisible()
  return {
    headers,
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
    ).toBeEnabled()
    await expect(rows).toHaveCount(1)
    await expect(
      page.getByText('Submitting action.', { exact: true }),
    ).toHaveCount(0)
    release()
    await expect(rows).toHaveCount(1)
    await expect(unread).toHaveCount(0)
    expect(fixture.headers[1].hidden).toBe(true)
    expect(fixture.headers[1].read).toBe(false)
    await page.reload()
    await expect(rows).toHaveCount(1)
    await page.getByLabel('Show deleted reports').check()
    await page.getByRole('button', { name: 'Load more reports' }).click()
    await expect(rows.last()).toContainText('Deleted')
    await rows
      .last()
      .getByRole('link', { name: 'Espionage', exact: true })
      .click()
    await expect(
      page.getByRole('region', { name: 'Report observation' }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Restore report' }),
    ).toBeVisible()
    await page.reload()
    await page.getByRole('button', { name: 'Restore report' }).click()
    await expect(
      page.getByRole('button', { name: 'Delete report' }),
    ).toBeEnabled()
    await expect(unread).toBeVisible()
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
    await page.getByRole('link', { name: 'Back to reports' }).click()
    await page.getByLabel('Show deleted reports').uncheck()
    await expect(rows).toHaveCount(1)
    await page.getByLabel('Show deleted reports').check()
    await page.getByRole('button', { name: 'Load more reports' }).click()
    await rows.last().getByRole('button', { name: 'Restore report' }).click()
    await expect(unread).toBeVisible()
    await page.getByLabel('Show deleted reports').uncheck()
    await page.getByRole('button', { name: 'Load more reports' }).click()
    await expect(rows).toHaveCount(2)
    expect(fixture.submitted()).toBe(4)
  })
}

test('failed and uncertain deletion roll back and offer durable recovery', async ({
  page,
}) => {
  const fixture = await reportsFixture(page)
  const row = page.locator('main article').first()
  let release!: () => void
  fixture.pause(
    new Promise<void>((resolve) => {
      release = resolve
    }),
  )
  fixture.setMode('rejected')
  await row.getByRole('button', { name: 'Delete report' }).click()
  await expect(row).toHaveCount(0)
  release()
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

test('pagination and filters cannot suppress reconciliation during a pending deletion', async ({
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
  await expect(page.locator('main article')).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Load more reports' }),
  ).toBeDisabled()
  await expect(
    page.getByRole('button', { name: 'Refresh reports' }),
  ).toBeDisabled()
  await expect(page.getByLabel('Show deleted reports')).toBeDisabled()
  release()
  await expect(row).toContainText('Unread')
  await expect(
    page.getByRole('button', { name: 'Load more reports' }),
  ).toHaveCount(0)
  await expect(page.getByLabel('Show deleted reports')).toBeEnabled()
  expect(fixture.headers[0].hidden).toBe(true)
})

test('independent deletes are optimistic and each failure rolls back only its report', async ({
  page,
}) => {
  const fixture = await reportsFixture(page)
  await page.getByRole('button', { name: 'Load more reports' }).click()
  const rows = page.locator('main article')
  let release!: () => void
  fixture.pause(
    new Promise<void>((resolve) => {
      release = resolve
    }),
  )
  fixture.setMode('rejected')
  await rows.first().getByRole('button', { name: 'Delete report' }).click()
  await expect(rows).toHaveCount(1)
  await rows.first().getByRole('button', { name: 'Delete report' }).click()
  await expect(rows).toHaveCount(0)
  await expect.poll(fixture.submitted).toBe(2)
  release()
  await expect(rows).toHaveCount(2)
  await expect(rows.first()).toContainText('Action rejected')
  await expect(rows.last()).toContainText('Action rejected')
})

test('a successful HTTP response confirms deletion before the game view refreshes', async ({
  page,
}) => {
  const fixture = await reportsFixture(page)
  await page.getByLabel('Show deleted reports').check()
  let release!: () => void
  const pause = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/overview', async (route) => {
    await pause
    await route.fallback()
  })
  const row = page.locator('main article').first()
  try {
    await row.getByRole('button', { name: 'Delete report' }).click()
    await expect(
      row.getByRole('button', { name: 'Restore report' }),
    ).toBeEnabled()
    await expect(row).toContainText('Deleted')
    await expect(
      page.getByText('Action committed; awaiting updated view.', {
        exact: true,
      }),
    ).toHaveCount(0)
    expect(fixture.headers[0].hidden).toBe(true)
    await row.getByRole('button', { name: 'Restore report' }).click()
    await expect(
      row.getByRole('button', { name: 'Delete report' }),
    ).toBeEnabled()
    expect(fixture.headers[0].hidden).toBe(false)
    await row.getByRole('button', { name: 'Delete report' }).click()
    await expect(
      row.getByRole('button', { name: 'Restore report' }),
    ).toBeEnabled()
    expect(fixture.headers[0].hidden).toBe(true)
  } finally {
    release()
  }
})
