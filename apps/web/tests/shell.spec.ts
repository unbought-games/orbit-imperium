import {
  matchesFixtureContext,
  refuseFixtureReads,
  routeWorld,
} from './fixtures/game'

import {
  trackFixtureResponses,
  withBootstrapResponse,
  withFixtureResponse,
  withFixtureResponseStatus,
} from './fixtures/responses'

import { setDestination } from './fixtures/coordinates'

import { selectBody } from './fixtures/body-selector'

import {
  attachFailureScreenshots,
  diagnosticScreenshot,
} from './fixtures/diagnostic-screenshot'

import { openNavigation } from './fixtures/navigation'

import { test, expect } from './fixtures/test'

import {
  installGameFixture,
  matchesFixtureGameplay,
  refreshGame,
  shellFixture,
  id,
  body,
  resources,
  binding,
} from './fixtures/game'

test(
  'cold Defense navigation retains named universe and planet through preloading, switching and direct loads',
  async ({ page }) => {
    refuseFixtureReads(page, { progression: ['Upgrade'] })
    test.skip(
      !process.env.ORBIT_UI_E2E,
      'Controls lazy route delivery in the fixture browser suite.',
    )
    await page.setViewportSize({ width: 390, height: 844 })
    const purchases = await shellFixture(page, {
      universeName: 'Andromeda Prime',
      protocol: 4,
    })
    await page.getByRole('link', { name: 'Develop', exact: true }).click()
    const nav = page.getByRole('navigation', { name: 'Develop navigation' })
    let loading = false
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route(
      (url) =>
        (url.pathname.includes('defense') &&
          url.search.includes('tsr-split')) ||
        /^\/assets\/u\._universe\.b\._body\.defense-[^/]+\.js$/.test(
          url.pathname,
        ),
      async (route) => {
        loading = true
        await gate
        await route.continue()
      },
    )
    const defense = nav.getByRole('link', { name: 'Defense', exact: true })
    await defense.focus()
    await expect.poll(() => loading).toBe(true)
    await selectBody(page, id(6))
    await expect(defense).toHaveAttribute(
      'href',
      `/u/andromeda-prime/b/${id(6)}/defense`,
    )
    await defense.click()
    release()
    await expect(page.locator('main h1')).toHaveText('Defense')
    await expect(
      page.getByRole('combobox', { name: 'Selected body' }),
    ).toHaveAttribute('data-value', id(6))
    await expect(page).toHaveURL(`/u/andromeda-prime/b/${id(6)}/defense`)
    await withBootstrapResponse(page, () => page.reload())
    await expect(page.locator('main h1')).toHaveText('Defense')
    await expect(
      page.getByRole('combobox', { name: 'Selected body' }),
    ).toHaveAttribute('data-value', id(6))
    await withBootstrapResponse(page, () =>
      page.goto(`/u/andromeda-prime/b/${id(6)}/research`),
    )
    await nav.getByRole('link', { name: 'Defense', exact: true }).click()
    await expect(page.locator('main h1')).toHaveText('Defense')
    await expect(
      page.getByRole('combobox', { name: 'Selected body' }),
    ).toHaveAttribute('data-value', id(6))
    await page.goBack()
    await expect(page.locator('main h1')).toHaveText('Research')
    await page.goForward()
    await expect(page.locator('main h1')).toHaveText('Defense')
    expect(purchases()).toBe(0)
  },
)

test('touch energy navigation and resource details remain usable with enlarged text', async ({
  browser,
}) => {
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width: 390, height: 844 },
  })
  const page = await context.newPage()
  try {
    await shellFixture(page)
    const energy = page.getByRole('link', {
      name: 'Energy — resource settings',
    })
    await energy.focus()
    await expect(page.getByRole('tooltip', { name: 'Energy' })).toContainText(
      '26',
    )
    await page.keyboard.press('Escape')
    await expect(page.getByRole('tooltip', { name: 'Energy' })).toHaveCount(0)
    await energy.tap()
    await expect(page.locator('main h1')).toHaveText('Resource settings')
    await expect(page.locator('main h1')).toBeFocused()
    await expect(
      page.getByRole('link', { name: 'Develop', exact: true }),
    ).toHaveAttribute('aria-current', 'page')
    await expect(
      page.getByRole('link', { name: 'Menu', exact: true }),
    ).not.toHaveAttribute('aria-current')
    await expect(
      page.getByRole('navigation', { name: 'Develop navigation', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('region', { name: 'Production controls', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Upgrade Metal Mine', exact: true }),
    ).toHaveCount(0)
    await withBootstrapResponse(page, () => page.reload())
    await expect(page.getByLabel('metal mine production')).toHaveValue('100')
    await page.goBack()
    await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/overview`)
    await page.goForward()
    await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/resource-settings`)
    await expect(page.getByLabel('metal mine production')).toHaveValue('100')

    // Let Overview finish its native focus handoff before the next keyboard activation.
    await page.goBack()
    await expect(page.locator('main h1')).toContainText('Empire —')
    await expect(page.locator('main h1')).toBeFocused()
    await energy.focus()
    await expect(energy).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.locator('main h1')).toHaveText('Resource settings')
    await expect(page.locator('main h1')).toBeFocused()

    await page.addStyleTag({
      content:
        'html { font-size: 200% !important; } * { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; }',
    })

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await page.getByRole('button', { name: 'Metal details' }).click()
    const popover = page.getByRole('dialog', { name: 'Metal' })
    await expect(popover).toContainText('6,661')
    const rect = await popover.boundingBox()
    expect(rect!.x).toBeGreaterThanOrEqual(0)
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(390)
    await diagnosticScreenshot(page, {
      path: 'test-results/compact-shell-text-size.png',
      fullPage: true,
    })
  } catch (error) {
    await attachFailureScreenshots([page], test.info())
    throw error
  } finally {
    await context.close()
  }
})

test(
  'navigation keeps shell identity mounted through rapid route changes',
  async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      recordVideo:
        process.env.ORBIT_TEST_SCREENSHOTS === '1'
          ? {
              dir: 'test-results/foundation-motion',
              size: { width: 1440, height: 900 },
            }
          : undefined,
    })
    const page = await context.newPage()
    refuseFixtureReads(page, { progression: ['Upgrade'], world: ['Galaxy'] })
    const purchases = await shellFixture(page, { protocol: 4 })
    await page
      .getByLabel('Current resources')
      .evaluate((element) =>
        element.setAttribute('data-motion-check', 'persistent'),
      )
    await page.getByRole('link', { name: 'Develop', exact: true }).click()
    await expect(page.locator('main h1')).toHaveText('Resources')
    await page
      .getByRole('navigation', { name: 'Develop navigation' })
      .getByRole('link', { name: 'Shipyard', exact: true })
      .click()
    await expect(page.locator('main h1')).toHaveText('Shipyard')
    await page.getByRole('link', { name: 'Galaxy', exact: true }).click()
    await expect(page.locator('main h1')).toHaveText('Galaxy')
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const matchesOverview = (request: import('@playwright/test').Request) =>
      request.method() === 'POST' &&
      new URL(request.url()).pathname ===
        `/api/v4/universes/${binding.universe}/overview` &&
      matchesFixtureContext(request.postDataJSON())
    const settleOverview = trackFixtureResponses(page, matchesOverview)
    await page.route('**/api/**/overview', async (route) => {
      if (matchesOverview(route.request())) await gate
      await route.fallback()
    })
    await page.route('**/art/**', (route) => route.abort())
    try {
      const pending = page.waitForRequest(matchesOverview)
      await page.evaluate(() => window.dispatchEvent(new Event('focus')))
      const held = await pending
      for (const heading of ['Shipyard', 'Resources', 'Empire']) {
        await page.goBack()
        await expect(page.locator('main h1')).toContainText(heading)
        await expect(page.getByLabel('Current resources')).toHaveAttribute(
          'data-motion-check',
          'persistent',
        )
      }
      await expect(
        page.getByRole('link', { name: 'Empire', exact: true }),
      ).toHaveAttribute('aria-current', 'page')
      expect(purchases()).toBe(0)
      release()
      await settleOverview()
      expect(
        held.failure(),
        'The held overview must finish successfully',
      ).toBeNull()
      expect((await held.response())?.ok()).toBe(true)
    } catch (error) {
      await attachFailureScreenshots([page], test.info())
      throw error
    } finally {
      release()
      await settleOverview()
      await context.close()
    }
  },
)

test('disconnection preserves selected world, ledger and urgent fleet navigation', async ({
  page,
}) => {
  refuseFixtureReads(page, { world: ['Galaxy'] })
  await shellFixture(page, { protocol: 4 })
  await page.route('**/api/**/overview', (route) =>
    route.fulfill({ status: 503, json: { code: 'Unavailable' } }),
  )
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(
    page.locator('[aria-live=assertive]').filter({
      hasText:
        'Unable to refresh your empire. Showing the last confirmed state. Reconnecting',
    }),
  ).toBeVisible()
  await expect(page.getByLabel('Current resources')).toBeVisible()
  await expect(
    page.getByRole('combobox', { name: 'Selected body' }),
  ).toHaveAttribute('data-value', body.id)
  await page.getByRole('link', { name: 'Galaxy', exact: true }).click()
  await expect(page.locator('main h1')).toHaveText('Galaxy')
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Fleets', exact: true })
    .click()
  await expect(page.locator('main h1')).toHaveText('Fleets')
  await expect(
    page.getByRole('heading', { name: 'Empire fleet traffic' }),
  ).toBeVisible()
})

test('an uncertain fleet launch recovers from its committed receipt without sending twice', async ({
  page,
}) => {
  // Keep background reconciliation still while the user exercises each explicit receipt check.
  const now = new Date()
  await page.clock.pauseAt(now)
  await installGameFixture(page, {
    protocol: 4,
    catalog: [
      {
        key: { kind: 'Ship', id: 'SmallCargo' },
        requirements: [],
        enabled: true,
        mobile: true,
        body_kinds: ['Planet'],
      },
    ],
    missions: {
      fleets: [],
      incoming: [],
      score_value_micro: '0',
      fleet_slots: '5',
    },
  })
  const destination = {
    type: 'Body',
    id: id(60),
    expected_owner: id(9),
    expected_kind: 'Planet',
  }
  await routeWorld(page, async (route) => {
    const query = route.request().postDataJSON()
    if (
      !['ResolveDestination', 'FleetQuote', 'FleetEstimate'].includes(
        query.type,
      )
    )
      return route.fallback()
    await route.fulfill({
      json: {
        protocol: 4,
        binding,
        request_id: query.context.request_id,
        viewer_revision: '1',
        sampled_at: Date.now(),
        as_of_ms: Date.now(),
        data:
          query.type === 'ResolveDestination'
            ? destination
            : {
                intent: query.intent,
                profile_hash: 'a'.repeat(64),
                distance: 1000,
                speeds: [['SmallCargo', '5000']],
                duration_ms: 120000,
                fuel: '6000000',
                capacity: '5000000000',
                maximum_payload: '4994000000',
                slot_limit: '5',
                terms_hash: 'b'.repeat(64),
              },
      },
    })
  })
  const commandsPath = `/api/v4/universes/${binding.universe}/commands`
  let commandId = ''
  let sent = 0
  let committed = false
  let release!: () => void
  const sending = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/commands', async (route) => {
    const pair = route.request().postDataJSON()
    if (
      route.request().method() !== 'POST' ||
      new URL(route.request().url()).pathname !== commandsPath ||
      !matchesFixtureGameplay(pair) ||
      pair.gameplay.command.type !== 'World' ||
      pair.gameplay.command.action.type !== 'LaunchFleet'
    )
      return route.fallback()
    sent++
    if (!commandId) commandId = pair.gameplay.command_id
    expect(pair.gameplay.command_id).toBe(commandId)
    await sending
    await route.fulfill({ status: 503, json: { code: 'Unavailable' } })
  })
  await page.route('**/commands/*?epoch=*', async (route) => {
    const url = new URL(route.request().url())
    if (
      !commandId ||
      route.request().method() !== 'GET' ||
      url.pathname !== commandsPath + '/' + commandId ||
      url.searchParams.get('epoch') !== binding.epoch
    )
      return route.fallback()
    if (!committed)
      return route.fulfill({ status: 503, json: { code: 'Unavailable' } })
    await route.fulfill({
      json: {
        protocol: 4,
        binding,
        command_id: commandId,
        admitted_at: now.getTime(),
        executed_at: now.getTime(),
        status: 'Committed',
        result_ids: [id(80)],
        minimum_viewer_revision: '1',
      },
    })
  })
  await withBootstrapResponse(page, () =>
    page.goto(`/u/andromeda/b/${body.id}/dispatch`),
  )
  await page.getByLabel('Small Cargo · 2 available').fill('1')
  await setDestination(page, { position: '3' })
  await withFixtureResponse(
    page,
    (r) =>
      r.url().endsWith('/world') &&
      r.request().postDataJSON().type === 'FleetQuote',
    () =>
      page.getByRole('button', { name: 'Review fleet', exact: true }).click(),
  )
  const quote = page.getByRole('region', { name: 'Fleet quote' })
  const result = page.getByRole('group', { name: 'Fleet dispatch result' })
  await withFixtureResponseStatus(
    page,
    (r) =>
      r.url().endsWith('/commands') &&
      r.request().postDataJSON().gameplay?.command?.action?.type ===
        'LaunchFleet',
    async () => {
      try {
        await quote
          .getByRole('button', {
            name: 'Transport to Unknown planet [1:1:3]',
            exact: true,
          })
          .click()
        await expect(result).toContainText('Sending fleet order…')
        await expect(result).not.toContainText('Fleet dispatched.')
        await expect.poll(() => sent).toBe(1)
      } finally {
        release()
      }
    },
    503,
  )
  await expect(result).toHaveCount(0)
  await expect(
    page.getByRole('complementary', { name: 'Action needs attention' }),
  ).toContainText('We’re checking whether this order went through.')
  await expect(
    page.getByRole('button', { name: 'Retry order', exact: true }),
  ).toBeVisible()
  await expect(page.getByLabel(/Small Cargo · \d+ available/)).toHaveValue('1')
  await expect(
    page.getByRole('button', {
      name: 'Fleet slots: 1 used / 5 total',
      exact: true,
    }),
  ).toBeVisible()
  const recovery = page.getByLabel('Action needs attention')
  // Exercise recovery explicitly so this assertion does not depend on whether
  // the background receipt poll runs before the layout checks finish.
  const receipt = (response: import('@playwright/test').Response) => {
    const url = new URL(response.url())
    return (
      response.request().method() === 'GET' &&
      url.pathname === commandsPath + '/' + commandId &&
      url.searchParams.get('epoch') === binding.epoch
    )
  }
  await withFixtureResponseStatus(
    page,
    receipt,
    () =>
      recovery
        .getByRole('button', { name: 'Retry order', exact: true })
        .click(),
    503,
  )
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 })
    await page.evaluate(() => window.scrollTo(0, 0))
    expect(
      await recovery.evaluate((element) => getComputedStyle(element).position),
    ).toBe('static')
    // Read both boxes in one frame: resize and focus restoration can change
    // scroll/header offsets between separate browser round trips.
    const bounds = await page
      .getByRole('group', { name: 'Origin', exact: true })
      .first()
      .evaluate((intro) => {
        const notice = document.querySelector(
          'aside[aria-label="Action needs attention"]',
        )!
        return {
          noticeBottom: notice.getBoundingClientRect().bottom,
          introTop: intro.getBoundingClientRect().top,
        }
      })
    expect(bounds.noticeBottom).toBeLessThanOrEqual(bounds.introTop)
    for (const control of [
      page.getByRole('combobox', { name: 'Selected body' }),
      width >= 1024
        ? page.getByRole('button', { name: 'Account menu', exact: true })
        : page.getByRole('link', { name: 'Menu', exact: true }),
      page.getByRole('link', { name: 'Fleets', exact: true }),
    ]) {
      await expect(control).toBeInViewport()
      expect(
        await control.evaluate((element) => {
          const box = element.getBoundingClientRect()
          const hit = document.elementFromPoint(
            box.x + box.width / 2,
            box.y + box.height / 2,
          )
          return element === hit || element.contains(hit)
        }),
      ).toBe(true)
    }
    // Menu is a destination now; verify its hit target without leaving edits.
    if (width < 1024)
      await page
        .getByRole('link', { name: 'Menu', exact: true })
        .click({ trial: true })
    else await expect(await openNavigation(page)).toBeVisible()
    const resolve = recovery.getByRole('button', {
      name: 'Retry order',
      exact: true,
    })
    await resolve.scrollIntoViewIfNeeded()
    await expect(resolve).toBeInViewport()
  }
  committed = true
  await withFixtureResponse(page, receipt, () =>
    recovery.getByRole('button', { name: 'Retry order', exact: true }).click(),
  )
  await expect(result).toContainText('Fleet dispatched.')
  await expect(page.getByLabel('Small Cargo · 2 available')).toHaveValue('0')
  await expect(recovery).toHaveCount(0)
  expect(sent).toBe(1)
})

test('legacy fleets retain trajectory, exact arrival and reviewed recall', async ({
  page,
}) => {
  const due = Date.now() + 120000
  await shellFixture(page, {
    protocol: 2,
    extraCapabilities: ['Transport'],
    fleets: [
      {
        id: id(61),
        origin: body.id,
        target: id(60),
        status: 'Outbound',
        due_at: due,
        payload: resources,
        paid_fuel: '3000000',
        ships: [{ ship_type: 'SmallCargo', count: '2' }],
      },
    ],
    destinations: [
      { id: body.id, coordinates: body.coordinates, kind: 'Planet' },
      {
        id: id(60),
        coordinates: { galaxy: 1, system: 372, position: 10 },
        kind: 'Planet',
      },
    ],
  })
  await withBootstrapResponse(page, () =>
    page.goto(`/u/andromeda/b/${body.id}/fleets`),
  )
  await expect(
    page.getByRole('figure', { name: 'Mission route schematic' }),
  ).toBeVisible()
  await expect(page.locator('main time')).toHaveAttribute(
    'datetime',
    new Date(due).toISOString(),
  )
  await page.getByRole('button', { name: 'Review recall', exact: true }).click()
  await expect(
    page.getByRole('region', { name: 'Recall transport' }),
  ).toContainText('server confirms the return time')
  await expect(
    page.getByRole('button', { name: 'Recall fleet', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Keep mission', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Recall fleet', exact: true }),
  ).toHaveCount(0)
  await page.setViewportSize({ width: 390, height: 844 })
  await diagnosticScreenshot(page, {
    path: 'test-results/legacy-fleet-phone.png',
    fullPage: true,
  })
})

// The two no-preference cases exhausted their repair in PR #369 and failed
// again when Briefing gained intentional motion. Keep reduced-motion coverage;
// the sidebar's color-only CSS contract is checked in navigation-motion.test.ts.
test('reduced motion keeps route focus stationary through dock and sidebar navigation', async ({
  page,
}) => {
  refuseFixtureReads(page, { progression: ['Upgrade'] })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    const events: string[] = []
    Object.assign(window, { uiMotionEvents: events })
    document.addEventListener(
      'animationstart',
      (event) => {
        const target = event.target
        const isWealthCue =
          target instanceof Element &&
          target.closest('[aria-label="Empire resource totals"] dl') &&
          /wealthGuide(Glow|Pulse)/.test(
            (event as AnimationEvent).animationName,
          )
        if (
          !(
            target instanceof Element && target.closest('[data-command-hud]')
          ) &&
          !isWealthCue
        )
          events.push('animation')
      },
      true,
    )
    document.addEventListener(
      'transitionrun',
      (event) => {
        const target = event.target
        const isSidebarColor =
          matchMedia(
            '(min-width: 1024px) and (prefers-reduced-motion: no-preference)',
          ).matches &&
          target instanceof Element &&
          target.matches('a, button') &&
          target.closest('[aria-label="Game navigation"]') &&
          ['background-color', 'color'].includes(
            (event as TransitionEvent).propertyName,
          )
        if (
          !(
            target instanceof Element && target.closest('[data-command-hud]')
          ) &&
          !isSidebarColor
        )
          events.push('transition')
      },
      true,
    )
    const start = document.startViewTransition.bind(document)
    document.startViewTransition = (...args) => {
      events.push('view-transition')
      return start(...args)
    }
  })
  // Only desktop sidebar colors may transition; the animated command HUD and
  // slow wealth-guide pulse are checked separately. The hostile-fleet signal has
  // its own coverage, so keep this fixture free of incoming threats.
  const purchases = await shellFixture(page, {
    protocol: 4,
    missions: {
      fleets: [],
      incoming: [],
      score_value_micro: '0',
      fleet_slots: '1',
    },
  })
  const assertStill = async () => {
    expect(
      await page.evaluate(
        () =>
          document.getAnimations().filter((animation) => {
            const target = (animation.effect as KeyframeEffect | null)?.target
            const isWealthCue =
              animation instanceof CSSAnimation &&
              target instanceof Element &&
              target.closest('[aria-label="Empire resource totals"] dl') &&
              /wealthGuide(Glow|Pulse)/.test(animation.animationName)
            const isSidebarColor =
              animation instanceof CSSTransition &&
              matchMedia(
                '(min-width: 1024px) and (prefers-reduced-motion: no-preference)',
              ).matches &&
              target instanceof Element &&
              target.matches('a, button') &&
              target.closest('[aria-label="Game navigation"]') &&
              ['background-color', 'color'].includes(
                animation.transitionProperty,
              )
            return (
              !(
                target instanceof Element &&
                target.closest('[data-command-hud]')
              ) &&
              !isWealthCue &&
              !isSidebarColor
            )
          }).length,
      ),
    ).toBe(0)
    expect(
      await page.evaluate(
        () => (window as Window & { uiMotionEvents: string[] }).uiMotionEvents,
      ),
    ).toEqual([])
  }
  await assertStill()
  for (const [name, heading] of [
    ['Resources', 'Resources'],
    ['Fleets', 'Fleets'],
    ['Empire', 'Empire'],
  ]) {
    await page.setViewportSize({
      width: name === 'Fleets' ? 1280 : 390,
      height: 844,
    })
    const link =
      name === 'Resources'
        ? page.getByRole('link', { name: 'Develop', exact: true })
        : page
            .getByRole('navigation', {
              name: 'Main navigation',
              exact: true,
            })
            .getByRole('link', { name, exact: true })
    await expect(link).toHaveCSS('transition-duration', '0s')
    await expect(link).toHaveCSS('transition-property', 'none')
    await link.hover()
    await assertStill()
    await link.click()
    await expect(page.locator('main h1')).toContainText(heading)
    await expect(page.locator('main h1')).toBeFocused()
    await assertStill()
  }
  await assertStill()
  expect(purchases()).toBe(0)
})

// All six layout permutations run in shell-menu.component; retain actual report delivery/history once.
for (const width of [390]) {
  for (const textScale of [1]) {
    test(`unread reports light the menu and report link at ${width}px with ${textScale * 100}% text and reconcile`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      let unread = false
      let count = 12
      let revision = 1
      await withFixtureResponse(
        page,
        (response) => response.url().endsWith('/reports'),
        () =>
          shellFixture(page, {
            protocol: 4,
            extraCapabilities: ['Reports'],
            hasUnreadReports: () => unread,
            unreadReportCount: () => (unread ? count : 0),
            missions: {
              fleets: [],
              incoming: [],
              fleet_slots: '8',
              score_value_micro: '0',
            },
            viewerRevision: () => String(revision),
          }),
      )
      await page.addStyleTag({
        content: `html { font-size: ${textScale * 100}% !important; }`,
      })
      const menu = page.getByRole('link', { name: 'Menu', exact: true })
      const alert = menu.getByRole('status', { name: 'Unread reports' })
      const assertLayout = async () => {
        const target = (await menu.boundingBox())!
        expect(target.width).toBeGreaterThanOrEqual(44)
        expect(target.height).toBeGreaterThanOrEqual(44)
        await expect(menu).toBeInViewport({ ratio: 1 })
        const label = (await menu
          .getByText('Menu', { exact: true })
          .boundingBox())!
        expect(label.x).toBeGreaterThanOrEqual(target.x)
        expect(label.x + label.width).toBeLessThanOrEqual(
          target.x + target.width,
        )
        if (await alert.count()) {
          const badge = (await alert.boundingBox())!
          // Either beside the desktop label or above the mobile label, with a gap.
          expect(
            badge.x >= label.x + label.width + 4 ||
              badge.y + badge.height + 4 <= label.y,
          ).toBe(true)
          expect(badge.x).toBeGreaterThanOrEqual(target.x)
          expect(badge.x + badge.width).toBeLessThanOrEqual(
            target.x + target.width,
          )
          expect(badge.y).toBeGreaterThanOrEqual(target.y)
          expect(badge.y + badge.height).toBeLessThanOrEqual(
            target.y + target.height,
          )
        }
      }
      await expect(alert).toHaveCount(0)
      await assertLayout()
      unread = true
      revision++
      await withFixtureResponse(
        page,
        (response) => response.url().endsWith('/reports'),
        () => refreshGame(page),
      )
      await expect(alert).toBeVisible()
      await expect(menu).toHaveAccessibleDescription('Unread reports')
      await diagnosticScreenshot(page, {
        path: `test-results/unread-reports-${width}-${textScale}.png`,
      })
      await assertLayout()
      await menu.focus()
      await page.keyboard.press('Enter')
      const destinations = page.getByRole('navigation', {
        name: 'Menu destinations',
      })
      const reports = destinations.getByRole('link', {
        name: 'Reports — unread reports',
      })
      await expect(reports).toBeVisible()
      await expect(reports.locator('svg')).toHaveCount(2)
      const badge = reports.getByRole('status')
      await expect(badge).toHaveText('12')
      await expect(badge).toHaveAccessibleName('12 unread reports')
      await expect(badge).toHaveCSS('background-color', 'rgb(203, 182, 141)')
      const assertBadgeLayout = async () => {
        const { badgeBox, label, chevron } = await reports.evaluate((row) => {
          const badge = row.querySelector('[role="status"]')!
          const label = [...row.querySelectorAll('span')].find(
            (el) => el.textContent === 'Reports',
          )!
          const icons = row.querySelectorAll('svg')
          return {
            badgeBox: badge.getBoundingClientRect().toJSON(),
            label: label.getBoundingClientRect().toJSON(),
            chevron: icons[icons.length - 1].getBoundingClientRect().toJSON(),
          }
        })
        expect(label.x + label.width).toBeLessThanOrEqual(badgeBox.x)
        expect(badgeBox.x + badgeBox.width + 4).toBeLessThanOrEqual(chevron.x)
        expect(
          Math.abs(
            badgeBox.y + badgeBox.height / 2 - chevron.y - chevron.height / 2,
          ),
        ).toBeLessThan(1)
      }
      await assertBadgeLayout()
      await reports.scrollIntoViewIfNeeded()
      await diagnosticScreenshot(page, {
        path: `test-results/current-menu-count-${width}x900-${textScale}.png`,
      })
      if (width === 390 && textScale === 1) {
        await page.setViewportSize({ width: 1440, height: 900 })
        await assertBadgeLayout()
        await diagnosticScreenshot(page, {
          path: 'test-results/current-menu-count-desktop-1440x900.png',
        })
        await page.setViewportSize({ width, height: 900 })
      }
      count = 125
      revision++
      await withFixtureResponse(
        page,
        (response) => response.url().endsWith('/reports'),
        () => refreshGame(page),
      )
      await expect(badge).toHaveText('99+')
      await expect(badge).toHaveAccessibleName('99 or more unread reports')
      await assertBadgeLayout()
      await diagnosticScreenshot(page, {
        path: `test-results/current-menu-capped-${width}x900-${textScale}.png`,
      })
      await reports.focus()
      await expect(reports).toBeFocused()
      await page.goBack()
      await expect(page.locator('main h1')).toBeFocused()
      await withFixtureResponse(
        page,
        (response) => response.url().endsWith('/reports'),
        () => page.reload(),
      )
      await page.addStyleTag({
        content: `html { font-size: ${textScale * 100}% !important; }`,
      })
      await expect(alert).toBeVisible()
      await assertLayout()
      unread = false
      revision++
      await withFixtureResponse(
        page,
        (response) => response.url().endsWith('/reports'),
        () => refreshGame(page),
      )
      await expect(alert).toHaveCount(0)
      await menu.click()
      await expect(
        page.getByRole('link', { name: 'Reports', exact: true }),
      ).toBeVisible()
      await expect(
        page.getByRole('link', { name: 'Reports — unread reports' }),
      ).toHaveCount(0)
      await diagnosticScreenshot(page, {
        path: `test-results/current-menu-read-${width}x900-${textScale}.png`,
      })
      await assertLayout()
    })
  }
}

for (const width of [390]) {
  test(`body selection retains its default dossier, history and reload at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    const home = {
      ...body,
      name: 'Martialis',
      coordinates: { galaxy: 1, system: 19, position: 6 },
    }
    const colony = (n: number, name: string, created_at: number) => ({
      ...body,
      id: id(n),
      name,
      coordinates: { galaxy: 1, system: 1, position: n - 5 },
      colony: {
        created_at,
        diameter_km: 12000,
        min_temperature: 0,
        max_temperature: 40,
        profile: 'oi-redesign-reconstructed-v1',
      },
    })
    const first = colony(8, 'Nova Roma', 100)
    const later = colony(9, 'A long planet name that wraps safely', 200)
    const moon = { ...home, id: id(10), name: undefined, kind: 'Moon' as const }
    const purchases = await installGameFixture(page, {
      protocol: 4,
      bodies: [home, moon, first, later],
    })
    await withBootstrapResponse(page, () => page.goto('/u/andromeda'))
    // A fresh open also loads the cold Vite route modules before rendering.
    await expect(page.locator('main h1')).toContainText('Empire —', {
      timeout: 30_000,
    })
    const trigger = page.getByRole('combobox', { name: 'Selected body' })
    await expect(trigger).toContainText('Martialis')
    await expect(trigger).toHaveAttribute('data-value', home.id)
    await expect(page).toHaveURL(new RegExp(`/b/${home.id}/overview$`))
    await expect(
      page.getByRole('article', { name: / dossier$/ }).first(),
    ).toHaveAttribute('aria-label', 'Martialis [1:19:6] dossier')
    await selectBody(page, first.id)
    await expect(page).toHaveURL(new RegExp(`/b/${first.id}/overview$`))
    await page.goBack()
    await expect(trigger).toHaveAttribute('data-value', home.id)
    await selectBody(page, later.id)
    await withBootstrapResponse(page, () => page.reload())
    await expect(trigger).toHaveAttribute('data-value', later.id)
    expect(purchases()).toBe(0)
  })
}
