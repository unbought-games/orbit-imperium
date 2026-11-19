import { test, expect } from './fixtures/test'
import { installGameFixture, binding, id } from './fixtures/game'
import type { Page } from '@playwright/test'
import { reportPath } from './fixtures/report-path'
import {
  withFixtureResponse,
  withFixtureResponseStatus,
  withReportListResponse,
  withReportResponse,
  withSharedReportResponse,
} from './fixtures/responses'

const reportId = id(70)
const token = id(75)
const payload = {
  kind: 'Espionage',
  observed_at: 1792692000000,
  target: {
    body: id(80),
    coordinates: { galaxy: 1, system: 2, position: 3 },
    owner: id(9),
    kind: 'Planet',
  },
  resources: {
    visibility: 'Known',
    value: { metal: '100000000', crystal: '200000000', deuterium: '300000000' },
  },
  fleet: { visibility: 'Unknown' },
  defenses: { visibility: 'Unknown' },
  buildings: { visibility: 'Unknown' },
  research: { visibility: 'Unknown' },
  activity: { type: 'None' },
  counterespionage: { probability_ppm: 0, detected: false },
}
const shared = {
  report: reportId,
  observed_at: payload.observed_at,
  options: { include_identity: false, include_coordinates: false },
  player_names: { 'participant-1': 'Player 1' },
  payload: { ...payload, target: { owner: 'participant-1', kind: 'Planet' } },
}
test(
  'public report is readable without game initialization',
  { tag: '@journey' },
  async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 1000 })
    const requests: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/api/')) requests.push(request.url())
    })
    await page.route(`**/api/v4/shared-reports/${token}`, (route) =>
      route.fulfill({ json: shared }),
    )
    await page.route(`**/reports/shared/${token}`, async (route) => {
      const response = await route.fetch()
      await route.fulfill({
        response,
        body: (await response.text()).replace(
          '<title>Orbit Imperium</title>',
          '<title>Shared espionage report · Orbit Imperium</title>',
        ),
      })
    })
    await withSharedReportResponse(page, token, () =>
      page.goto(`/reports/shared/${token}`),
    )
    await expect(
      page.getByRole('heading', { name: 'Shared report', exact: true }),
    ).toBeVisible()
    await expect(page).toHaveTitle('Shared espionage report · Orbit Imperium')
    await expect(page.getByText('Player 1', { exact: true })).toBeVisible()
    await expect(
      page.getByText('Unknown — this observation did not reveal this section.'),
    ).toHaveCount(4)
    await expect(page.getByText('100', { exact: true })).toBeVisible()
    expect(requests).toHaveLength(1)
    expect(requests[0]).toContain(`/api/v4/shared-reports/${token}`)
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 1000 })
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width)
    }
  },
)
test('a revoked report has a clear unavailable state', async ({ page }) => {
  await page.route(`**/api/v4/shared-reports/${token}`, (route) =>
    route.fulfill({ status: 404, json: { code: 'NotFound' } }),
  )
  await withFixtureResponseStatus(
    page,
    (response) =>
      new URL(response.url()).pathname === `/api/v4/shared-reports/${token}`,
    () => page.goto(`/reports/shared/${token}`),
    404,
  )
  await expect(page.getByRole('alert')).toContainText(
    'stopped sharing, or the report is no longer available',
  )
  await expect(
    page.getByRole('button', { name: 'Retry', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Resources', exact: true }),
  ).toHaveCount(0)
})

async function openSharingDetail(page: Page, published = false) {
  let active = published
  let hidden = false
  let starred = published
  let revision = 1
  await installGameFixture(page, {
    protocol: 4,
    extraCapabilities: ['Reports'],
    viewerRevision: () => String(revision),
  })
  await page.route(`**/api/**/reports/${reportId}`, async (route) => {
    const context = route.request().postDataJSON()
    await route.fulfill({
      json: {
        protocol: 4,
        binding,
        request_id: context.request_id,
        viewer_revision: String(revision),
        sampled_at: Date.now(),
        as_of_ms: Date.now(),
        data: {
          header: {
            id: reportId,
            kind: 'Espionage',
            observed_at: payload.observed_at,
            read: true,
            hidden,
            starred,
            shared: active,
          },
          payload,
        },
      },
    })
  })
  const actions: string[] = []
  await page.route(`**/api/**/reports/${reportId}/share`, async (route) => {
    const { action, context } = route.request().postDataJSON()
    expect(context.binding).toEqual(binding)
    expect(route.request().headers()['x-csrf-token']).toBeTruthy()
    actions.push(action.type)
    if (action.type === 'Create') {
      expect(action.options).toEqual({
        include_identity: false,
        include_coordinates: false,
      })
      active = true
      starred = true
      revision++
    }
    if (action.type === 'Revoke') {
      active = false
      revision++
    }
    await route.fulfill({
      json: {
        token: active ? token : null,
        options: active ? shared.options : null,
        viewer_revision: String(revision),
        header: {
          id: reportId,
          kind: 'Espionage',
          observed_at: payload.observed_at,
          read: true,
          hidden,
          starred,
          shared: active,
        },
      },
    })
  })
  const starCommands: boolean[] = []
  await page.route('**/commands', async (route) => {
    const envelope = route.request().postDataJSON().gameplay
    const action = envelope.command.action
    expect(['SetReportStarred', 'SetReportHidden']).toContain(action.type)
    expect(action.report).toBe(reportId)
    if (action.type === 'SetReportStarred') {
      starred = action.starred
      starCommands.push(starred)
    } else hidden = action.hidden
    revision++
    await route.fulfill({
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
  })
  await withReportResponse(page, reportId, () =>
    page.goto(reportPath(reportId)),
  )
  return {
    actions,
    starCommands,
    get hidden() {
      return hidden
    },
    get revision() {
      return revision
    },
    get starred() {
      return starred
    },
    get active() {
      return active
    },
  }
}

test('publishing and revoking an unlisted link keeps the confirmed star', async ({
  page,
}) => {
  const { actions } = await openSharingDetail(page)
  const trigger = page.getByRole('button', {
    name: 'Share report',
    exact: true,
  })
  await trigger.focus()
  await page.keyboard.press('Enter')
  await expect(
    page.getByRole('button', { name: 'Create share link' }),
  ).toBeVisible()
  expect(actions).toEqual(['Status'])
  await expect(
    page.getByRole('checkbox', { name: 'Include player and planet names' }),
  ).not.toBeChecked()
  await expect(
    page.getByRole('checkbox', {
      name: 'Include coordinates (target and origins)',
    }),
  ).not.toBeChecked()

  await page.getByRole('button', { name: 'Create share link' }).click()
  await expect(page.getByRole('textbox', { name: 'Share link' })).toHaveValue(
    new RegExp(`/reports/shared/${token}$`),
  )
  await page.getByRole('button', { name: 'Stop sharing', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Create share link' }),
  ).toBeVisible()
  expect(actions).toEqual(['Status', 'Create', 'Revoke'])
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  await expect(
    page.getByRole('button', { name: 'Unstar report', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
})

test.describe('touch sharing controls', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } })
  test('list archiving keeps a shared link available after confirmed unstar and reload', async ({
    page,
  }) => {
    const fixture = await openSharingDetail(page, true)
    const unstar = page.getByRole('button', {
      name: 'Unstar report',
      exact: true,
    })
    await unstar.tap()
    const confirm = page.getByRole('dialog', {
      name: 'Unstar this shared report?',
    })
    await confirm.getByRole('button', { name: 'Keep starred' }).tap()
    await expect(unstar).toHaveAttribute('aria-pressed', 'true')
    expect(fixture.starCommands).toEqual([])
    await unstar.tap()
    await withFixtureResponse(
      page,
      (r) =>
        new URL(r.url()).pathname.endsWith('/commands') &&
        r.request().postDataJSON().gameplay?.command.action.type ===
          'SetReportStarred',
      () =>
        confirm
          .getByRole('button', { name: 'Unstar report', exact: true })
          .tap(),
    )
    expect(fixture.starCommands).toEqual([false])
    await expect(
      page.getByRole('button', { name: 'Star report', exact: true }),
    ).toBeVisible()
    await page.route('**/api/**/reports', (route) => {
      const query = route.request().postDataJSON()
      const items =
        !query.filter?.unread_only && !fixture.hidden
          ? [
              {
                id: reportId,
                kind: 'Espionage',
                observed_at: payload.observed_at,
                read: true,
                hidden: fixture.hidden,
                starred: fixture.starred,
                shared: fixture.active,
              },
            ]
          : []
      return route.fulfill({
        json: {
          protocol: 4,
          binding,
          request_id: query.context.request_id,
          viewer_revision: String(fixture.revision),
          sampled_at: Date.now(),
          as_of_ms: Date.now(),
          data: {
            items,
            unread_count: 0,
            has_more: false,
            next_cursor: null,
            as_of_ms: Date.now(),
          },
        },
      })
    })
    await withReportListResponse(page, () =>
      page.getByRole('link', { name: 'Back to reports' }).click(),
    )
    const row = page.getByRole('article').filter({
      has: page.getByRole('link', { name: 'Espionage', exact: true }),
    })
    await withFixtureResponse(
      page,
      (r) =>
        new URL(r.url()).pathname.endsWith('/commands') &&
        r.request().postDataJSON().gameplay?.command.action.type ===
          'SetReportHidden',
      () =>
        row.getByRole('button', { name: 'Archive report', exact: true }).tap(),
    )
    expect(fixture.hidden).toBe(true)
    await expect(row).toHaveCount(0)
    expect(fixture.active).toBe(true)
    expect(fixture.actions).not.toContain('Revoke')
    await withReportResponse(page, reportId, () =>
      page.goto(reportPath(reportId)),
    )
    await expect(
      page.getByRole('button', { name: 'Move to inbox', exact: true }),
    ).toBeEnabled()
    await page
      .getByRole('button', { name: 'Share report', exact: true })
      .click()
    await expect(page.getByRole('textbox', { name: 'Share link' })).toHaveValue(
      new RegExp(`/reports/shared/${token}$`),
    )
    expect(fixture.actions).toEqual(['Status'])
  })
})

test('included coordinates and names work without account navigation', async ({
  page,
}) => {
  const report = {
    ...shared,
    options: { include_identity: true, include_coordinates: true },
    player_names: { 'participant-1': 'Historical player' },
    payload: {
      ...shared.payload,
      target: {
        owner: 'participant-1',
        kind: 'Planet',
        name: 'Historical planet',
        coordinates: payload.target.coordinates,
      },
    },
  }
  await page.route(`**/api/v4/shared-reports/${token}`, (route) =>
    route.fulfill({ json: report }),
  )
  await withSharedReportResponse(page, token, () =>
    page.goto(`/reports/shared/${token}`),
  )
  await expect(
    page.getByText('Historical player', { exact: true }),
  ).toBeVisible()
  await expect(page.locator('[data-body-name]')).toHaveText(
    'Historical planet ·',
  )
  await expect(page.getByText('[1:2:3]', { exact: true })).toBeVisible()
  await page.getByText('[1:2:3]', { exact: true }).click({ button: 'right' })
  await expect(
    page.getByRole('menuitem', { name: 'Copy coordinates' }),
  ).toBeVisible()
  await expect(
    page.getByRole('menuitem', { name: 'View in Galaxy' }),
  ).toHaveCount(0)
})
