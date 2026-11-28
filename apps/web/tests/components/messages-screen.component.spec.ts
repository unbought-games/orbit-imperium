import { test, expect } from './fixture'
import { id } from '../../src/test-support/bootstrap'
import type {} from './messages-screen.scenario'
const epoch = new Date('2026-10-31T14:20:00Z')
test('Messages refreshes an open thread on invalidation and recovers a missed wake without losing the draft', async ({
  page,
}) => {
  await page.clock.pauseAt(epoch)
  await page.goto('/?scenario=messages-screen&failure=1')
  await expect(page.locator('html')).toHaveAttribute(
    'data-component-ready',
    'messages-screen',
  )
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(
    page.getByText('Loading messages…', { exact: true }),
  ).toHaveCount(0)
  const refresh = page.getByRole('button', { name: 'Refresh', exact: true })
  await page.evaluate(() => window.messagesScreen.hold())
  try {
    await refresh.click()
    await expect(
      page.getByText('Loading messages…', { exact: true }),
    ).toBeVisible()
  } finally {
    await page.evaluate(() => window.messagesScreen.release())
  }
  const history = page.getByLabel('Message history'),
    composer = page.getByLabel('Message', { exact: true })
  await expect(history.getByText('Message 2', { exact: true })).toBeVisible()
  // Read-position writes are a separate asynchronous phase before polling.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.messagesScreen.commands.filter((c) => c.type === 'Read')
            .length,
      ),
    )
    .toBe(1)
  await expect(composer).toBeEnabled()
  await composer.fill('Keep this draft')
  const counts = () =>
    page.evaluate(() => ({
      history: window.messagesScreen.requests.filter(
        (q) => q.type === 'Messages',
      ).length,
      inbox: window.messagesScreen.requests.filter(
        (q) => q.type === 'Conversations',
      ).length,
    }))
  const lastCursor = () =>
    page.evaluate(
      () =>
        window.messagesScreen.requests
          .filter((q) => q.type === 'Messages')
          .at(-1)?.after,
    )
  const before = await counts()
  await page.evaluate(() => {
    window.messagesScreen.hold()
    window.messagesScreen.fail()
  })
  try {
    await page.clock.fastForward(119_999)
    expect(await counts()).toEqual(before)
    await page.evaluate(() => window.messagesScreen.invalidate())
    await expect
      .poll(counts)
      .toEqual({ history: before.history + 1, inbox: before.inbox + 1 })
    expect(await lastCursor()).toBe(id(1002))
    await expect(history.getByText('Message 2', { exact: true })).toBeVisible()
    await expect(
      page.getByText('Loading messages…', { exact: true }),
    ).toHaveCount(0)
  } finally {
    await page.evaluate(() => window.messagesScreen.release())
  }
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(composer).toBeFocused()
  await expect(composer).toHaveValue('Keep this draft')
  await page.evaluate(() => window.messagesScreen.incoming())
  await refresh.click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(history.getByText('Message 3', { exact: true })).toBeVisible()
  await expect(composer).toHaveValue('Keep this draft')
  expect(await lastCursor()).toBe(id(1002))
  // The next delivery has no invalidation. After the prior read has settled,
  // the fallback must fetch only new messages and leave the composer alone.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.messagesScreen.commands.filter((c) => c.type === 'Read')
            .length,
      ),
    )
    .toBe(2)
  const settled = await counts()
  await page.evaluate(() => window.messagesScreen.incoming())
  await page.clock.runFor(1)
  await expect
    .poll(counts)
    .toEqual({ history: settled.history + 1, inbox: settled.inbox + 1 })
  await expect(history.getByText('Message 4', { exact: true })).toBeVisible()
  await expect(composer).toHaveValue('Keep this draft')
  expect(await lastCursor()).toBe(id(1003))
})

test('reading the delivered conversation clears its accessible unread action and hiding removes the list row', async ({
  page,
}) => {
  await page.goto('/?scenario=messages-screen&list=1')
  await expect(page.locator('html')).toHaveAttribute(
    'data-component-ready',
    'messages-screen',
  )
  const open = page.getByRole('button', { name: /Open conversation with Nova/ })
  await expect(open).toHaveAccessibleName(
    'Open conversation with Nova · Unread',
  )
  await open.click()
  await expect(
    page.getByLabel('Message history').getByText('Message 2', { exact: true }),
  ).toBeVisible()
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.messagesScreen.commands.filter((c) => c.type === 'Read'),
      ),
    )
    .toEqual([{ type: 'Read', player: id(800), message: id(1002) }])
  await page
    .getByRole('button', { name: 'Back to conversations', exact: true })
    .click()
  await expect(open).toHaveAccessibleName('Open conversation with Nova')
  await expect(open).not.toContainText('Unread')
  await open.click()
  await page
    .getByRole('button', { name: 'Conversation options', exact: true })
    .click()
  await page
    .getByRole('menuitem', { name: 'Hide conversation', exact: true })
    .click()
  await expect(page.getByText(/No conversations yet/)).toBeVisible()
  expect(
    await page.evaluate(() =>
      window.messagesScreen.commands.filter((c) => c.type === 'Hide'),
    ),
  ).toHaveLength(1)
})

test('saved message recovery refreshes the mounted thread without losing a newer draft', async ({page}) => {
  await page.goto('/?scenario=messages-screen&recovery=1')
  await expect(page.locator('html')).toHaveAttribute('data-component-ready', 'messages-screen')
  const history = page.getByLabel('Message history')
  await expect(history.getByText('Message 2', {exact: true})).toBeVisible()
  const draft = page.getByLabel('Message', {exact: true})
  await draft.fill('Keep my newer draft')
  await page.evaluate(() => window.messagesScreen.recover())
  await expect(history.getByText('Recovered message', {exact: true})).toBeVisible()
  await expect(draft).toHaveValue('Keep my newer draft')
  expect(await page.evaluate(() => window.messagesScreen.commands.filter(c => c.type === 'Send'))).toHaveLength(2)
})
