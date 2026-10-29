import { test, expect } from './fixtures/test'
import { shellFixture, refreshGame, binding, body, id } from './fixtures/game'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'

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
for (const width of [390, 1440]) {
  test(`public report is readable without game initialization at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
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
    await page.goto(`/reports/shared/${token}`)
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
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy()
    await diagnosticScreenshot(page, {
      path: `test-results/shared-report-${width}.png`,
      fullPage: true,
    })
  })
}
test('a revoked report has a clear unavailable state', async ({ page }) => {
  await page.route(`**/api/v4/shared-reports/${token}`, (route) =>
    route.fulfill({ status: 404, json: { code: 'NotFound' } }),
  )
  await page.goto(`/reports/shared/${token}`)
  await expect(page.getByRole('alert')).toContainText(
    'revoked the link or deleted the report',
  )
  await expect(
    page.getByRole('button', { name: 'Retry', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Resources', exact: true }),
  ).toHaveCount(0)
})
for (const width of [390, 1440])
  test(`sharing stars reports and warns before unstar at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    let active = false
    let starred = false
    let revision = 1
    await shellFixture(page, {
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
              hidden: false,
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
            hidden: false,
            starred,
            shared: active,
          },
        },
      })
    })
    const starCommands: boolean[] = []
    await page.route('**/commands', async (route) => {
      const envelope = route.request().postDataJSON().gameplay
      expect(envelope.command.action.type).toBe('SetReportStarred')
      starred = envelope.command.action.starred
      starCommands.push(starred)
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
    await page.goto(`/u/andromeda/b/${body.id}/reports/${reportId}`)
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
      page.getByRole('checkbox', { name: 'Include target coordinates' }),
    ).not.toBeChecked()
    await diagnosticScreenshot(page, {
      path: `test-results/share-settings-${width}.png`,
      fullPage: true,
    })
    await page.getByRole('button', { name: 'Create share link' }).click()
    await expect(page.getByRole('textbox', { name: 'Share link' })).toHaveValue(
      new RegExp(`/reports/shared/${token}$`),
    )
    await page.getByRole('button', { name: 'Close sharing' }).click()
    await expect(
      page.getByRole('button', { name: 'Unstar report', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true')
    await page
      .getByRole('button', { name: 'Unstar report', exact: true })
      .click()
    const unstarDialog = page.getByRole('dialog', {
      name: 'Unstar this shared report?', exact: true,
    })
    await expect(unstarDialog).toContainText(
      'Deleting it also permanently removes its shared links.',
    )
    await diagnosticScreenshot(page, {
      path: `test-results/unstar-shared-${width}.png`,
      fullPage: true,
    })
    await page.getByRole('button', { name: 'Keep starred' }).click()
    await expect(
      page.getByRole('button', { name: 'Unstar report', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(starCommands).toEqual([])
    await page
      .getByRole('button', { name: 'Unstar report', exact: true })
      .click()
    await unstarDialog
      .getByRole('button', { name: 'Unstar report', exact: true })
      .click()
    await expect(
      page.getByRole('button', { name: 'Star report', exact: true }),
    ).toBeVisible()
    expect(starCommands).toEqual([false])
    await page.getByRole('button', { name: 'Star report', exact: true }).click()
    await expect(
      page.getByRole('button', { name: 'Unstar report', exact: true }),
    ).toBeVisible()
    // A later server update must not turn an open unstar confirmation into
    // the opposite action.
    await page
      .getByRole('button', { name: 'Unstar report', exact: true })
      .click()
    starred = false
    revision++
    await refreshGame(page)
    await expect(page.locator('button[aria-label="Star report"]')).toHaveCount(
      1,
    )
    await unstarDialog
      .getByRole('button', { name: 'Unstar report', exact: true })
      .click()
    expect(starCommands).toEqual([false, true])
    await page.getByRole('button', { name: 'Star report', exact: true }).click()
    await expect(
      page.getByRole('button', { name: 'Unstar report', exact: true }),
    ).toBeVisible()
    await trigger.click()
    await page
      .getByRole('button', { name: 'Stop sharing', exact: true })
      .click()
    await expect(
      page.getByRole('button', { name: 'Create share link' }),
    ).toBeVisible()
    expect(actions).toEqual(['Status', 'Create', 'Status', 'Revoke'])
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(trigger).toBeFocused()
    await expect(
      page.getByRole('button', { name: 'Unstar report', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

test('public combat shows loot and keeps historical names without a profile session', async ({
  page,
}) => {
  const p = {
    owner: 'participant-1',
    origin: { Fleet: 'participant-2' },
    side: 'Attacker',
    units: [{ item: { kind: 'Ship', id: 'LightFighter' }, count: '10' }],
    technology: [1, 2, 3],
  }
  const report = {
    ...shared,
    options: { include_identity: true, include_coordinates: false },
    player_names: { 'participant-1': 'Name at publication' },
    payload: {
      kind: 'Combat',
      at: payload.observed_at,
      outcome: 'AttackerVictory',
      participants: [p],
      survivors: [p],
      recovered: [],
      gross_losses: [],
      rounds: [],
      loot: payload.resources.value,
      debris: { metal: '0', crystal: '0', deuterium: '0' },
    },
  }
  await page.route(`**/api/v4/shared-reports/${token}`, (route) =>
    route.fulfill({ json: report }),
  )
  await page.goto(`/reports/shared/${token}`)
  await expect(
    page.getByRole('heading', { name: 'Attacker victory' }),
  ).toBeVisible()
  await expect(
    page.getByText('Name at publication', { exact: true }).first(),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Loot', exact: true }),
  ).toBeVisible()
  await diagnosticScreenshot(page, {
    path: 'test-results/shared-combat-desktop.png',
    fullPage: true,
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
  await page.goto(`/reports/shared/${token}`)
  await expect(
    page.getByText('Historical player', { exact: true }),
  ).toBeVisible()
  await expect(page.locator('[data-body-name]')).toHaveText(
    'Historical planet ·',
  )
  await expect(page.getByText('[1:2:3]', { exact: true })).toBeVisible()
  await page
    .getByRole('button', { name: 'Location actions for [1:2:3]' })
    .click()
  await expect(
    page.getByRole('menuitem', { name: 'Copy coordinates' }),
  ).toBeVisible()
  await expect(
    page.getByRole('menuitem', { name: 'View in Galaxy' }),
  ).toHaveCount(0)
})
