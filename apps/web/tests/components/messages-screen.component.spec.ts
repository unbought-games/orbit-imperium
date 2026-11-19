import { test, expect } from './fixture'
import { id } from '../../src/test-support/bootstrap'
import type {} from './messages-screen.scenario'
const epoch = new Date('2026-10-31T14:20:00Z')
test('the real Messages screen retries its initial refusal and polls a settled open thread every five seconds', async ({
  page,
}) => {
  await page.clock.install({ time: epoch })
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
  const before = await page.evaluate(
    () =>
      window.messagesScreen.requests.filter((q) => q.type === 'Messages')
        .length,
  )
  await page.evaluate(() => {
    window.messagesScreen.hold()
    window.messagesScreen.fail()
  })
  try {
    await page.clock.runFor(4999)
    expect(
      await page.evaluate(
        () =>
          window.messagesScreen.requests.filter((q) => q.type === 'Messages')
            .length,
      ),
    ).toBe(before)
    await page.clock.runFor(1)
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.messagesScreen.requests.filter((q) => q.type === 'Messages')
              .length,
        ),
      )
      .toBe(before + 1)
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
  expect(
    await page.evaluate(
      () =>
        window.messagesScreen.requests
          .filter((q) => q.type === 'Messages')
          .at(-1)?.after,
    ),
  ).toBe(id(1002))
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
  await expect(open).toHaveAccessibleName('Open conversation with Nova · Unread')
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
