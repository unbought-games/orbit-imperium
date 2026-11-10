import { diagnosticScreenshot } from '../fixtures/diagnostic-screenshot'
import { test, expect } from './fixture'
import type {} from './alliance.story'

test('notice form previews safe Markdown, publishes, pins, edits and changes pages', async ({
  page,
  mount,
}) => {
  await mount('alliance-panels')
  await expect(
    page.getByRole('heading', { name: 'Welcome aboard' }),
  ).toBeVisible()
  await page.getByText('Write a notice', { exact: true }).click()
  await page
    .getByLabel('Notice title', { exact: true })
    .first()
    .fill('Rally at dawn')
  await page
    .getByLabel('Notice body', { exact: true })
    .first()
    .fill('**Meet** at dawn.\n\n<img src=x onerror=alert(1)>')
  await page
    .getByRole('button', { name: 'Preview notice', exact: true })
    .first()
    .click()
  await expect(page.locator('strong').filter({ hasText: 'Meet' })).toBeVisible()
  await expect(page.locator('img')).toHaveCount(0)
  await page.getByRole('button', { name: 'Publish notice' }).click()
  await expect(
    page.getByRole('heading', { name: 'Rally at dawn' }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Pin Rally at dawn', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'Unpin Rally at dawn', exact: true }),
  ).toBeVisible()
  const article = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name: 'Rally at dawn' }) })
  await article.getByText('Edit notice', { exact: true }).click()
  await article
    .getByLabel('Notice title', { exact: true })
    .fill('Rally at noon')
  await article
    .getByRole('button', { name: 'Preview notice', exact: true })
    .click()
  await article
    .getByRole('textbox', { name: 'Notice body', exact: true })
    .fill('**Meet** at noon instead.')
  await article
    .getByRole('button', { name: 'Preview notice', exact: true })
    .click()
  await expect(
    article.getByText('Meet at noon instead.', { exact: true }),
  ).toHaveCount(1)
  await article.getByRole('button', { name: 'Save notice' }).click()
  await expect(
    page.getByRole('heading', { name: 'Rally at noon' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Older notices' }).click()
  await expect(
    page.getByRole('heading', { name: 'Older chapter' }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Rally at noon' }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Newest notices' }).click()
  await expect(
    page.getByRole('heading', { name: 'Rally at noon' }),
  ).toBeVisible()
  expect(
    await page.evaluate(() =>
      window.allianceScenario.commands.map((c) => c.action.type),
    ),
  ).toEqual(['CreatePost', 'PinPost', 'EditPost'])
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
  await expect(page.getByText('No pending applications.')).toBeVisible()
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
  await page.getByRole('button', { name: 'Assign roles to Nova' }).click()
  await page.getByLabel('Recruitment captain', { exact: true }).check()
  await page.getByLabel('Scout', { exact: true }).check()
  await page.getByRole('button', { name: 'Save member roles' }).click()
  await expect(
    page.getByRole('article').filter({ hasText: 'Nova' }),
  ).toContainText('Scout · Recruitment captain')
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
  await page
    .getByRole('button', { name: 'Transfer to Nova', exact: true })
    .click()
  await expect(
    page.getByRole('group', { name: 'Review Transfer to Nova' }),
  ).toContainText('you become a Member')
  await page.getByRole('button', { name: 'Confirm transfer to nova' }).click()
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
  await page.getByRole('button', { name: 'Assign roles to Nova' }).click()
  await expect(
    page.getByText('This member holds a role above your delegated authority.'),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Save member roles' }),
  ).toBeDisabled()
  await page.getByRole('button', { name: 'Cancel role changes' }).click()
  await expect(
    page.getByRole('button', { name: 'Assign roles to Nova' }),
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
  await page.getByText('Write a notice', { exact: true }).click()
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
  await page.getByRole('button', { name: 'Board', exact: true }).click()
  await page.getByText('Write a notice', { exact: true }).click()
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
        pages.getByRole('button', { name: 'Newest notices' }),
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
      await page.getByLabel('List in recruitment directory').uncheck()
      await page
        .getByLabel('Activity expectations', { exact: true })
        .selectOption('')
      await page
        .getByRole('button', { name: 'Save recruitment preferences' })
        .click()
      await expect(
        page.getByRole('button', { name: 'Create invitation link' }),
      ).toBeEnabled()
      await page.getByRole('button', { name: 'Create invitation link' }).click()
      const link = page.getByLabel('Invitation link', { exact: true })
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
          name: 'Confirm disable invitation link',
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
  await page.getByText('Write a notice', { exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Publish notice' }),
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
})
