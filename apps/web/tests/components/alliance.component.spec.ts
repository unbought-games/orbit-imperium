import { diagnosticScreenshot } from '../fixtures/diagnostic-screenshot'
import { test, expect } from './fixture'
import type {} from './alliance.story'

test('open composer publishes optional fields and menu edits, pins and deletes notices', async ({
  page,
  mount,
}) => {
  await mount('alliance-panels')
  const composer = page.getByRole('form', { name: 'Write a notice' })
  await expect(composer).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Preview notice' }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Newest notices' }),
  ).toHaveCount(0)
  await composer.getByRole('button', { name: 'Publish notice' }).click()
  await expect(composer.getByRole('alert')).toHaveText(
    'Add a title or a message.',
  )
  expect(await page.evaluate(() => window.allianceScenario.commands)).toEqual(
    [],
  )
  await composer
    .getByLabel('Notice body', { exact: true })
    .fill('**Meet** at dawn.')
  await composer.getByRole('button', { name: 'Publish notice' }).click()
  const article = page.getByRole('article', {
    name: 'Notice by Commander',
    exact: true,
  })
  await expect(
    article.getByText('Meet at dawn.', { exact: true }),
  ).toBeVisible()
  await expect(article.locator('strong')).toHaveText('Meet')
  await expect(composer.getByLabel('Notice body', { exact: true })).toHaveValue(
    '',
  )
  await article
    .getByRole('button', { name: 'Notice actions', exact: true })
    .click()
  await page.getByRole('menuitem', { name: 'Pin notice', exact: true }).click()
  await expect(article.getByText('Pinned', { exact: true })).toBeVisible()
  await article
    .getByRole('button', { name: 'Notice actions', exact: true })
    .click()
  await page.getByRole('menuitem', { name: 'Edit notice', exact: true }).click()
  const editor = article.getByRole('form', { name: 'Edit notice' })
  await expect(editor.getByLabel('Notice title', { exact: true })).toBeFocused()
  await editor.getByLabel('Notice title', { exact: true }).fill('Rally at noon')
  await editor.getByLabel('Notice body', { exact: true }).fill('')
  await page.evaluate(() => window.allianceScenario.reject())
  await editor.getByRole('button', { name: 'Save notice' }).click()
  await expect(page.getByRole('alert')).toContainText('Conflict')
  await expect(editor.getByLabel('Notice title', { exact: true })).toHaveValue(
    'Rally at noon',
  )
  await editor.getByRole('button', { name: 'Save notice' }).click()
  const revised = page.getByRole('article', {
    name: 'Rally at noon',
    exact: true,
  })
  await expect(
    revised.getByRole('heading', { name: 'Rally at noon' }),
  ).toBeVisible()
  await expect(revised.getByRole('form')).toHaveCount(0)
  await revised
    .getByRole('button', { name: 'Notice actions: Rally at noon' })
    .click()
  await page.getByRole('menuitem', { name: 'Edit notice', exact: true }).click()
  await revised
    .getByLabel('Notice title', { exact: true })
    .fill('Discard this change')
  await revised.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(
    revised.getByRole('heading', { name: 'Rally at noon' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Load older notices' }).click()
  await expect(
    page.getByRole('heading', { name: 'Older chapter' }),
  ).toBeVisible()
  await expect(revised).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Load older notices' }),
  ).toHaveCount(0)
  await revised
    .getByRole('button', { name: 'Notice actions: Rally at noon' })
    .click()
  await page
    .getByRole('menuitem', { name: 'Delete notice', exact: true })
    .click()
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toContainText(
    '“Rally at noon” will be permanently removed.',
  )
  await dialog.getByRole('button', { name: 'Keep notice', exact: true }).click()
  await expect(
    revised.getByRole('button', { name: 'Notice actions: Rally at noon' }),
  ).toBeFocused()
  await revised
    .getByRole('button', { name: 'Notice actions: Rally at noon' })
    .click()
  await page
    .getByRole('menuitem', { name: 'Delete notice', exact: true })
    .click()
  await dialog
    .getByRole('button', { name: 'Delete notice', exact: true })
    .click()
  await expect(revised).toHaveCount(0)
  expect(
    await page.evaluate(() =>
      window.allianceScenario.commands.map((c) => c.action.type),
    ),
  ).toEqual(['CreatePost', 'PinPost', 'EditPost', 'EditPost', 'DeletePost'])
})

test('role form delegates permissions, member editor assigns multiple roles and leadership confirms transfer', async ({
  page,
  mount,
}) => {
  await mount('alliance-panels')
  await page.getByRole('button', { name: 'Applications', exact: true }).click()
  await page
    .getByRole('button', { name: 'Accept New Pilot', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'No pending applications' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Roles', exact: true }).click()
  await page.getByText('Create a custom role', { exact: true }).click()
  await page
    .getByRole('textbox', { name: 'Role name', exact: true })
    .fill('Recruitment officer')
  for (const label of ['View applications', 'Accept and reject applications']) {
    await page
      .getByRole('checkbox', { name: `${label}: allow`, exact: true })
      .check()
    await page
      .getByRole('checkbox', { name: `${label}: delegate`, exact: true })
      .check()
  }
  await page.getByRole('button', { name: 'Create role', exact: true }).click()
  await expect(
    page.getByText('Recruitment officer', { exact: true }),
  ).toBeVisible()
  await page.getByText('Recruitment officer', { exact: true }).click()
  await page
    .getByRole('textbox', { name: 'Role name', exact: true })
    .fill('Recruitment captain')
  await page.getByRole('button', { name: 'Save role', exact: true }).click()
  await expect(
    page.getByText('Recruitment captain', { exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Members', exact: true }).click()
  await page.getByRole('button', { name: 'Member actions: Nova' }).click()
  await page
    .getByRole('menuitem', { name: 'Assign roles', exact: true })
    .click()
  await page.getByLabel('Recruitment captain', { exact: true }).check()
  await page.getByLabel('Scout', { exact: true }).check()
  await page.getByRole('button', { name: 'Save roles' }).click()
  await expect(page.getByRole('row').filter({ hasText: 'Nova' })).toContainText(
    'Scout · Recruitment captain',
  )
  const commands = await page.evaluate(() => window.allianceScenario.commands)
  expect(
    commands.find((c) => c.action.type === 'SaveRole')!.action,
  ).toMatchObject({
    permissions: ['ViewApplications', 'ProcessApplications'],
    grantable_permissions: ['ViewApplications', 'ProcessApplications'],
  })
  expect(
    commands.find((c) => c.action.type === 'AssignRoles')!.action,
  ).toMatchObject({ roles: ['scout', 'custom'] })
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Leadership', exact: true }).click()
  await page.getByLabel('New leader', { exact: true }).selectOption('nova')
  await page
    .getByRole('button', { name: 'Transfer leadership', exact: true })
    .click()
  await expect(
    page.getByRole('dialog', { name: 'Transfer leadership?' }),
  ).toContainText('you become a Member')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Transfer leadership', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'Disband alliance' }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Leave alliance' }),
  ).toBeVisible()
})

test('locked member role editor can cancel without submitting', async ({
  page,
  mount,
}) => {
  await mount('alliance-panels')
  await page.evaluate(() => window.allianceScenario.prepare('locked'))
  await page.getByRole('button', { name: 'Members', exact: true }).click()
  await page.getByRole('button', { name: 'Member actions: Nova' }).click()
  await page
    .getByRole('menuitem', { name: 'Assign roles', exact: true })
    .click()
  await expect(
    page.getByText('This member holds a role above your delegated authority.'),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save roles' })).toBeDisabled()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(
    page.getByRole('button', { name: 'Member actions: Nova' }),
  ).toBeVisible()
  expect(await page.evaluate(() => window.allianceScenario.commands)).toEqual(
    [],
  )
})

test('saving an unrelated role retains an edited notice draft across unmount', async ({
  page,
  mount,
}) => {
  await mount('alliance-panels')
  const draft = page.locator('form').filter({
    has: page.getByRole('button', { name: 'Publish notice', exact: true }),
  })
  await draft
    .getByRole('textbox', { name: 'Notice title', exact: true })
    .fill('Unpublished orders')
  await draft
    .getByRole('textbox', { name: 'Notice body', exact: true })
    .fill('Keep this draft while assigning duties.')
  await page.getByRole('button', { name: 'Roles', exact: true }).click()
  await page.getByText('Create a custom role', { exact: true }).click()
  await page
    .getByRole('textbox', { name: 'Role name', exact: true })
    .fill('Observer')
  await page.getByRole('button', { name: 'Create role', exact: true }).click()
  await expect(page.getByText('Observer', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Hall', exact: true }).click()
  await expect(
    draft.getByRole('textbox', { name: 'Notice title', exact: true }),
  ).toHaveValue('Unpublished orders')
  await expect(
    draft.getByRole('textbox', { name: 'Notice body', exact: true }),
  ).toHaveValue('Keep this draft while assigning duties.')
})

for (const width of [390, 1440]) {
  test.describe(`alliance components ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })
    test('long pinned notice keeps selection, focus and scroll across parent updates', async ({
      page,
      mount,
    }, info) => {
      await mount('alliance-panels')
      await page.evaluate(() => window.allianceScenario.prepare('long'))
      await page.evaluate(() => document.fonts.ready)
      const article = page.getByRole('article').filter({
          has: page.getByRole('heading', { name: 'Welcome aboard' }),
        }),
        passage = article.getByText('Read these standing orders together.', {
          exact: true,
        })
      await passage.scrollIntoViewIfNeeded()
      await passage.evaluate((node) => {
        const range = document.createRange()
        range.selectNodeContents(node)
        const selection = window.getSelection()!
        selection.removeAllRanges()
        selection.addRange(range)
      })
      const before = await page.evaluate(() => scrollY)
      // A parent render from a newer observation must retain keyed notice DOM.
      await page.evaluate(() => {
        const controller = window.allianceScenario.controller
        const view = controller.store.getState().view!
        controller.store.setState({
          view: { ...view, sampled_at: view.sampled_at + 1 },
        })
      })
      expect(await page.evaluate(() => scrollY)).toBeCloseTo(before, 0)
      expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(
        'Read these standing orders together.',
      )
      const link = article.getByRole('link', {
        name: 'Read recruitment',
        exact: true,
      })
      await link.focus()
      const focused = await page.evaluate(() => scrollY)
      await page.evaluate(() => {
        const controller = window.allianceScenario.controller
        controller.store.setState({
          view: structuredClone(controller.store.getState().view),
        })
      })
      await expect(link).toBeFocused()
      expect(await page.evaluate(() => scrollY)).toBeCloseTo(focused, 0)
      await page.setViewportSize({ width, height: 990 })
      const pages = page.getByRole('navigation', { name: 'Notice pages' })
      await pages.scrollIntoViewIfNeeded()
      await expect(
        pages.getByRole('button', { name: 'Load older notices' }),
      ).toBeInViewport()
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
      await expect(link).toHaveAttribute('href', '/alliances/universe/alliance')
      await diagnosticScreenshot(page, {
        path: info.outputPath(`notice-${width}x990.png`),
      })
    })
    test('recruitment form submits preferences and creates then disables a selectable invitation', async ({
      page,
      mount,
    }, info) => {
      await page.route('**/invite/universe/invitation-token/image', (route) =>
        route.fulfill({
          contentType: 'image/svg+xml',
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#101827"/><text x="100" y="300" fill="#f0e1bd" font-size="64">STAR · Starlight Assembly</text></svg>',
        }),
      )
      await mount('alliance-panels')
      await page.getByRole('button', { name: 'Settings', exact: true }).click()
      await page
        .getByRole('button', { name: 'Recruitment', exact: true })
        .click()
      await page.getByLabel('List in recruitment directory').uncheck()
      await page
        .getByLabel('Activity expectations', { exact: true })
        .selectOption('')
      await page
        .getByRole('button', { name: 'Save recruitment preferences' })
        .click()
      await expect(
        page.getByRole('button', { name: 'Recruitment', exact: true }),
      ).toHaveAttribute('aria-current', 'page')
      await page
        .getByRole('button', { name: 'Invitations', exact: true })
        .click()
      await expect(
        page.getByRole('button', { name: 'Create invitation link' }),
      ).toBeEnabled()
      await page.getByRole('button', { name: 'Create invitation link' }).click()
      const link = page.getByRole('textbox', {
        name: 'Invitation link',
        exact: true,
      })
      await expect(link).toHaveValue(/\/invite\/universe\/invitation-token$/)
      await link.focus()
      expect(
        await link.evaluate(
          (el: HTMLInputElement) => el.selectionEnd! - el.selectionStart!,
        ),
      ).toBe((await link.inputValue()).length)
      await expect(
        page.getByRole('link', { name: 'Preview invitation' }),
      ).toHaveAttribute('href', '/invite/universe/invitation-token')
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
      await diagnosticScreenshot(page, {
        path: info.outputPath(`recruitment-${width}x900.png`),
        fullPage: true,
      })
      await page
        .getByRole('button', { name: 'Disable invitation link', exact: true })
        .click()
      await page
        .getByRole('button', {
          name: 'Disable link',
          exact: true,
        })
        .click()
      await expect(
        page.getByRole('button', { name: 'Create invitation link' }),
      ).toBeVisible()
      const commands = await page.evaluate(
        () => window.allianceScenario.commands,
      )
      expect(commands.map((c) => c.action.type)).toEqual([
        'SetRecruitmentProfile',
        'SetInvitation',
        'SetInvitation',
      ])
      expect(commands[0].action).toMatchObject({
        profile: { listed: false, activity: null },
      })
    })
  })
}

test('departed authors use current affiliation and roster overrides stale affiliation', async ({
  page,
  mount,
}) => {
  await mount('alliance-panels')
  await page.evaluate(() => window.allianceScenario.prepare('departed'))
  await page
    .getByRole('button', { name: 'Departed Pilot profile details' })
    .click()
  await expect(
    page.getByRole('link', { name: 'Alliance Other Alliance [AWAY]' }),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Members', exact: true }).click()
  const roster = page.getByRole('region', { name: 'Alliance roster' })
  await expect(roster.getByText('[STAR]', { exact: true })).toHaveCount(2)
  await expect(roster.getByText('[AWAY]', { exact: true })).toHaveCount(0)
  await roster.getByRole('button', { name: 'Nova profile details' }).click()
  await expect(
    page.getByRole('link', { name: 'Alliance Starlight Assembly [STAR]' }),
  ).toBeVisible()
})

test('application form preserves rejected edits and recruitment mode changes its controls', async ({
  page,
  mount,
}) => {
  await mount('alliance-recruit')
  await page.getByLabel('Application message').fill('I explore distant stars.')
  await page.getByRole('button', { name: 'Send application' }).click()
  await expect(page.getByLabel('Recruitment result')).toHaveText('Conflict')
  await expect(page.getByLabel('Application message')).toHaveValue(
    'I explore distant stars.',
  )
  await page.getByRole('button', { name: 'Send application' }).click()
  await expect(page.getByLabel('Recruitment result')).toContainText(
    'I explore distant stars.',
  )
  await expect(page.getByLabel('Application message')).toHaveValue('')
  await page.getByLabel('Recruitment mode').selectOption('Closed')
  await expect(page.getByText('This alliance is not recruiting.')).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Send application' }),
  ).toHaveCount(0)
  await page.getByLabel('Recruitment mode').selectOption('Open')
  await page.getByRole('button', { name: 'Join STAR', exact: true }).click()
  await expect(
    page.getByRole('group', { name: 'Review Join STAR' }),
  ).toContainText('All your pending applications will be withdrawn.')
  await page.getByRole('button', { name: 'Confirm join star' }).click()
  await expect(page.getByLabel('Recruitment result')).toContainText(
    '"type":"Join"',
  )
})

test('noticeboard controls fit the intermediate 768px viewport', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 768, height: 900 })
  await mount('alliance-panels')
  await expect(
    page.getByRole('heading', { name: 'Welcome aboard' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Publish notice' }),
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
})

for (const width of [390, 1440]) {
  test(`compact member roster remains readable and opens role actions at ${width}px`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await mount('alliance-panels')
    await page.evaluate(() => window.allianceScenario.prepare('roster'))
    await page.getByRole('button', { name: 'Members', exact: true }).click()
    const roster = page.getByRole('region', { name: 'Alliance roster' })
    const table = roster.getByRole('table', { name: 'Alliance members' })
    await expect(table.getByRole('row')).toHaveCount(9)
    await expect(
      roster.getByRole('heading', { name: 'Members', exact: true }),
    ).toHaveCount(0)
    await expect(
      roster.getByText('Exact activity times are private.', { exact: true }),
    ).toHaveCount(0)
    // A populated roster must not return to tall per-member cards.
    expect((await table.boundingBox())!.height).toBeLessThan(
      width === 390 ? 660 : 520,
    )
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await expect(table.getByRole('row').nth(1)).toContainText('Commander')
    const nova = table.getByRole('row').filter({ hasText: 'Nova' })
    await nova.getByRole('button', { name: 'Member actions: Nova' }).click()
    await page
      .getByRole('menuitem', { name: 'Assign roles', exact: true })
      .click()
    const dialog = page.getByRole('dialog', { name: 'Roles for Nova' })
    await expect(dialog.getByLabel('Scout', { exact: true })).toBeChecked()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(
      nova.getByRole('button', { name: 'Member actions: Nova' }),
    ).toBeFocused()
    await nova.getByRole('button', { name: 'Member actions: Nova' }).click()
    await page
      .getByRole('menuitem', { name: 'Remove member', exact: true })
      .click()
    const confirmation = page.getByRole('alertdialog', { name: 'Remove Nova?' })
    await expect(confirmation).toContainText('lose access')
    await confirmation.getByRole('button', { name: 'Keep member' }).click()
    await expect(nova).toBeVisible()
    await nova.getByRole('button', { name: 'Member actions: Nova' }).click()
    await page
      .getByRole('menuitem', { name: 'Remove member', exact: true })
      .click()
    await confirmation
      .getByRole('button', { name: 'Remove member', exact: true })
      .click()
    await expect(table.getByRole('row')).toHaveCount(8)
    await expect(nova).toHaveCount(0)
  })
}

test('read-only roster omits unauthorized activity and management actions', async ({
  page,
  mount,
}) => {
  await mount('alliance-panels')
  await page.evaluate(() => window.allianceScenario.prepare('viewer'))
  await page.getByRole('button', { name: 'Members', exact: true }).click()
  const roster = page.getByRole('region', { name: 'Alliance roster' })
  await expect(
    roster.getByRole('columnheader', { name: 'Activity' }),
  ).toHaveCount(0)
  await expect(roster.getByText('Recent', { exact: true })).toHaveCount(0)
  await expect(roster.getByText('Away', { exact: true })).toHaveCount(0)
  await expect(roster.getByText('Inactive', { exact: true })).toHaveCount(0)
  await expect(
    roster.getByRole('button', { name: /Member actions:/ }),
  ).toHaveCount(0)
})

test('rejected member-role edits retain selections and explain the failure inside the dialog', async ({
  page,
  mount,
}) => {
  await mount('alliance-panels')
  await page.getByRole('button', { name: 'Members', exact: true }).click()
  await page.getByRole('button', { name: 'Member actions: Nova' }).click()
  await page
    .getByRole('menuitem', { name: 'Assign roles', exact: true })
    .click()
  const dialog = page.getByRole('dialog', { name: 'Roles for Nova' })
  await dialog.getByLabel('Scout', { exact: true }).check()
  await page.evaluate(() => window.allianceScenario.reject())
  await dialog.getByRole('button', { name: 'Save roles' }).click()
  await expect(dialog.getByRole('alert')).toContainText(
    'Could not save these roles.',
  )
  await expect(dialog.getByLabel('Scout', { exact: true })).toBeChecked()
  await dialog.getByRole('button', { name: 'Save roles' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('row').filter({ hasText: 'Nova' })).toContainText(
    'Scout',
  )
})

for (const width of [1440, 390]) {
  test(`applications recruitment link moves into the empty state at ${width}px`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    await mount('alliance-panels')
    await page
      .getByRole('button', { name: 'Applications', exact: true })
      .click()
    const section = page.getByRole('region', {
      name: 'Recruitment applications',
    })
    const link = section.getByRole('link', { name: 'Recruitment page' })
    await expect(link).toHaveAttribute('href', '/alliances/universe/alliance')
    const title = await section
      .getByRole('heading', { name: 'Applications', exact: true })
      .boundingBox()
    const action = await link.boundingBox()
    expect(title).not.toBeNull()
    expect(action).not.toBeNull()
    expect(action!.x).toBeGreaterThan(title!.x + title!.width)
    expect(
      Math.abs(action!.y + action!.height / 2 - title!.y - title!.height / 2),
    ).toBeLessThan(2)
    await section
      .getByRole('button', { name: 'Accept New Pilot', exact: true })
      .click()
    const empty = section.getByRole('region', {
      name: 'No pending applications',
    })
    await expect(
      empty.getByRole('link', { name: 'Recruitment page' }),
    ).toBeVisible()
    await expect(link).toHaveCount(1)
    await expect(section.getByRole('article')).toHaveCount(0)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
  })
}

test('settings keep independent drafts and the selected section across rejected and successful saves', async ({
  page,
  mount,
}) => {
  await mount('alliance-panels')
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page
    .getByLabel('Alliance name', { exact: true })
    .fill('Starlight Voyagers')
  await page.getByLabel('Public recruitment text').fill('Explore with us.')
  await page.evaluate(() => window.allianceScenario.reject())
  await page.getByRole('button', { name: 'Save profile' }).click()
  await expect(page.getByRole('alert')).toContainText('Conflict')
  await expect(page.getByLabel('Alliance name', { exact: true })).toHaveValue(
    'Starlight Voyagers',
  )
  await page.getByRole('button', { name: 'Recruitment', exact: true }).click()
  await page.getByLabel('Recruitment', { exact: true }).selectOption('Closed')
  await page.getByRole('button', { name: 'Save joining rules' }).click()
  await expect(
    page.getByRole('button', { name: 'Recruitment', exact: true }),
  ).toHaveAttribute('aria-current', 'page')
  await expect(page.getByLabel('Recruitment', { exact: true })).toHaveValue(
    'Closed',
  )
  await page.getByRole('button', { name: 'Identity', exact: true }).click()
  await expect(page.getByLabel('Alliance name', { exact: true })).toHaveValue(
    'Starlight Voyagers',
  )
  await page.getByRole('button', { name: 'Save profile' }).click()
  await page.getByRole('button', { name: 'Recruitment', exact: true }).click()
  await expect(page.getByLabel('Recruitment', { exact: true })).toHaveValue(
    'Closed',
  )
  await page.getByRole('button', { name: 'Identity', exact: true }).click()
  await expect(page.getByLabel('Alliance name', { exact: true })).toHaveValue(
    'Starlight Voyagers',
  )
  await expect(page.getByLabel('Public recruitment text')).toHaveValue(
    'Explore with us.',
  )
  const updates = await page.evaluate(() =>
    window.allianceScenario.commands.map(({ action }) => action),
  )
  expect(updates[1]).toMatchObject({
    type: 'Update',
    name: 'Starlight Assembly',
    recruitment: 'Closed',
    public_text: 'Together among the stars.',
  })
  expect(updates[2]).toMatchObject({
    type: 'Update',
    name: 'Starlight Voyagers',
    recruitment: 'Closed',
    public_text: 'Explore with us.',
  })
})

for (const width of [1440, 390]) {
  test(`settings navigation and leadership review fit ${width}px`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    await mount('alliance-panels')
    await page.evaluate(() => window.allianceScenario.prepare('roster'))
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    const nav = page.getByRole('navigation', { name: 'Settings sections' })
    for (const name of [
      'Identity',
      'Recruitment',
      'Invitations',
      'Leadership',
    ]) {
      await nav.getByRole('button', { name, exact: true }).click()
      await expect(
        nav.getByRole('button', { name, exact: true }),
      ).toHaveAttribute('aria-current', 'page')
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
    }
    const transfer = page.getByRole('button', {
      name: 'Transfer leadership',
      exact: true,
    })
    await expect(transfer).toHaveCount(1)
    await expect(transfer).toBeDisabled()
    await page.getByLabel('New leader', { exact: true }).selectOption('nova')
    await transfer.click()
    const dialog = page.getByRole('dialog', { name: 'Transfer leadership?' })
    await expect(dialog).toContainText('Make Nova leader')
    await expect(
      dialog.getByRole('button', { name: 'Cancel', exact: true }),
    ).toBeFocused()
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(transfer).toBeFocused()
    await page
      .getByRole('button', { name: 'Disband alliance', exact: true })
      .click()
    await expect(page.getByRole('dialog')).toContainText(
      'This cannot be undone.',
    )
    await page.getByRole('button', { name: 'Keep alliance' }).click()
    expect(await page.evaluate(() => window.allianceScenario.commands)).toEqual(
      [],
    )
  })
}

for (const width of [1440, 390]) {
  test(`audit table explains targets and timestamps without overflow at ${width}px`, async ({
    page,
    mount,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    await mount('alliance-panels')
    await page.evaluate(() => window.allianceScenario.prepare('audit'))
    await page.getByRole('button', { name: 'Audit', exact: true }).click()
    const table = page.getByRole('table', {
      name: 'Alliance activity, newest first',
    })
    const changed = table.getByRole('row').filter({ hasText: 'Changed roles' })
    await expect(changed).toContainText('Commander')
    await expect(changed).toContainText('Nova')
    await expect(changed.locator('time')).toHaveAttribute(
      'datetime',
      '2023-11-14T22:13:25.000Z',
    )
    await expect(
      table.getByRole('row').filter({ hasText: 'Deleted role' }),
    ).toContainText('Expedition coordinator')
    await expect(
      table.getByRole('row').filter({ hasText: 'Deleted notice' }),
    ).toContainText('Launch instructions for the distant outer systems')
    await expect(
      table.getByRole('row').filter({ hasText: 'Accepted application' }),
    ).toContainText('Former applicant')
    await expect(table).not.toContainText('old-application')
    await expect(table).not.toContainText('deleted-role')
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    const box = await changed.boundingBox()
    expect(box!.height).toBeLessThanOrEqual(width === 390 ? 85 : 56)
    await page.evaluate(() => window.allianceScenario.prepare('audit-empty'))
    await expect(
      page.getByRole('heading', { name: 'No activity yet' }),
    ).toBeVisible()
    await expect(table).toHaveCount(0)
  })
}
