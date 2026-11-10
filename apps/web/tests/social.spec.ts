import { withSocialResponse } from './fixtures/responses'
import { diagnosticScreenshot } from './fixtures/diagnostic-screenshot'
import { test, expect, type Page } from './fixtures/test'
import { installGameFixture, binding, id } from './fixtures/game'
import type { components } from '../src/contracts'
type S = components['schemas']
const peer = id(800),
  alliance = id(900)
const contact = (): S['SocialContact'] => ({
  player: peer,
  username: 'Nova',
  blocked: false,
  request: null,
  requested_by: null,
  accepted: false,
})
const message = (n: number): S['SocialMessage'] => ({
  id: id(1000 + n),
  sequence: String(n),
  sender: peer,
  body: `Message ${n}`,
  sent_at: 1700000000000 + n,
})
async function fixture(page: Page, count = 65) {
  await installGameFixture(page, {
    protocol: 4,
    missions: {
      fleets: [],
      incoming: [],
      score_value_micro: '0',
      fleet_slots: '1',
    },
  })
  let c = contact(),
    messages = Array.from({ length: count }, (_, i) => message(i + 1)),
    hidden = false,
    read = 0,
    failNext = false
  const requests: S['SocialQuery'][] = [],
    commands: S['SocialCommandRequest'][] = []
  let extras: S['SocialConversation'][] = []
  let circulars: S['SocialCircular'][] = []
  await page.route('**/alliances/query', (route) => {
    const { context } = route.request().postDataJSON()
    return route.fulfill({
      json: {
        ...context,
        sampled_at: 1700000000000,
        directory: [],
        directory_count: 0,
        applications: [],
        alliance: {
          summary: {
            id: alliance,
            universe: binding.universe,
            name: 'Starlight',
            tag: 'STAR',
            member_count: 2,
            recruitment: 'Open',
          },
          public_text: '',
          revision: 1,
          leader: binding.player,
          permissions: ['SendCircular'],
          grantable_permissions: [],
        },
      },
    })
  })
  let historyGate: Promise<void> | undefined,
    failHistory = false
  await page.route('**/social/query', async (route) => {
    const { context, query: q } = route
      .request()
      .postDataJSON() as S['SocialQueryRequest']
    requests.push(q)
    const result: S['SocialView'] = {
      ...context,
      conversations: [],
      messages: [],
      circulars: [],
      contacts: [],
      contact: null,
      next_cursor: null,
    }
    if (q.type === 'Messages') {
      const gate = historyGate
      historyGate = undefined
      await gate
      if (failHistory) {
        failHistory = false
        return route.fulfill({ status: 503, json: { code: 'Unavailable' } })
      }
      result.contact = { ...c }
      const index = q.before
        ? messages.findIndex((m) => m.id === q.before)
        : q.after
          ? messages.findIndex((m) => m.id === q.after)
          : -1
      const filtered = q.before
        ? messages.slice(0, index)
        : q.after
          ? messages.slice(index + 1)
          : messages
      result.messages = q.after
        ? filtered.slice(0, q.limit)
        : filtered.slice(-q.limit)
      if (filtered.length > q.limit)
        result.next_cursor = q.after
          ? result.messages.at(-1)!.id
          : result.messages[0].id
    }
    if (q.type === 'Conversations' && !hidden && messages.length)
      result.conversations = [
        {
          contact: { ...c },
          latest: messages.at(-1)!,
          unread: messages.some(
            (m) => m.sender !== binding.player && Number(m.sequence) > read,
          ),
        },
      ]
    if (q.type === 'Conversations') result.conversations.push(...extras)
    if (
      q.type === 'Contacts' &&
      (q.kind === 'Blocks'
        ? c.blocked
        : q.kind === 'Friends'
          ? c.accepted
          : !!c.request && !c.accepted)
    )
      result.contacts = [{ ...c }]
    if (q.type === 'Circulars') result.circulars = circulars
    return route.fulfill({ json: result })
  })
  await page.route('**/social/commands', (route) => {
    const req = route.request().postDataJSON() as S['SocialCommandRequest']
    commands.push(req)
    const a = req.action
    if (failNext && a.type === 'Send') {
      failNext = false
      return route.fulfill({ status: 503, json: { code: 'Unavailable' } })
    }
    let sent: string | null = null
    if (a.type === 'Send') {
      const m = {
        ...message(messages.length + 1),
        sender: binding.player,
        body: a.body,
      }
      messages.push(m)
      sent = m.id
      hidden = false
    }
    if (a.type === 'Read')
      read = Number(messages.find((m) => m.id === a.message)!.sequence)
    if (a.type === 'Hide') hidden = true
    if (a.type === 'RequestFriend')
      c = { ...c, request: id(3000), requested_by: binding.player }
    if (a.type === 'AcceptFriend') c = { ...c, accepted: true }
    if (a.type === 'RemoveFriend')
      c = { ...c, request: null, requested_by: null, accepted: false }
    if (a.type === 'Block')
      c = {
        ...c,
        blocked: true,
        request: null,
        requested_by: null,
        accepted: false,
      }
    if (a.type === 'Unblock') c = { ...c, blocked: false }
    if (a.type === 'Circular') {
      sent = id(4000 + circulars.length)
      circulars = [
        {
          id: sent,
          alliance,
          alliance_name: 'Starlight',
          alliance_tag: 'STAR',
          sender: binding.player,
          sender_name: 'Commander',
          body: a.body,
          sent_at: 1700000000000,
          read: true,
        },
        ...circulars,
      ]
    }
    if (a.type === 'ReadCircular')
      circulars = circulars.map((m) =>
        m.id === a.circular ? { ...m, read: true } : m,
      )
    if (a.type === 'HideCircular')
      circulars = circulars.filter((m) => m.id !== a.circular)
    return route.fulfill({
      json: { command_id: req.command_id, message: sent },
    })
  })
  return {
    requests,
    commands,
    seed: (
      items: S['SocialMessage'][],
      others: S['SocialConversation'][] = [],
    ) => {
      messages = items
      extras = others
    },
    holdHistory: () => {
      let release!: () => void
      historyGate = new Promise<void>((resolve) => {
        release = resolve
      })
      return release
    },
    failHistory: () => {
      failHistory = true
    },
    failSend: () => {
      failNext = true
    },
    incoming: () => {
      messages.push(message(messages.length + 1))
      hidden = false
    },
    invite: () => {
      c = { ...c, request: id(3001), requested_by: peer }
    },
  }
}

async function chooseCategory(page: Page, name: string) {
  const dropdown = page.getByRole('button', {
    name: 'Message categories',
    exact: true,
  })
  if ((page.viewportSize()?.width ?? 1280) <= 767) {
    await dropdown.click()
    await page.getByRole('menuitemradio', { name, exact: true }).click()
  } else {
    await page.getByRole('button', { name, exact: true }).click()
  }
}

test('conversation action announces unread state and clears it after reading', async ({
  page,
}) => {
  await fixture(page)
  await withSocialResponse(page, 'Conversations', () =>
    page.goto('/u/andromeda/messages'),
  )
  const action = page.getByRole('button', {
    name: /^Open conversation with Nova/,
  })
  await expect(action).toHaveAccessibleName(
    'Open conversation with Nova · Unread',
  )
  await action.click()
  await expect(
    page.getByLabel('Message history').getByText('Message 65', { exact: true }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Back to conversations', exact: true })
    .click()
  await expect(action).toHaveAccessibleName('Open conversation with Nova')
  await expect(action).not.toContainText('Unread')
})

test('mobile friends and one-way circulars', async ({ page }) => {
  const f = await fixture(page)
  f.invite()
  await page.setViewportSize({ width: 390, height: 844 })
  await withSocialResponse(page, 'Conversations', () =>
    page.goto('/u/andromeda/messages'),
  )
  await chooseCategory(page, 'Requests')
  await page
    .getByRole('button', { name: 'Contact options for Nova', exact: true })
    .click()
  await page
    .getByRole('menuitem', { name: 'Accept friend', exact: true })
    .click()
  await chooseCategory(page, 'Friends')
  await page
    .getByRole('button', { name: 'Contact options for Nova', exact: true })
    .click()
  await expect(
    page.getByRole('menuitem', { name: 'Remove friend' }),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Message Nova', exact: true }).click()
  await expect(page.getByLabel('Message', { exact: true })).toBeVisible()
  await page
    .getByRole('button', { name: 'Back to conversations', exact: true })
    .click()
  await chooseCategory(page, 'Circulars')
  await page.getByLabel('Alliance announcement').fill('**Meet at the outpost**')
  await page.getByRole('button', { name: 'Send circular', exact: true }).click()
  await expect(
    page.locator('strong', { hasText: 'Meet at the outpost' }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: /reply all/i })).toHaveCount(0)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await diagnosticScreenshot(page, {
    path: 'test-results/social-mobile.png',
    fullPage: true,
  })
})

test('new messages arrive incrementally and hiding preserves history', async ({
  page,
}) => {
  const f = await fixture(page)
  await withSocialResponse(page, 'Messages', () =>
    page.goto(`/u/andromeda/messages?player=${peer}`),
  )
  await expect(
    page.getByLabel('Message history').getByText('Message 65', { exact: true }),
  ).toBeVisible()
  f.incoming()
  await expect(
    page.getByLabel('Message history').getByText('Message 66', { exact: true }),
  ).toBeVisible({ timeout: 15000 })
  expect(
    f.requests.some((q) => q.type === 'Messages' && q.after === id(1065)),
  ).toBe(true)
  await page
    .getByRole('button', { name: 'Conversation options', exact: true })
    .click()
  await page
    .getByRole('menuitem', { name: 'Hide conversation', exact: true })
    .click()
  await expect(page.getByText(/No conversations yet/)).toBeVisible()
  await withSocialResponse(page, 'Messages', () =>
    page.goto(`/u/andromeda/messages?player=${peer}`),
  )
  await expect(
    page.getByLabel('Message history').getByText('Message 66', { exact: true }),
  ).toBeVisible()
  await diagnosticScreenshot(page, {
    path: 'test-results/social-desktop.png',
    fullPage: true,
  })
})

test('empty history stays loaded during polling and displays the first incoming message', async ({
  page,
}) => {
  await page.clock.install()
  await page.clock.pauseAt(new Date())
  const f = await fixture(page, 0)
  await withSocialResponse(page, 'Messages', () =>
    page.goto(`/u/andromeda/messages?player=${peer}`),
  )
  await expect(page.getByText('Start your conversation.')).toBeVisible()
  const composer = page.getByLabel('Message', { exact: true })
  await composer.fill('First draft')
  const before = await composer.boundingBox()
  const release = f.holdHistory()
  await page.clock.runFor(5000)
  await expect
    .poll(() => f.requests.filter((q) => q.type === 'Messages').length)
    .toBe(2)
  await expect(page.getByText('Loading messages…')).toHaveCount(0)
  expect(await composer.boundingBox()).toEqual(before)
  release()
  await expect(page.getByText('Start your conversation.')).toBeVisible()
  f.incoming()
  await page.clock.runFor(5000)
  await expect(
    page.getByLabel('Message history').getByText('Message 1', { exact: true }),
  ).toBeVisible()
  await expect(composer).toHaveValue('First draft')
  await expect(composer).toBeFocused()
})

test('initial and background history errors remain visible and Refresh retries', async ({
  page,
}) => {
  await page.clock.install()
  await page.clock.pauseAt(new Date())
  const f = await fixture(page)
  f.failHistory()
  await page.goto(`/u/andromeda/messages?player=${peer}`)
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByText('Loading messages…')).toHaveCount(0)
  const release = f.holdHistory()
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(page.getByText('Loading messages…')).toBeVisible()
  release()
  const history = page.getByLabel('Message history')
  await expect(history.getByText('Message 65', { exact: true })).toBeVisible()
  const composer = page.getByLabel('Message', { exact: true })
  await composer.fill('Keep this after a failed poll')
  f.failHistory()
  await page.clock.runFor(5000)
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(history.getByText('Message 65', { exact: true })).toBeVisible()
  await expect(composer).toBeFocused()
  await expect(composer).toHaveValue('Keep this after a failed poll')
  await expect(composer).toBeEnabled()
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Load older messages' }),
  ).toBeEnabled()
  await expect(composer).toHaveValue('Keep this after a failed poll')
})

// Application gate: command wiring plus the direct-message route and its return link.
// Isolated components own layout, draft editing, menus and keyboard permutations.
for (const width of [1440, 390]) {
  test(`submits a direct message from its deep link and returns to the conversation list at ${width}px`, { tag: (width === 390) ? '@journey' : [] }, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    const f = await fixture(page, 1)
    await withSocialResponse(page, 'Messages', () =>
      page.goto(`/u/andromeda/messages?player=${peer}`),
    )
    await expect(
      page.getByRole('button', { name: 'Send message', exact: true }),
    ).toBeInViewport()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await page
      .getByLabel('Message', { exact: true })
      .fill('Meet at the outpost.')
    await withSocialResponse(page, 'Messages', () =>
      page.getByRole('button', { name: 'Send message', exact: true }).click(),
    )
    await expect(
      page
        .getByLabel('Message history')
        .getByText('Meet at the outpost.', { exact: true }),
    ).toBeVisible()
    await expect(page.getByLabel('Message', { exact: true })).toHaveValue('')
    await page
      .getByRole('button', { name: 'Back to conversations', exact: true })
      .click()
    await expect(page).not.toHaveURL(/player=/)
    await expect(
      page.getByRole('button', { name: /Open conversation with Nova/ }),
    ).toContainText('Meet at the outpost.')
    expect(
      f.commands.filter((command) => command.action.type === 'Send'),
    ).toHaveLength(1)
  })
}

// Controller tests cannot establish that the application installs its polling timer.
test('application polls message history at five seconds without replacing the loaded thread', async ({
  page,
}) => {
  const now = new Date('2026-10-31T14:20:00Z')
  await page.clock.install({ time: now })
  await page.clock.pauseAt(now)
  const f = await fixture(page)
  const releaseInitial = f.holdHistory()
  await page.goto(`/u/andromeda/messages?player=${peer}`)
  await expect(
    page.getByText('Loading messages…', { exact: true }),
  ).toBeVisible()
  await withSocialResponse(page, 'Messages', async () => releaseInitial())
  await expect(
    page.getByLabel('Message history').getByText('Message 65', { exact: true }),
  ).toBeVisible()
  const releasePoll = f.holdHistory()
  const count = f.requests.filter((query) => query.type === 'Messages').length
  try {
    await page.clock.runFor(4999)
    expect(
      f.requests.filter((query) => query.type === 'Messages'),
    ).toHaveLength(count)
    await page.clock.runFor(1)
    await expect
      .poll(
        () => f.requests.filter((query) => query.type === 'Messages').length,
      )
      .toBe(count + 1)
    await expect(
      page.getByText('Loading messages…', { exact: true }),
    ).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: 'Load older messages' }),
    ).toBeEnabled()
    await withSocialResponse(page, 'Messages', async () => releasePoll())
  } finally {
    releasePoll()
  }
  expect(
    f.requests
      .filter((query) => query.type === 'Messages')
      .every((query) => query.limit === 50),
  ).toBe(true)
  await expect(
    page.getByLabel('Message history').getByText('Message 65', { exact: true }),
  ).toBeVisible()
})
