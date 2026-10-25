import { test, expect } from './fixtures/test'
import { shellFixture, binding, body, id } from './fixtures/game'
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
    await page.goto(`/reports/shared/${token}`)
    await expect(
      page.getByRole('heading', { name: 'Shared report', exact: true }),
    ).toBeVisible()
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
test('sharing requires explicit creation with private defaults and supports revocation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 1000 })
  await shellFixture(page, { protocol: 4, extraCapabilities: ['Reports'] })
  await page.route(`**/api/**/reports/${reportId}`, async (route) => {
    const context = route.request().postDataJSON()
    await route.fulfill({
      json: {
        protocol: 4,
        binding,
        request_id: context.request_id,
        viewer_revision: '1',
        sampled_at: Date.now(),
        as_of_ms: Date.now(),
        data: {
          header: {
            id: reportId,
            kind: 'Espionage',
            observed_at: payload.observed_at,
            read: true,
            hidden: false,
          },
          payload,
        },
      },
    })
  })
  let active = false
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
    }
    if (action.type === 'Revoke') active = false
    await route.fulfill({
      json: {
        token: active ? token : null,
        options: active ? shared.options : null,
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
    path: 'test-results/share-settings-mobile.png',
    fullPage: true,
  })
  await page.getByRole('button', { name: 'Create share link' }).click()
  await expect(page.getByRole('textbox', { name: 'Share link' })).toHaveValue(
    new RegExp(`/reports/shared/${token}$`),
  )
  await page.getByRole('button', { name: 'Stop sharing', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Create share link' }),
  ).toBeVisible()
  expect(actions).toEqual(['Status', 'Create', 'Revoke'])
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
  await expect(
    page.getByText('Historical planet', { exact: true }),
  ).toBeVisible()
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
