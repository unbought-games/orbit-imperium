import {
  recruitmentFixture,
  alliance as recruitmentAlliance,
} from './fixtures/recruitment'
import {
  withFixtureResponse,
  withFixtureResponseStatus,
} from './fixtures/responses'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { test, expect, type Page } from './fixtures/test'
import {
  installGameFixture,
  refreshGame,
  binding,
  id,
  body,
} from './fixtures/game'
import type { components } from '../src/contracts'
import { allianceMembershipFixture } from './fixtures/alliance-membership'
type S = components['schemas']
const { alliance, summary, own } = allianceMembershipFixture(binding)
async function fixture(page: Page, initial: S['AllianceDetail'] | null) {
  await installGameFixture(page, { protocol: 4, allianceHonors: alliance })
  let detail = initial
  const commands: S['AllianceCommandRequest'][] = []
  let denied = false
  const prefix = `/api/v4/universes/${binding.universe}/alliances`
  await page.route(
    (url) => url.pathname === prefix + '/query',
    (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      const { context, query } = route
        .request()
        .postDataJSON() as S['AllianceQueryRequest']
      expect(context.binding).toEqual(binding)
      if (denied)
        return route.fulfill({ status: 403, json: { code: 'Forbidden' } })
      if (query.type !== 'Mine' && query.type !== 'Directory')
        return route.fallback()
      return route.fulfill({
        json: {
          ...context,
          sampled_at: 1700000000000,
          directory: query.type === 'Directory' ? [summary] : [],
          directory_count: query.type === 'Directory' ? 1 : 0,
          alliance: query.type === 'Directory' ? null : detail,
          applications: [],
        },
      })
    },
  )
  await page.route(
    (url) => url.pathname === prefix + '/' + alliance,
    (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({
            json: { summary, public_text: 'Recruiting curious commanders.' },
          })
        : route.fallback(),
  )
  await page.route(
    (url) => url.pathname === prefix + '/commands',
    (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      const request = route
        .request()
        .postDataJSON() as S['AllianceCommandRequest']
      if (request.action.type !== 'Create') return route.fallback()
      expect(request.context.binding).toEqual(binding)
      commands.push(request)
      detail = own()
      Object.assign(detail.summary, {
        name: request.action.name,
        tag: request.action.tag,
      })
      detail.revision++
      return route.fulfill({
        json: {
          command_id: request.command_id,
          alliance: detail.summary.id,
          revision: detail.revision,
        },
      })
    },
  )
  return {
    commands,
    denyReads: () => {
      denied = true
    },
  }
}

test('lost membership clears private board, roster and administration after an access-denied reload', async ({
  page,
}) => {
  const f = await fixture(page, own())
  await withFixtureResponse(
    page,
    (response) =>
      response.url().endsWith('/alliances/query') &&
      response.request().postDataJSON().query.type === 'Mine',
    () => page.goto(`/u/andromeda/b/${body.id}/alliance`),
  )
  await page.getByRole('link', { name: 'Members', exact: true }).click()
  const roster = page.getByRole('region', { name: 'Alliance roster' })
  await expect(
    roster
      .getByRole('link', { name: /profile details/ })
      .getByText('[STAR]', { exact: true }),
  ).toHaveCount(2)
  f.denyReads()
  await withFixtureResponseStatus(
    page,
    (r) =>
      r.url().endsWith('/alliances/query') &&
      r.request().postDataJSON().query.type === 'Mine',
    () => page.reload(),
    403,
  )
  await expect(page.getByRole('alert')).toContainText('Forbidden')
  await expect(
    page.getByRole('region', { name: 'Alliance roster' }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('link', { name: 'Roles', exact: true }),
  ).toHaveCount(0)
  await expect(page.getByText('Nova', { exact: true })).toHaveCount(0)
})

// Desktop geometry is isolated; retain mobile overview refresh and public-link navigation.
for (const viewport of [{ width: 390, height: 740 }]) {
  test.describe(`alliance reading at ${viewport.width}px`, () => {
    test.use({
      viewport,
      isMobile: viewport.width < 768,
      hasTouch: viewport.width < 768,
    })

    test('long pinned notices preserve reading, selection and focus through live updates', async ({
      page,
    }) => {
      const now = new Date('2026-10-26T12:00:00Z')
      await page.clock.pauseAt(now)
      const detail = own()
      detail.posts![0].pinned = true
      detail.next_post_before = id(851)
      // A tall preformatted notice mirrors the ASCII art in the iPhone report.
      detail.posts![0].body =
        '```\n' +
        Array.from(
          { length: 60 },
          (_, index) => `| Standing order ${index + 1} |`,
        ).join('\n') +
        '\n```\n\nRead these standing orders together.\n\n[Read recruitment](/alliances/' +
        binding.universe +
        '/' +
        alliance +
        ')'
      await fixture(page, detail)
      await withFixtureResponse(
        page,
        (response) =>
          response.url().endsWith('/alliances/query') &&
          response.request().postDataJSON().query.type === 'Mine',
        () => page.goto(`/u/andromeda/b/${body.id}/alliance`),
      )
      const article = page
        .getByRole('article')
        .filter({ has: page.getByRole('heading', { name: 'Welcome aboard' }) })
      await expect(article).toBeVisible()
      await page.clock.runFor(500)
      await page.evaluate(() => document.fonts.ready)
      const passage = article.getByText(
        'Read these standing orders together.',
        { exact: true },
      )
      await passage.scrollIntoViewIfNeeded()
      await passage.evaluate((node) => {
        const range = document.createRange()
        range.selectNodeContents(node)
        const selection = window.getSelection()!
        selection.removeAllRanges()
        selection.addRange(range)
      })
      const before = await page.evaluate(() => scrollY)
      await page.clock.runFor(1000)
      expect(await page.evaluate(() => scrollY)).toBeCloseTo(before, 0)
      expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(
        'Read these standing orders together.',
      )

      const link = article.getByRole('link', {
        name: 'Read recruitment',
        exact: true,
      })
      await link.focus()
      const focusedPosition = await page.evaluate(() => scrollY)
      const refreshed = page.waitForResponse((response) =>
        response.url().endsWith('/overview'),
      )
      await refreshGame(page)
      await page.clock.runFor(1000)
      expect(await (await refreshed).finished()).toBeNull()
      await expect(link).toBeFocused()
      expect(await page.evaluate(() => scrollY)).toBeCloseTo(focusedPosition, 0)

      // Mobile browser chrome changes the viewport height while reading.
      await page.setViewportSize({ ...viewport, height: viewport.height + 90 })
      const pages = page.getByRole('navigation', { name: 'Notice pages' })
      await pages.scrollIntoViewIfNeeded()
      await page.clock.runFor(1000)
      await expect(
        pages.getByRole('button', { name: 'Load older notices' }),
      ).toBeInViewport()
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
      await diagnosticScreenshot(page, {
        path: `test-results/alliance-reading-${viewport.width}.png`,
      })
      await link.click()
      await expect(page).toHaveURL(
        new RegExp(`/alliances/${binding.universe}/${alliance}$`),
      )
      await expect(
        page.getByRole('heading', { name: summary.name }),
      ).toBeVisible()
    })
  })
}

// Application gate: a submitted membership mutation changes the destination route.
// Isolated components own role, draft, notice-editing and recruitment-form interactions.
test(
  'creates an alliance from its route and returns to membership home',

  async ({ page }) => {
    const f = await fixture(page, null)
    const membership = (response: import('@playwright/test').Response) =>
      response.url().endsWith('/alliances/query') &&
      response.request().postDataJSON().query.type === 'Mine'
    await withFixtureResponse(page, membership, () =>
      page.goto(`/u/andromeda/b/${body.id}/alliance`),
    )
    await withFixtureResponse(page, membership, () =>
      page.getByRole('link', { name: 'Create Alliance', exact: true }).click(),
    )
    await expect(page).toHaveURL(`/u/andromeda/b/${body.id}/alliance/create`)
    await withFixtureResponse(page, membership, () => page.reload())
    await expect(page.getByRole('searchbox')).toHaveCount(0)
    await page.getByLabel('Alliance name', { exact: true }).fill('New Horizon')
    await page.getByLabel('Alliance tag', { exact: true }).fill('NEW')
    await withFixtureResponse(page, membership, () =>
      page
        .getByRole('button', { name: 'Create Alliance', exact: true })
        .click(),
    )
    await expect(page).toHaveURL(/\/alliance$/)
    await expect(
      page.getByRole('heading', { name: 'New Horizon', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'My alliance', exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Discover alliances', exact: true }),
    ).toBeVisible()
    expect(f.commands.map((command) => command.action.type)).toEqual(['Create'])
  },
)

// Restored: controller state cannot prove the screen recovery live region.
// One application journey owns editor -> command -> refreshed public projection wiring.
test('alliance presentation previews unsaved edits and publishes them through the real editor', async ({
  page,
}) => {
  const fixture = await recruitmentFixture(page, {
    manager: true,
    customization: true,
  })
  const mine = (response: import('@playwright/test').Response) =>
    response.url().endsWith('/alliances/query') &&
    response.request().postDataJSON().query.type === 'Mine'
  await withFixtureResponse(page, mine, () =>
    page.goto(`/u/andromeda/b/${body.id}/alliance`),
  )
  await withFixtureResponse(
    page,
    (r) => {
      const url = new URL(r.url())
      return (
        url.pathname === '/api/alliance-presentation/catalog' &&
        url.searchParams.get('alliance') === recruitmentAlliance
      )
    },
    () =>
      page
        .getByRole('navigation', { name: 'Alliance sections' })
        .getByRole('link', { name: 'Settings', exact: true })
        .click(),
  )
  await page
    .getByRole('textbox', { name: 'Motto', exact: true })
    .fill('Good company. Uncharted space.')
  await page
    .getByRole('link', { name: 'Discover alliances', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Leave without saving?' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click()
  await expect(
    page.getByRole('textbox', { name: 'Motto', exact: true }),
  ).toHaveValue('Good company. Uncharted space.')
  await page
    .getByRole('navigation', { name: 'Settings sections' })
    .getByRole('link', { name: 'Public page', exact: true })
    .click()
  await page
    .getByRole('textbox', { name: 'Hero introduction', exact: true })
    .fill('Build something worth coming home to.')
  await page
    .getByRole('button', { name: 'Preview public page', exact: true })
    .click()
  const preview = page.getByRole('dialog', {
    name: 'Preview · unsaved changes',
    exact: true,
  })
  await expect(
    preview.getByText('Build something worth coming home to.', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Close preview', exact: true }).click()
  await withFixtureResponse(page, mine, () =>
    page
      .getByRole('button', { name: 'Save presentation', exact: true })
      .click(),
  )
  await expect(
    page.getByText('Alliance presentation saved.', { exact: true }),
  ).toBeVisible()
  const command = fixture.commands.find(
    (c) => c.action.type === 'SavePresentation',
  )!
  expect(command.context.binding).toEqual(binding)
  expect(command.action).toMatchObject({
    type: 'SavePresentation',
    alliance: recruitmentAlliance,
  })
  expect(command.expected_revision).toBe(1)
  expect(
    command.action.type === 'SavePresentation' &&
      command.action.edits.map((e) => e.type),
  ).toEqual(['SetIdentity', 'SetTemplateDocument'])
  await withFixtureResponse(
    page,
    (r) => r.url().endsWith(`/alliances/${recruitmentAlliance}`),
    () => page.goto(`/alliances/${binding.universe}/${recruitmentAlliance}`),
  )
  await expect(
    page.getByText('Good company. Uncharted space.', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('Build something worth coming home to.', { exact: true }),
  ).toBeVisible()
})

// Route history/reload and the persistent workspace require the actual application router.
test(
  'alliance deep links restore settings and history preserves authored drafts',

  async ({ page }) => {
    await fixture(page, own())
    const root = `/u/andromeda/b/${body.id}/alliance`
    const membership = (response: import('@playwright/test').Response) =>
      response.url().endsWith('/alliances/query') &&
      response.request().postDataJSON().query.type === 'Mine'
    await withFixtureResponse(page, membership, () =>
      page.goto(`${root}/settings/recruitment`),
    )
    const settings = page.getByRole('navigation', { name: 'Settings sections' })
    const sections = page.getByRole('navigation', { name: 'Alliance sections' })
    await expect(
      settings.getByRole('link', { name: 'Recruitment', exact: true }),
    ).toHaveAttribute('aria-current', 'page')
    await withFixtureResponse(page, membership, () => page.reload())
    await expect(
      settings.getByRole('link', { name: 'Recruitment', exact: true }),
    ).toHaveAttribute('aria-current', 'page')
    await settings.getByRole('link', { name: 'Identity', exact: true }).click()
    await page
      .getByLabel('Alliance name', { exact: true })
      .fill('Unfinished constellation')
    await sections.getByRole('link', { name: 'Members', exact: true }).click()
    await expect(page).toHaveURL(`${root}/members`)
    await expect(
      page.getByRole('region', { name: 'Alliance roster' }),
    ).toBeVisible()
    await page.goBack()
    await expect(page).toHaveURL(`${root}/settings/identity`)
    await expect(page.getByLabel('Alliance name', { exact: true })).toHaveValue(
      'Unfinished constellation',
    )
    await page.goForward()
    await expect(
      page.getByRole('region', { name: 'Alliance roster' }),
    ).toBeVisible()
    await withFixtureResponse(page, membership, () =>
      page.goto(`${root}/audit`),
    )
    await expect(
      sections.getByRole('link', { name: 'Audit', exact: true }),
    ).toHaveAttribute('aria-current', 'page')
    await expect(
      page.getByText('Created alliance', { exact: true }),
    ).toBeVisible()
    // Planetless entry points must preserve the subsection when adding the owned body.
    await withFixtureResponse(page, membership, () =>
      page.goto('/u/andromeda/alliance/settings/invitations'),
    )
    await expect(page).toHaveURL(`${root}/settings/invitations`)
    await expect(
      settings.getByRole('link', { name: 'Invitations', exact: true }),
    ).toHaveAttribute('aria-current', 'page')
  },
)

// Route wiring: the image header must survive navigation away from the Hall.
