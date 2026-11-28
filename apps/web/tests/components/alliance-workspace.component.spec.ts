import { test, expect } from './fixture'
import { id } from '../../src/test-support/bootstrap'
import type {} from './alliance-workspace.scenario'
test('an expired noticeboard cursor publishes fresh notices and announces recovery in the actual alliance workspace', async ({
  page,
  mount,
}) => {
  await mount('alliance-workspace')
  const board = page.getByRole('region', { name: 'Alliance noticeboard' })
  await board
    .getByRole('button', { name: 'Load older notices', exact: true })
    .click()
  await expect(
    board.getByRole('heading', { name: 'Fresh standing orders', exact: true }),
  ).toBeVisible()
  await expect(
    board.getByRole('status').filter({ hasText: 'Showing the newest notices' }),
  ).toBeVisible()
  const queries = await page.evaluate(() => window.allianceWorkspaceQueries)
  expect(queries.filter((q) => q.type === 'Detail' && q.post_before)).toEqual([
    { type: 'Detail', alliance: id(800), post_before: id(851) },
  ])
  expect(queries.at(-1)).toEqual({
    type: 'Detail',
    alliance: id(800),
    post_before: null,
  })
})

test('own-alliance discovery returns to membership without submitting a command', async ({
  page,
  mount,
}) => {
  await mount('alliance-workspace')
  await page
    .getByRole('link', { name: 'Discover alliances', exact: true })
    .click()
  await expect(
    page.getByRole('link', { name: 'Create Alliance', exact: true }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'View STAR', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Welcome aboard' }),
  ).toBeVisible()
  expect(await page.evaluate(() => window.allianceWorkspaceCommands)).toEqual(
    [],
  )
})

for (const mode of ['join', 'apply', 'ordinary-apply'] as const) {
  test(mode === 'ordinary-apply' ? 'ordinary discovery locks the application draft during an ambiguous submission and retries that same request' : `the welcome ${mode} control retries the same confirmed command and returns to its membership result`, async ({
    page,
  }) => {
    const alliance = id(800)
    const path = `/api/v4/universes/${id(3)}/alliances/${alliance}`
    await page.route(
      (url) => url.pathname === path,
      (route) => {
        if (route.request().method() !== 'GET') return route.fallback()
        return route.fulfill({
          json: {
            summary: {
              id: alliance,
              universe: id(3),
              name: 'Starlight Assembly',
              tag: 'STAR',
              member_count: 2,
              recruitment: mode === 'join' ? 'Open' : 'Application',
            },
            public_text: 'Welcome explorers.',
          },
        })
      },
    )
    await page.goto('/?scenario=alliance-workspace&mode=' + mode)
    await expect(page.locator('html')).toHaveAttribute(
      'data-component-ready',
      'alliance-workspace',
    )
    if (mode === 'join') {
      await page.getByRole('button', { name: 'Join STAR', exact: true }).click()
      await page.getByRole('button', { name: 'Confirm join star' }).click()
    } else {
      await page
        .getByLabel('Application message')
        .fill('My original application')
      await page.getByRole('button', { name: 'Send application' }).click()
      await expect(
        page.getByRole('button', { name: 'Send application' }),
      ).toBeDisabled()
      await expect(page.getByLabel('Application message')).toBeDisabled()
      await expect(page.getByLabel('Application message')).toHaveValue(
        'My original application',
      )
    }
    await page.getByRole('button', { name: 'Retry last command' }).click()
    await expect(
      page.getByRole('heading', {
        name: mode === 'join' ? 'Welcome aboard' : 'Your applications (1/5)',
        exact: true,
      }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Retry last command' }),
    ).toHaveCount(0)
    const commands = await page.evaluate(() => window.allianceWorkspaceCommands)
    expect(commands).toHaveLength(2)
    for (const command of commands) {
      expect(command.context.binding).toEqual({
        account: id(1),
        player: id(2),
        universe: id(3),
        epoch: id(4),
      })
      expect(command.action).toEqual(
        mode === 'join'
          ? { type: 'Join', alliance }
          : { type: 'Apply', alliance, text: 'My original application' },
      )
    }
    expect(commands[1].command_id).toBe(commands[0].command_id)
    expect(commands[1].action).toEqual(commands[0].action)
  })
}

test('the alliance header keeps its published image while changing workspace sections', async ({
  page,
  mount,
}) => {
  await mount('alliance-workspace')
  await expect(
    page.getByRole('heading', { name: 'Welcome home, Admiral.' }),
  ).toBeVisible()
  const header = page.locator('header').filter({
    has: page.getByRole('heading', {
      name: 'Starlight Assembly',
      exact: true,
    }),
  })
  const art = header.locator('img').first()
  const tabs = page.getByRole('navigation', {
    name: 'Alliance sections',
    exact: true,
  })
  for (const name of [
    'Hall',
    'Members',
    'Applications',
    'Roles',
    'Settings',
    'Audit',
  ]) {
    const tab = tabs.getByRole('link', { name, exact: true })
    await tab.click()
    await expect(tab).toHaveAttribute('aria-current', 'page')
    await expect(art).toHaveAttribute(
      'src',
      '/art/orbital-capital/orbital-capital-1672.webp',
    )
    await expect(art).toBeVisible()
    await expect(art).toHaveJSProperty('complete', true)
    expect(
      await art.evaluate((node) => (node as HTMLImageElement).naturalWidth),
    ).toBeGreaterThan(0)
  }
})

test('the workspace subscribes to the departed author but the roster takes precedence over a stale affiliation', async ({
  page,
}) => {
  await page.goto('/?scenario=alliance-workspace&mode=identity')
  await expect(page.locator('html')).toHaveAttribute(
    'data-component-ready',
    'alliance-workspace',
  )
  const article = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: 'Welcome aboard' }) })
  const { focusPlayerDetails } = await import('../fixtures/profile-navigation')
  await focusPlayerDetails(
    page,
    article.getByRole('link', { name: 'Departed Pilot profile details' }),
  )
  await expect(
    page.getByRole('tooltip').getByRole('link', {
      name: 'Alliance Other Alliance [AWAY]',
      exact: true,
    }),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('link', { name: 'Members', exact: true }).click()
  const roster = page.getByRole('region', { name: 'Alliance roster' })
  await expect(
    roster
      .getByRole('link', { name: /profile details/ })
      .getByText('[STAR]', { exact: true }),
  ).toHaveCount(2)
  await expect(roster.getByText('[AWAY]', { exact: true })).toHaveCount(0)
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await focusPlayerDetails(
      page,
      roster.getByRole('link', { name: 'Nova profile details' }),
    )
    await expect(
      page.getByRole('tooltip', { name: 'Nova profile' }),
    ).toBeVisible()
    await page.keyboard.press('Escape')
  }
})

test('alliance discovery keeps the targeted application after refusal and returns to membership after withdrawal', async ({
  page,
}) => {
  const alliance = id(800)
  const profilePath = `/api/v4/universes/${id(3)}/alliances/${alliance}`
  await page.route(
    (url) => url.pathname === profilePath,
    (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      return route.fulfill({
        json: {
          summary: {
            id: alliance,
            universe: id(3),
            name: 'Starlight Assembly',
            tag: 'STAR',
            member_count: 2,
            recruitment: 'Application',
          },
          public_text: 'Recruiting curious commanders.',
        },
      })
    },
  )
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?scenario=alliance-workspace&mode=withdraw')
  await expect(page.locator('html')).toHaveAttribute(
    'data-component-ready',
    'alliance-workspace',
  )
  await page
    .getByRole('link', { name: 'Discover alliances', exact: true })
    .click()
  await expect(
    page.getByRole('link', { name: 'My alliance', exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('link', { name: 'Discover alliances', exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Refresh alliance', exact: true }),
  ).toHaveCount(0)
  await page
    .getByRole('searchbox', { name: 'Search alliances', exact: true })
    .fill('STAR')
  await page
    .getByRole('button', { name: 'Search alliances', exact: true })
    .click()
  await page.getByRole('button', { name: 'View STAR', exact: true }).click()
  const form = page.getByLabel('Application message')
  await expect(form).toBeVisible()
  const heading = page.getByRole('heading', {
    name: 'Discover alliances',
    exact: true,
    level: 2,
  })
  expect((await heading.boundingBox())!.height).toBeLessThan(60)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await form.fill('I explore distant stars.')
  const submit = page.getByRole('button', { name: 'Send application' })
  await submit.click()
  await expect(page.getByRole('alert')).toContainText('Conflict')
  await expect(form).toHaveValue('I explore distant stars.')
  await submit.click()
  await expect(
    page.getByRole('heading', { name: 'Your applications (1/5)' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Withdraw STAR', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm withdraw star' }).click()
  await expect(
    page.getByRole('heading', { name: 'You’re not in an alliance yet.' }),
  ).toBeVisible()
  const commands = await page.evaluate(() => window.allianceWorkspaceCommands)
  expect(commands.map((c) => c.action)).toEqual([
    { type: 'Apply', alliance, text: 'I explore distant stars.' },
    { type: 'Apply', alliance, text: 'I explore distant stars.' },
    { type: 'Withdraw', application: id(810) },
  ])
  for (const command of commands)
    expect(command.context.binding).toEqual({
      account: id(1),
      player: id(2),
      universe: id(3),
      epoch: id(4),
    })
  expect(commands[0].command_id).not.toBe(commands[1].command_id)
})

test('saved join recovery refreshes the mounted alliance workspace', async ({page}) => {
  await page.goto('/?scenario=alliance-workspace&mode=recover-join')
  await expect(page.locator('html')).toHaveAttribute('data-component-ready', 'alliance-workspace')
  await expect(page.getByRole('heading', {name:'You’re not in an alliance yet.'})).toBeVisible()
  await page.evaluate(() => window.recoverAllianceWorkspace())
  await expect(page.getByRole('heading', {name:'Starlight Assembly',exact:true})).toBeVisible()
  const commands = await page.evaluate(() => window.allianceWorkspaceCommands)
  expect(commands).toHaveLength(2)
  expect(commands[1]).toEqual(commands[0])
})
