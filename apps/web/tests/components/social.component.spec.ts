import { test, expect, type Page } from './fixture'
import type {} from './social.story'
async function open(page: Page) {
  await page
    .getByRole('button', { name: /Open conversation with Nova/ })
    .click()
  await expect(
    page.getByLabel('Message history').getByText('Message 65', { exact: true }),
  ).toBeVisible()
}
async function category(page: Page, name: string) {
  if (page.viewportSize()!.width < 768) {
    await page
      .getByRole('button', { name: 'Message categories', exact: true })
      .click()
    await page.getByRole('menuitemradio', { name, exact: true }).click()
  } else await page.getByRole('button', { name, exact: true }).click()
}
for (const width of [1440, 390]) {
  test.describe(`social components ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } })
    test('background delivery preserves composer focus, selection, geometry and older-history anchor', async ({
      page,
      mount,
    }) => {
      await mount('social-workspace')
      await open(page)
      const history = page.getByLabel('Message history'),
        composer = page.getByLabel('Message', { exact: true }),
        older = page.getByRole('button', { name: 'Load older messages' })
      await composer.fill('An unfinished message')
      await composer.evaluate((el: HTMLTextAreaElement) =>
        el.setSelectionRange(3, 8),
      )
      await history.evaluate((el) => {
        el.scrollTop = 100
        el.dispatchEvent(new Event('scroll'))
      })
      const position = () =>
        page.evaluate(() => {
          const history = document.querySelector(
              '[aria-label="Message history"]',
            )!,
            composer = document.querySelector('textarea')!
          return {
            historyY: history.getBoundingClientRect().y,
            composerY: composer.getBoundingClientRect().y,
            top: history.scrollTop,
            page: scrollY,
            selection: [composer.selectionStart, composer.selectionEnd],
          }
        })
      const before = await position()
      await page.evaluate(() => {
        window.socialScenario.hold()
        void window.socialScenario.poll()
      })
      await expect(older).toBeEnabled()
      await expect(composer).toBeFocused()
      expect(await position()).toEqual(before)
      await page.evaluate(() => {
        window.socialScenario.incoming()
        window.socialScenario.release()
      })
      await expect(
        history.getByText('Message 66', { exact: true }),
      ).toHaveCount(1)
      await expect(composer).toBeFocused()
      expect(await position()).toEqual(before)
      await history.evaluate((el) => {
        el.scrollTop = el.scrollHeight
        el.dispatchEvent(new Event('scroll'))
      })
      await page.evaluate(async () => {
        window.socialScenario.incoming()
        await window.socialScenario.poll()
      })
      await expect(
        history.getByText('Message 67', { exact: true }),
      ).toBeVisible()
      expect(
        await history.evaluate(
          (el) => el.scrollHeight - el.scrollTop - el.clientHeight,
        ),
      ).toBeLessThan(2)
      await history.evaluate((el) => {
        el.scrollTop = 0
        el.dispatchEvent(new Event('scroll'))
      })
      const anchor = history.getByText('Message 16', { exact: true })
      const offset = () =>
        anchor.evaluate(
          (el) =>
            el.getBoundingClientRect().top -
            el
              .closest('[aria-label="Message history"]')!
              .getBoundingClientRect().top,
        )
      const anchored = await offset()
      await page.evaluate(() => {
        window.socialScenario.hold()
        void window.socialScenario.poll()
      })
      await older.click()
      await expect(older).toBeDisabled()
      await composer.fill('Still editing while history is queued')
      await page.evaluate(() => window.socialScenario.release())
      await expect(history.getByText('Message 1', { exact: true })).toHaveCount(
        1,
      )
      expect(Math.abs((await offset()) - anchored)).toBeLessThan(1)
      await expect(composer).toBeFocused()
      await expect(composer).toHaveValue(
        'Still editing while history is queued',
      )
      expect(
        await history.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true)
    })
    test('search, filters, message alignment, keyboard submission and menu focus use actual controls', async ({
      page,
      mount,
    }, info) => {
      await mount('social-workspace')
      await expect(
        page.getByRole('button', { name: /Open conversation with/ }),
      ).toHaveCount(4)
      await page.getByLabel('Search conversations').fill('missing')
      await expect(page.getByText('No matching conversations')).toBeVisible()
      await page.getByRole('button', { name: 'Clear filters' }).click()
      const filters = page.getByRole('button', {
        name: 'Conversation filters and sorting',
      })
      await filters.click()
      await page.getByLabel('Sort by', { exact: true }).selectOption('name')
      await page.getByLabel('Show', { exact: true }).selectOption('unread')
      await page.keyboard.press('Escape')
      await expect(filters).toBeFocused()
      await expect(
        page.getByRole('button', { name: /Open conversation with/ }),
      ).toHaveCount(2)
      await page.getByRole('button', { name: 'Show all', exact: true }).click()
      await open(page)
      const history = page.getByLabel('Message history'),
        composer = page.getByLabel('Message', { exact: true })
      const left = await history
          .getByRole('article', { name: 'Message from Nova to you' })
          .last()
          .boundingBox(),
        right = await history
          .getByRole('article', { name: 'Message from you to Nova' })
          .last()
          .boundingBox(),
        box = await history.boundingBox()
      expect(left!.x).toBeLessThan(right!.x)
      expect(left!.width).toBeLessThanOrEqual(box!.width * 0.79)
      expect(right!.width).toBeLessThanOrEqual(box!.width * 0.79)
      await composer.fill('See you there!')
      await page
        .getByRole('button', { name: 'Back to conversations', exact: true })
        .click()
      await open(page)
      await expect(composer).toHaveValue('See you there!')
      await composer.press('End')
      await composer.press('Enter')
      await expect(composer).toHaveValue('See you there!\n')
      expect(
        await page.evaluate(
          () =>
            window.socialScenario.commands.filter(
              (c) => c.action.type === 'Send',
            ).length,
        ),
      ).toBe(0)
      await composer.press('Control+Enter')
      await expect(
        history.getByText('See you there!', { exact: true }),
      ).toBeVisible()
      await expect(composer).toHaveValue('')
      await composer.fill('🚀'.repeat(4001))
      await expect(
        page.getByRole('button', { name: 'Send message' }),
      ).toBeDisabled()
      await composer.press('Control+Enter')
      expect(
        await page.evaluate(
          () =>
            window.socialScenario.commands.filter(
              (c) => c.action.type === 'Send',
            ).length,
        ),
      ).toBe(1)
      await composer.fill('')
      const options = page.getByRole('button', {
          name: 'Conversation options',
          exact: true,
        }),
        menu = page.getByRole('menu', {
          name: 'Conversation options',
          exact: true,
        })
      await options.click()
      await expect
        .poll(() => menu.evaluate((el) => el.contains(document.activeElement)))
        .toBe(true)
      await page.keyboard.press('Escape')
      await expect(menu).toBeHidden()
      await expect(options).toBeFocused()
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
      await page.screenshot({ path: info.outputPath(`chat-${width}x900.png`) })
    })
    test('empty history, failed refresh, long Markdown and blocking preserve usable controls', async ({
      page,
      mount,
    }) => {
      await mount('social-workspace')
      await page.evaluate(() => {
        window.socialScenario.empty()
        window.socialScenario.failHistory()
      })
      await page
        .getByRole('button', { name: /Open conversation with Nova/ })
        .click()
      await expect(page.getByRole('alert')).toHaveText('History unavailable')
      await page.getByRole('button', { name: 'Retry messages' }).click()
      await expect(page.getByText('Start your conversation.')).toBeVisible()
      const composer = page.getByLabel('Message', { exact: true })
      await composer.fill('First draft')
      await page.evaluate(() => {
        window.socialScenario.hold()
        void window.socialScenario.poll()
      })
      await expect(page.getByText('Loading messages…')).toHaveCount(0)
      await expect(composer).toBeFocused()
      await page.evaluate(() => window.socialScenario.release())
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              window.socialScenario.controller.store.getState().historyRequest,
          ),
        )
        .toBeNull()
      await page.evaluate(async () => {
        window.socialScenario.incoming()
        await window.socialScenario.poll()
      })
      await expect(
        page
          .getByLabel('Message history')
          .getByText('Message 1', { exact: true }),
      ).toBeVisible()
      await page.evaluate(async () => {
        window.socialScenario.failHistory()
        await window.socialScenario.poll()
      })
      await expect(page.getByRole('alert')).toHaveText('History unavailable')
      await expect(composer).toBeFocused()
      await expect(composer).toHaveValue('First draft')
      await page.getByRole('button', { name: 'Retry messages' }).click()
      await expect(page.getByRole('alert')).toHaveCount(0)
      const long =
        '**Meet** ' +
        'outer-colony-'.repeat(35) +
        '\n\n<script>window.evil=true</script>\n\n![blocked](https://example.com/no.png)'
      await composer.fill(long)
      await page.getByRole('button', { name: 'Send message' }).click()
      const history = page.getByLabel('Message history')
      await expect(
        history.locator('strong').filter({ hasText: 'Meet' }),
      ).toBeVisible()
      await expect(history.locator('img, script')).toHaveCount(0)
      expect(
        await history.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true)
      await page
        .getByRole('button', { name: 'Conversation options', exact: true })
        .click()
      await page
        .getByRole('menuitem', { name: 'Block player', exact: true })
        .click()
      await expect(
        page.getByText(
          'This player is blocked. Unblock them to send messages.',
        ),
      ).toBeVisible()
      await expect(composer).toHaveCount(0)
      await page
        .getByRole('button', { name: 'Conversation options', exact: true })
        .click()
      await page
        .getByRole('menuitem', { name: 'Unblock player', exact: true })
        .click()
      await expect(composer).toBeEnabled()
      await page
        .getByRole('button', { name: 'Conversation options', exact: true })
        .click()
      await page
        .getByRole('menuitem', { name: 'Add friend', exact: true })
        .click()
      await page
        .getByRole('button', { name: 'Conversation options', exact: true })
        .click()
      await expect(
        page.getByRole('menuitem', { name: 'Cancel request', exact: true }),
      ).toBeVisible()
      await page.keyboard.press('Escape')
    })
  })
}

test('uncertain submission locks edits and retries the original body before clearing its draft', async ({
  page,
  mount,
}) => {
  await mount('social-workspace')
  await open(page)
  const composer = page.getByLabel('Message', { exact: true })
  await composer.fill('Original message')
  await page.evaluate(() => window.socialScenario.failSend())
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(composer).toBeDisabled()
  await expect(composer).toHaveValue('Original message')
  await page.getByRole('button', { name: 'Retry pending action' }).click()
  await expect(
    page.getByLabel('Message history').getByText('Original message'),
  ).toBeVisible()
  await expect(composer).toHaveValue('')
  const commands = await page.evaluate(() =>
    window.socialScenario.commands.filter((c) => c.action.type === 'Send'),
  )
  expect(commands).toHaveLength(2)
  expect(commands[1]).toEqual(commands[0])
})

test('contact menus and one-way circular composer expose their resulting state', async ({
  page,
  mount,
}) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await mount('social-workspace')
  await page.evaluate(() => window.socialScenario.invite())
  await category(page, 'Requests')
  await page.getByRole('button', { name: 'Contact options for Nova' }).click()
  await page
    .getByRole('menuitem', { name: 'Accept friend', exact: true })
    .click()
  await category(page, 'Friends')
  await expect(page.getByText('Nova', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Message Nova', exact: true }).click()
  await expect(page.getByLabel('Message', { exact: true })).toBeVisible()
  await page
    .getByRole('button', { name: 'Back to conversations', exact: true })
    .click()
  await category(page, 'Friends')
  await page.getByRole('button', { name: 'Contact options for Nova' }).click()
  await expect(
    page.getByRole('menuitem', { name: 'Remove friend' }),
  ).toBeVisible()
  await page
    .getByRole('menuitem', { name: 'Block player', exact: true })
    .click()
  await category(page, 'Blocks')
  await page.getByRole('button', { name: 'Contact options for Nova' }).click()
  await expect(
    page.getByRole('menuitem', { name: 'Unblock player' }),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await category(page, 'Circulars')
  await page.getByLabel('Alliance announcement').fill('Meet at the outpost.')
  await page.getByRole('button', { name: 'Send circular', exact: true }).click()
  await expect(
    page.getByRole('article').getByText('Meet at the outpost.'),
  ).toBeVisible()
  await expect(
    page.getByText('One-way announcement to current members. No reply-all.'),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Hide circular', exact: true }).click()
  await expect(page.getByRole('article')).toHaveCount(0)
})

test('message categories share the heading and collapse into a keyboard-accessible mobile menu', async ({
  page,
  mount,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await mount('social-workspace')
  const title = page.getByRole('heading', {
    name: 'Messages',
    exact: true,
    level: 2,
  })
  const categories = page.getByRole('group', {
    name: 'Message categories',
    exact: true,
  })
  await expect(categories).toBeVisible()
  const [heading, group] = await Promise.all([
    title.boundingBox(),
    categories.boundingBox(),
  ])
  expect(
    Math.abs(heading!.y + heading!.height / 2 - group!.y - group!.height / 2),
  ).toBeLessThan(2)
  expect(group!.x).toBeGreaterThan(heading!.x + heading!.width)
  await category(page, 'Friends')
  await expect(page.getByText(/No friends yet/)).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  const trigger = page.getByRole('button', {
    name: 'Message categories',
    exact: true,
  })
  await expect(trigger).toHaveText('Friends')
  await expect(categories).toHaveCount(0)
  await trigger.focus()
  await page.keyboard.press('Enter')
  await expect(
    page.getByRole('menuitemradio', { name: 'Friends', exact: true }),
  ).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  await trigger.press('Enter')
  await expect(
    page.getByRole('menuitemradio', { name: 'Conversations', exact: true }),
  ).toBeFocused()
  await page.keyboard.press('End')
  await expect(
    page.getByRole('menuitemradio', { name: 'Blocks', exact: true }),
  ).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(trigger).toHaveText('Blocks')
  await expect(page.getByText('No blocks yet.')).toBeVisible()
  await page.setViewportSize({ width: 1440, height: 1000 })
  await expect(
    page.getByRole('button', { name: 'Blocks', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await page.setViewportSize({ width: 320, height: 740 })
  await expect(trigger).toHaveText('Blocks')
  await category(page, 'Conversations')
  const [mobileHeading, mobileTrigger, refresh] = await Promise.all([
    title.boundingBox(),
    trigger.boundingBox(),
    page.getByRole('button', { name: 'Refresh', exact: true }).boundingBox(),
  ])
  expect(
    Math.abs(
      mobileHeading!.y +
        mobileHeading!.height / 2 -
        mobileTrigger!.y -
        mobileTrigger!.height / 2,
    ),
  ).toBeLessThan(2)
  expect(
    Math.abs(
      mobileHeading!.y +
        mobileHeading!.height / 2 -
        refresh!.y -
        refresh!.height / 2,
    ),
  ).toBeLessThan(2)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  const search = page.getByRole('textbox', { name: 'Search conversations' })
  const icon = search.locator('..').locator('svg')
  const [fieldBounds, iconBounds] = await Promise.all([
    search.boundingBox(),
    icon.boundingBox(),
  ])
  expect(iconBounds!.x).toBeGreaterThan(fieldBounds!.x)
  expect(iconBounds!.x + iconBounds!.width).toBeLessThan(
    fieldBounds!.x + fieldBounds!.width,
  )
  expect(
    Math.abs(
      iconBounds!.y +
        iconBounds!.height / 2 -
        fieldBounds!.y -
        fieldBounds!.height / 2,
    ),
  ).toBeLessThan(1)
  await search.locator('..').click({ position: { x: 20, y: 22 } })
  await expect(search).toBeFocused()
})
